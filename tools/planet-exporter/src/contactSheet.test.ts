import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createContactSheetSvg,
  generateContactSheet,
  validateContactSheetInput,
  type AtomicOperations,
  type ContactSheetInput,
} from './contactSheet.js'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-contact-sheet-'))
  temporaryDirectories.push(directory)
  return directory
}

async function writePng(directory: string, name: string, width = 24, height = 16, color: string = '#8648d8'): Promise<string> {
  const file = path.join(directory, name)
  await sharp({ create: { width, height, channels: 4, background: color } }).png().toFile(file)
  return file
}

function input(cells: ContactSheetInput['cells']): ContactSheetInput {
  return {
    title: 'Rating <matrix>',
    rows: [{ key: 'low', label: 'Low & steady' }, { key: 'high', label: 'High' }],
    columns: [{ key: 'off', label: 'Bloom off' }, { key: 'on', label: 'Bloom on' }],
    cells,
  }
}

function cell(rowKey: string, columnKey: string, file: string, caption = `${rowKey}/${columnKey}`): ContactSheetInput['cells'][number] {
  return { rowKey, columnKey, input: file, caption, parameters: { rating: rowKey === 'low' ? 4.5 : 8.2, bloom: columnKey === 'on' } }
}

async function matrix(directory: string): Promise<ContactSheetInput> {
  const files = await Promise.all(['low-off.png', 'low-on.png', 'high-off.png', 'high-on.png'].map((name) => writePng(directory, name)))
  return input([
    cell('low', 'off', path.basename(files[0]!)),
    cell('low', 'on', path.basename(files[1]!)),
    cell('high', 'off', path.basename(files[2]!)),
    cell('high', 'on', path.basename(files[3]!)),
  ])
}

