import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import sharp from 'sharp'

export type ContactSheetParameter = boolean | null | number | string | readonly ContactSheetParameter[] | { readonly [key: string]: ContactSheetParameter }
export type ContactSheetParameters = { readonly [key: string]: ContactSheetParameter }

export type ContactSheetAxis = {
  key: string
  label: string
}

export type ContactSheetCell = {
  rowKey: string
  columnKey: string
  input: string
  caption: string
  parameters: ContactSheetParameters
}

export type ContactSheetInput = {
  title: string
  rows: readonly ContactSheetAxis[]
  columns: readonly ContactSheetAxis[]
  cells: readonly ContactSheetCell[]
}

export type ContactSheetOptions = {
  inputRoot: string
  outputDirectory: string
  workingDirectory: string
  gitCommit: string
  command: string
}

export type ContactSheetLayout = {
  canvas: { width: number; height: number }
  sourceImage: { width: number; height: number }
  cellImage: { width: number; height: number }
  title: string
  rowLabels: readonly string[]
  columnLabels: readonly string[]
  captions: readonly string[]
}

export type ContactSheetManifest = {
  schema: 'contact-sheet-manifest-v1'
  normalized_input: ContactSheetInput
  sources: readonly {
    row_key: string
    column_key: string
    input: string
    sha256: string
    width: number
    height: number
    parameters: ContactSheetParameters
  }[]
  output: {
    png: string
    png_sha256: string
    manifest: string
    image: { width: number; height: number }
    source_image: { width: number; height: number }
  }
  git_commit: string
  command: string
}

export type ContactSheetResult = {
  pngPath: string
  manifestPath: string
  png: Buffer
  manifest: ContactSheetManifest
  layout: ContactSheetLayout
}

export type AtomicOperations = Pick<typeof fs, 'access' | 'mkdir' | 'readFile' | 'rename' | 'rm' | 'writeFile'>

const CELL_WIDTH = 400
const LEFT_LABEL_WIDTH = 180
const MARGIN = 24
const TITLE_HEIGHT = 52
const COLUMN_LABEL_HEIGHT = 40
const CAPTION_HEIGHT = 88
const TEXT_COLOR = '#f4f4f5'
const MUTED_TEXT_COLOR = '#c4c4cc'

function fail(message: string): never {
  throw new Error(`contact-sheet: ${message}`)
}

function assertText(value: unknown, location: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${location} must be a non-empty string`)
}

function assertParameters(value: unknown, location: string, ancestors: WeakSet<object> = new WeakSet<object>()): asserts value is ContactSheetParameter {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${location} must not contain NaN or Infinity`)
    return
  }
  if (typeof value === 'object') {
    if (ancestors.has(value)) fail(`${location} must not contain circular values`)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) {
      fail(`${location} must contain plain JSON objects only`)
    }
    ancestors.add(value)
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertParameters(item, `${location}[${index}]`, ancestors))
    } else {
      for (const [key, item] of Object.entries(value)) assertParameters(item, `${location}.${key}`, ancestors)
    }
    ancestors.delete(value)
    return
  }
  fail(`${location} must contain JSON-safe values only`)
}

function assertAxis(axis: readonly ContactSheetAxis[], name: 'rows' | 'columns'): Map<string, ContactSheetAxis> {
  if (axis.length === 0) fail(`${name} must not be empty`)
  const values = new Map<string, ContactSheetAxis>()
  axis.forEach((entry, index) => {
    assertText(entry?.key, `${name}[${index}].key`)
    assertText(entry?.label, `${name}[${index}].label`)
    if (values.has(entry.key)) fail(`duplicate ${name.slice(0, -1)} key "${entry.key}" at ${name}[${index}]`)
    values.set(entry.key, { key: entry.key, label: entry.label })
  })
  return values
}

export function validateContactSheetInput(input: ContactSheetInput): void {
  assertText(input?.title, 'title')
  if (!Array.isArray(input?.rows) || !Array.isArray(input?.columns) || !Array.isArray(input?.cells)) {
    fail('rows, columns, and cells must be arrays')
  }
  const rows = assertAxis(input.rows, 'rows')
  const columns = assertAxis(input.columns, 'columns')
  const cells = new Set<string>()
  input.cells.forEach((cell, index) => {
    assertText(cell?.rowKey, `cells[${index}].rowKey`)
    assertText(cell?.columnKey, `cells[${index}].columnKey`)
    assertText(cell?.input, `cells[${index}].input`)
    assertText(cell?.caption, `cells[${index}].caption`)
    if (!rows.has(cell.rowKey)) fail(`cells[${index}].rowKey "${cell.rowKey}" is not a declared row`)
    if (!columns.has(cell.columnKey)) fail(`cells[${index}].columnKey "${cell.columnKey}" is not a declared column`)
    const key = `${cell.rowKey}\u0000${cell.columnKey}`
    if (cells.has(key)) fail(`duplicate cell at row "${cell.rowKey}", column "${cell.columnKey}"`)
    cells.add(key)
    assertParameters(cell.parameters, `cells[${index}].parameters`)
  })
  for (const row of input.rows) {
    for (const column of input.columns) {
      if (!cells.has(`${row.key}\u0000${column.key}`)) fail(`missing cell at row "${row.key}", column "${column.key}"`)
    }
  }
  if (input.cells.length !== input.rows.length * input.columns.length) fail('cells contain entries outside the declared matrix')
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function relativePath(root: string, target: string): string {
  return path.relative(root, target).replaceAll('\\', '/') || '.'
}

function normalizedInput(input: ContactSheetInput, sources: readonly SourceImage[], workingDirectory: string): ContactSheetInput {
  return {
    title: input.title,
    rows: input.rows.map((row) => ({ key: row.key, label: row.label })),
    columns: input.columns.map((column) => ({ key: column.key, label: column.label })),
    cells: sources.map((source) => ({
      rowKey: source.cell.rowKey,
      columnKey: source.cell.columnKey,
      input: relativePath(workingDirectory, source.path),
      caption: source.cell.caption,
      parameters: source.cell.parameters,
    })),
  }
}

export function createContactSheetSvg(layout: ContactSheetLayout): Buffer {
  const cellHeight = layout.cellImage.height + CAPTION_HEIGHT
  const labels = [
    `<text x="${MARGIN}" y="${MARGIN + 34}" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="28" font-weight="700">${escapeXml(layout.title)}</text>`,
    ...layout.columnLabels.map((label, index) => `<text x="${LEFT_LABEL_WIDTH + MARGIN + index * CELL_WIDTH + 12}" y="${MARGIN + TITLE_HEIGHT + 27}" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="18" font-weight="600">${escapeXml(label)}</text>`),
    ...layout.rowLabels.map((label, index) => {
      const y = MARGIN + TITLE_HEIGHT + COLUMN_LABEL_HEIGHT + index * cellHeight + Math.floor(layout.cellImage.height / 2)
      return `<text x="${MARGIN}" y="${y}" fill="${TEXT_COLOR}" font-family="sans-serif" font-size="18" font-weight="600">${escapeXml(label)}</text>`
    }),
    ...layout.captions.map((caption, index) => {
      const row = Math.floor(index / layout.columnLabels.length)
      const column = index % layout.columnLabels.length
      const x = LEFT_LABEL_WIDTH + MARGIN + column * CELL_WIDTH + 12
      const y = MARGIN + TITLE_HEIGHT + COLUMN_LABEL_HEIGHT + row * cellHeight + layout.cellImage.height + 23
      const lines = caption.split('\n')
      return `<text x="${x}" y="${y}" fill="${MUTED_TEXT_COLOR}" font-family="sans-serif" font-size="14">${lines.map((line, lineIndex) => `<tspan x="${x}" dy="${lineIndex === 0 ? 0 : 16}">${escapeXml(line)}</tspan>`).join('')}</text>`
    }),
  ]
  return Buffer.from(`<svg width="${layout.canvas.width}" height="${layout.canvas.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111113"/>${labels.join('')}</svg>`)
}

type SourceImage = {
  cell: ContactSheetCell
  path: string
  bytes: Buffer
  sha256: string
  width: number
  height: number
}

async function loadSources(input: ContactSheetInput, inputRoot: string): Promise<SourceImage[]> {
  const sourcesByCell = new Map<string, SourceImage>()
  for (let index = 0; index < input.cells.length; index += 1) {
    const cell = input.cells[index]!
    const file = path.resolve(inputRoot, cell.input)
    try {
      await fs.access(file)
    } catch {
      fail(`cells[${index}].input does not exist: ${cell.input}`)
    }
    let bytes: Buffer
    let metadata: sharp.Metadata
    try {
      bytes = await fs.readFile(file)
      metadata = await sharp(bytes, { failOn: 'error' }).metadata()
    } catch (error) {
      fail(`cells[${index}].input is not a valid PNG: ${cell.input} (${error instanceof Error ? error.message : String(error)})`)
    }
    if (metadata.format !== 'png' || !metadata.width || !metadata.height) fail(`cells[${index}].input is not a valid PNG: ${cell.input}`)
    sourcesByCell.set(`${cell.rowKey}\u0000${cell.columnKey}`, { cell, path: file, bytes, sha256: sha256(bytes), width: metadata.width, height: metadata.height })
  }
  const sources = input.rows.flatMap((row) => input.columns.map((column) => sourcesByCell.get(`${row.key}\u0000${column.key}`)!))
  const first = sources[0]!
  for (const source of sources.slice(1)) {
    if (source.width * first.height !== source.height * first.width) {
      fail(`cells input aspect ratio differs: ${source.cell.input} differs from ${first.cell.input}`)
    }
    if (source.width !== first.width || source.height !== first.height) {
      fail(`cells input dimensions differ: ${source.cell.input} is ${source.width}x${source.height}, expected ${first.width}x${first.height} from ${first.cell.input}`)
    }
  }
  return sources
}

function layoutFor(input: ContactSheetInput, source: SourceImage): ContactSheetLayout {
  const imageHeight = Math.round(CELL_WIDTH * source.height / source.width)
  const rowHeight = imageHeight + CAPTION_HEIGHT
  return {
    canvas: {
      width: LEFT_LABEL_WIDTH + input.columns.length * CELL_WIDTH + MARGIN * 2,
      height: TITLE_HEIGHT + COLUMN_LABEL_HEIGHT + input.rows.length * rowHeight + MARGIN * 2,
    },
    sourceImage: { width: source.width, height: source.height },
    cellImage: { width: CELL_WIDTH, height: imageHeight },
    title: input.title,
    rowLabels: input.rows.map((row) => row.label),
    columnLabels: input.columns.map((column) => column.label),
    captions: input.rows.flatMap((row) => input.columns.map((column) => input.cells.find((cell) => cell.rowKey === row.key && cell.columnKey === column.key)!.caption)),
  }
}

async function renderPng(input: ContactSheetInput, sources: readonly SourceImage[], layout: ContactSheetLayout): Promise<Buffer> {
  const byCell = new Map(sources.map((source) => [`${source.cell.rowKey}\u0000${source.cell.columnKey}`, source]))
  const rowHeight = layout.cellImage.height + CAPTION_HEIGHT
  const composites = await Promise.all(input.rows.flatMap((row, rowIndex) => input.columns.map(async (column, columnIndex) => {
    const source = byCell.get(`${row.key}\u0000${column.key}`)!
    return {
      input: await sharp(source.bytes).resize(layout.cellImage.width, layout.cellImage.height, { fit: 'fill' }).png().toBuffer(),
      left: LEFT_LABEL_WIDTH + MARGIN + columnIndex * layout.cellImage.width,
      top: MARGIN + TITLE_HEIGHT + COLUMN_LABEL_HEIGHT + rowIndex * rowHeight,
    }
  })))
  return sharp({
    create: { width: layout.canvas.width, height: layout.canvas.height, channels: 4, background: '#111113' },
  }).composite([{ input: createContactSheetSvg(layout), left: 0, top: 0 }, ...composites]).png().toBuffer()
}

async function restorePair(finalPath: string, backupPath: string | undefined, operations: AtomicOperations): Promise<void> {
  await operations.rm(finalPath, { force: true }).catch(() => undefined)
  if (backupPath) await operations.rename(backupPath, finalPath).catch(() => undefined)
}

async function writePairAtomically(pngPath: string, manifestPath: string, png: Buffer, manifest: ContactSheetManifest, operations: AtomicOperations = fs): Promise<void> {
  const directory = path.dirname(pngPath)
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const pngTemp = path.join(directory, `.${path.basename(pngPath)}.${stamp}.tmp`)
  const manifestTemp = path.join(directory, `.${path.basename(manifestPath)}.${stamp}.tmp`)
  const pngBackup = path.join(directory, `.${path.basename(pngPath)}.${stamp}.bak`)
  const manifestBackup = path.join(directory, `.${path.basename(manifestPath)}.${stamp}.bak`)
  let previousPng: string | undefined
  let previousManifest: string | undefined
  let pngCommitted = false
  let manifestCommitted = false
  try {
    await operations.mkdir(directory, { recursive: true })
    await operations.writeFile(pngTemp, png, { flag: 'wx' })
    await operations.writeFile(manifestTemp, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
    if (await operations.access(pngPath).then(() => true).catch(() => false)) {
      await operations.rename(pngPath, pngBackup)
      previousPng = pngBackup
    }
    if (await operations.access(manifestPath).then(() => true).catch(() => false)) {
      await operations.rename(manifestPath, manifestBackup)
      previousManifest = manifestBackup
    }
    await operations.rename(pngTemp, pngPath)
    pngCommitted = true
    await operations.rename(manifestTemp, manifestPath)
    manifestCommitted = true
  } catch (error) {
    if (pngCommitted || previousPng) await restorePair(pngPath, previousPng, operations)
    if (manifestCommitted || previousManifest) await restorePair(manifestPath, previousManifest, operations)
    throw new Error(`contact-sheet: atomic output failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await Promise.all([operations.rm(pngTemp, { force: true }), operations.rm(manifestTemp, { force: true })])
  }
  await Promise.all([operations.rm(pngBackup, { force: true }).catch(() => undefined), operations.rm(manifestBackup, { force: true }).catch(() => undefined)])
}

export async function generateContactSheet(input: ContactSheetInput, options: ContactSheetOptions, operations: AtomicOperations = fs): Promise<ContactSheetResult> {
  validateContactSheetInput(input)
  assertText(options.gitCommit, 'gitCommit')
  assertText(options.command, 'command')
  const sources = await loadSources(input, options.inputRoot)
  const normalized = normalizedInput(input, sources, options.workingDirectory)
  const layout = layoutFor(input, sources[0]!)
  const png = await renderPng(input, sources, layout)
  const pngPath = path.join(options.outputDirectory, 'contact-sheet.png')
  const manifestPath = path.join(options.outputDirectory, 'contact-sheet.manifest.json')
  const manifest: ContactSheetManifest = {
    schema: 'contact-sheet-manifest-v1',
    normalized_input: normalized,
    sources: sources.map((source) => ({
      row_key: source.cell.rowKey,
      column_key: source.cell.columnKey,
      input: relativePath(options.workingDirectory, source.path),
      sha256: source.sha256,
      width: source.width,
      height: source.height,
      parameters: source.cell.parameters,
    })),
    output: {
      png: relativePath(options.outputDirectory, pngPath),
      png_sha256: sha256(png),
      manifest: relativePath(options.outputDirectory, manifestPath),
      image: layout.canvas,
      source_image: layout.sourceImage,
    },
    git_commit: options.gitCommit,
    command: options.command,
  }
  await writePairAtomically(pngPath, manifestPath, png, manifest, operations)
  return { pngPath, manifestPath, png, manifest, layout }
}