function options(directory: string): Parameters<typeof generateContactSheet>[1] {
  return {
    inputRoot: directory,
    outputDirectory: path.join(directory, 'result'),
    workingDirectory: directory,
    gitCommit: 'a'.repeat(40),
    command: 'npm run contact-sheet -- --input matrix.json --output-dir result',
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe('contact sheet', () => {
  it('writes a labelled, hashed 2×2 matrix with relative paths and stable bytes', async () => {
    const directory = await temporaryDirectory()
    const source = await matrix(directory)
    const first = await generateContactSheet(source, options(directory))
    const firstManifest = await fs.readFile(first.manifestPath, 'utf8')
    const second = await generateContactSheet(source, options(directory))
    const png = await fs.readFile(second.pngPath)
    const svg = createContactSheetSvg(second.layout).toString('utf8')

    expect(svg).toContain('Rating &lt;matrix&gt;')
    expect(svg).toContain('Low &amp; steady')
    expect(svg).toContain('Bloom off')
    expect(svg).toContain('low/off')
    expect(second.png).toEqual(first.png)
    expect(await fs.readFile(second.manifestPath, 'utf8')).toBe(firstManifest)
    expect(second.manifest.output.png_sha256).toBe(createHash('sha256').update(png).digest('hex'))
    expect(second.manifest.normalized_input.cells.every((entry) => !path.isAbsolute(entry.input))).toBe(true)
    expect(second.manifest.sources.every((entry) => !path.isAbsolute(entry.input))).toBe(true)
    await expect(sharp(png).metadata()).resolves.toMatchObject({ format: 'png', width: 1028, height: 850 })
  })

  it.each([
    ['missing cell', (file: string) => input([cell('low', 'off', file), cell('low', 'on', file), cell('high', 'off', file)]), 'missing cell at row "high", column "on"'],
    ['duplicate cell', (file: string) => input([cell('low', 'off', file), cell('low', 'off', file), cell('high', 'off', file), cell('high', 'on', file)]), 'duplicate cell'],
    ['unknown row', (file: string) => input([cell('none', 'off', file), cell('low', 'on', file), cell('high', 'off', file), cell('high', 'on', file)]), 'not a declared row'],
    ['unknown column', (file: string) => input([cell('low', 'other', file), cell('low', 'on', file), cell('high', 'off', file), cell('high', 'on', file)]), 'not a declared column'],
  ])('rejects %s before reading images', (_label, makeInput, expected) => {
    expect(() => validateContactSheetInput(makeInput('unused.png'))).toThrow(expected)
  })

  it('rejects duplicate axis keys and unsafe parameter values', () => {
    const duplicateRows = input([])
    duplicateRows.rows = [{ key: 'same', label: 'A' }, { key: 'same', label: 'B' }]
    expect(() => validateContactSheetInput(duplicateRows)).toThrow('duplicate row key')

    const duplicateColumns = input([])
    duplicateColumns.columns = [{ key: 'same', label: 'A' }, { key: 'same', label: 'B' }]
    expect(() => validateContactSheetInput(duplicateColumns)).toThrow('duplicate column key')

    const unsafe = input([cell('low', 'off', 'a.png'), cell('low', 'on', 'b.png'), cell('high', 'off', 'c.png'), { ...cell('high', 'on', 'd.png'), parameters: { invalid: Number.NaN } }])
    expect(() => validateContactSheetInput(unsafe)).toThrow('NaN or Infinity')

    const circular: { self?: unknown } = {}
    circular.self = circular
    const circularParameters = input([cell('low', 'off', 'a.png'), cell('low', 'on', 'b.png'), cell('high', 'off', 'c.png'), { ...cell('high', 'on', 'd.png'), parameters: circular as ContactSheetInput['cells'][number]['parameters'] }])
    expect(() => validateContactSheetInput(circularParameters)).toThrow('circular values')

    const nonJson = input([cell('low', 'off', 'a.png'), cell('low', 'on', 'b.png'), cell('high', 'off', 'c.png'), { ...cell('high', 'on', 'd.png'), parameters: new Date() as unknown as ContactSheetInput['cells'][number]['parameters'] }])
    expect(() => validateContactSheetInput(nonJson)).toThrow('plain JSON objects only')
  })

  it('orders equivalent shuffled cells row-major in the PNG and manifest', async () => {
    const directory = await temporaryDirectory()
    const source = await matrix(directory)
    const ordered = await generateContactSheet(source, { ...options(directory), outputDirectory: path.join(directory, 'ordered') })
    const shuffled = await generateContactSheet({ ...source, cells: [source.cells[3]!, source.cells[1]!, source.cells[2]!, source.cells[0]!] }, { ...options(directory), outputDirectory: path.join(directory, 'shuffled') })

    expect(shuffled.png).toEqual(ordered.png)
    expect(await fs.readFile(shuffled.manifestPath)).toEqual(await fs.readFile(ordered.manifestPath))
    expect(shuffled.manifest.normalized_input.cells.map((entry) => `${entry.rowKey}/${entry.columnKey}`)).toEqual(['low/off', 'low/on', 'high/off', 'high/on'])
    expect(shuffled.manifest.sources.map((entry) => `${entry.row_key}/${entry.column_key}`)).toEqual(['low/off', 'low/on', 'high/off', 'high/on'])
  })

  it('rejects missing files, malformed PNG, inconsistent dimensions, and inconsistent aspect ratios', async () => {
    const directory = await temporaryDirectory()
    const source = await matrix(directory)
    source.cells[0] = cell('low', 'off', 'missing.png')
    await expect(generateContactSheet(source, options(directory))).rejects.toThrow('does not exist')

    await fs.writeFile(path.join(directory, 'bad.png'), 'not png')
    const malformed = await matrix(directory)
    malformed.cells[0] = cell('low', 'off', 'bad.png')
    await expect(generateContactSheet(malformed, options(directory))).rejects.toThrow('not a valid PNG')

    const inconsistentDimensions = await matrix(directory)
    await writePng(directory, 'wide.png', 48, 32)
    inconsistentDimensions.cells[0] = cell('low', 'off', 'wide.png')
    await expect(generateContactSheet(inconsistentDimensions, options(directory))).rejects.toThrow('dimensions differ')

    const inconsistentRatio = await matrix(directory)
    await writePng(directory, 'square.png', 24, 24)
    inconsistentRatio.cells[0] = cell('low', 'off', 'square.png')
    await expect(generateContactSheet(inconsistentRatio, options(directory))).rejects.toThrow('aspect ratio differs')
  })

  it('keeps the new complete pair when backup cleanup fails', async () => {
    const directory = await temporaryDirectory()
    const source = await matrix(directory)
    const configured = options(directory)
    const successful = await generateContactSheet(source, configured)
    const originalPng = await fs.readFile(successful.pngPath)
    const originalManifest = await fs.readFile(successful.manifestPath)
    const cleanupFailingOperations: AtomicOperations = {
      access: fs.access.bind(fs),
      mkdir: fs.mkdir.bind(fs),
      readFile: fs.readFile.bind(fs),
      rename: fs.rename.bind(fs),
      rm: async (target, options) => {
        if (target.endsWith('.bak')) throw new Error('forced backup cleanup failure')
        await fs.rm(target, options)
      },
      writeFile: fs.writeFile.bind(fs),
    }

    const updated = await generateContactSheet({ ...source, title: 'new title' }, configured, cleanupFailingOperations)

    await expect(fs.readFile(updated.pngPath)).resolves.toEqual(updated.png)
    await expect(fs.readFile(updated.manifestPath)).resolves.not.toEqual(originalManifest)
    expect(updated.png).not.toEqual(originalPng)
  })

  it('keeps the last complete pair when the manifest commit fails', async () => {
    const directory = await temporaryDirectory()
    const source = await matrix(directory)
    const configured = options(directory)
    const successful = await generateContactSheet(source, configured)
    const originalPng = await fs.readFile(successful.pngPath)
    const originalManifest = await fs.readFile(successful.manifestPath)
    const failingOperations: AtomicOperations = {
      access: fs.access.bind(fs),
      mkdir: fs.mkdir.bind(fs),
      readFile: fs.readFile.bind(fs),
      rename: async (from, to) => {
        if (to === successful.manifestPath && from.endsWith('.tmp')) throw new Error('forced manifest rename failure')
        await fs.rename(from, to)
      },
      rm: fs.rm.bind(fs),
      writeFile: fs.writeFile.bind(fs),
    }

    await expect(generateContactSheet({ ...source, title: 'changed title' }, configured, failingOperations)).rejects.toThrow('atomic output failed')
    await expect(fs.readFile(successful.pngPath)).resolves.toEqual(originalPng)
    await expect(fs.readFile(successful.manifestPath)).resolves.toEqual(originalManifest)
  })
})