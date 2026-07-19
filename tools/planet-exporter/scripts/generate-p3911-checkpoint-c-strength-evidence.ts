import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { type ExportArgs } from '../src/args.js'
import { writeArtifactsAtomically } from '../src/artifacts.js'
import { getGitCommit, metadataFor, renderInBrowser, type BrowserRender } from '../src/browser.js'
import { type DataSource } from '../src/data-source.js'
import { assertPngSafe } from '../src/png.js'
import { P3911_CHECKPOINT_C_STRENGTHS, renderP3911CheckpointCStrengthInBrowser } from '../src/p3911CheckpointCStrength.js'
import { main as writePhase39Fixtures } from '../src/phase39Fixtures.js'

const root = path.resolve(import.meta.dirname, '../../..')
const output = path.join(root, 'data/runs/phase39-p39.11/checkpoint-c-strength')
const fixtureDirectory = path.join(output, 'fixtures')
const baseline = path.join(root, 'tools/planet-exporter/fixtures/phase39-contract-baseline.json')
const ratings = [0, 4, 5, 10] as const
const strengths = P3911_CHECKPOINT_C_STRENGTHS
const resolution = 3000
const padding = 0.08
const tile = 750
const fixed = { key: 0.35, exponent: 2, intensityMin: 0.06, intensityMax: 0.6, threshold: 0, radius: 1, baselineStrength: 0.005, composition: 'pure-bloom-delta-v1' }

type Diagnostics = { rating: number; emission: number; emission_curve: { exponent: number; intensity_min: number; intensity_max: number }; bloom: { enabled: boolean; composition: string; strength: number; radius: number; threshold: number }; key_light: { intensity: number }; [key: string]: unknown }
type Brightness = { visible_pixels: number; mean_luma_srgb: number; min_luma_srgb: number; max_luma_srgb: number; max_boundary_alpha: number }
type Delta = { changed_pixels: number; added_pixels: number; positive_luma_delta_pixels: number; mean_positive_luma_delta: number }
type EvidenceRow = { column: 'off' | number; rating: number; png: string; sidecar: string; png_sha256: string; visual_config_hash: string; diagnostics: Diagnostics; brightness: Brightness; delta_from_off: Delta }

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`[P39.11 Checkpoint C3] ${message}`) }
function luma(data: Buffer, index: number): number { return (0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!) / 255 }
function candidateId(strength: number): string { return `strength-${String(strength).replace('.', '_')}` }
function normalizeDiagnostics(value: unknown): Diagnostics { assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'renderer diagnostics must be an object'); return value as Diagnostics }

async function inspectPng(png: Buffer): Promise<{ image: Buffer; brightness: Brightness }> {
  const raw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert(raw.info.width === resolution && raw.info.height === resolution && raw.info.channels === 4, 'PNG must be 3000×3000 RGBA')
  let visible = 0; let sum = 0; let min = 1; let max = 0; let maxBoundaryAlpha = 0
  for (let y = 0; y < resolution; y += 1) for (let x = 0; x < resolution; x += 1) {
    const index = (y * resolution + x) * 4
    if (x === 0 || y === 0 || x === resolution - 1 || y === resolution - 1) maxBoundaryAlpha = Math.max(maxBoundaryAlpha, raw.data[index + 3]!)
    if (raw.data[index + 3]! < 2) continue
    assert(x > 0 && y > 0 && x < resolution - 1 && y < resolution - 1, 'visible boundary must not touch PNG edge')
    const value = luma(raw.data, index); visible += 1; sum += value; min = Math.min(min, value); max = Math.max(max, value)
  }
  assert(maxBoundaryAlpha < 2, `visible outer boundary must remain below alpha=2; observed max=${maxBoundaryAlpha}`)
  assert(visible > 0, 'PNG must contain visible pixels')
  return { image: raw.data, brightness: { visible_pixels: visible, mean_luma_srgb: sum / visible, min_luma_srgb: min, max_luma_srgb: max, max_boundary_alpha: maxBoundaryAlpha } }
}

function deltaFromOff(off: Buffer, candidate: Buffer): Delta {
  assert(off.length === candidate.length, 'OFF and Bloom images must share RGBA dimensions')
  let changed = 0; let added = 0; let positive = 0; let sum = 0
  for (let index = 0; index < off.length; index += 4) {
    const different = off[index] !== candidate[index] || off[index + 1] !== candidate[index + 1] || off[index + 2] !== candidate[index + 2] || off[index + 3] !== candidate[index + 3]
    if (different) changed += 1
    if (off[index + 3]! < 2 && candidate[index + 3]! >= 2) added += 1
    const increase = luma(candidate, index) - luma(off, index)
    if (increase > 0) { positive += 1; sum += increase }
  }
  return { changed_pixels: changed, added_pixels: added, positive_luma_delta_pixels: positive, mean_positive_luma_delta: positive === 0 ? 0 : sum / positive }
}

function stableWithinColumn(row: EvidenceRow): unknown { const diagnostic = { ...row.diagnostics }; delete diagnostic.rating; delete diagnostic.emission; return diagnostic }
function stableAcrossStrengths(row: EvidenceRow): unknown { const diagnostic = { ...row.diagnostics, bloom: { ...row.diagnostics.bloom } }; delete diagnostic.rating; delete diagnostic.emission; delete diagnostic.bloom.strength; return diagnostic }

function assertMatrix(rows: EvidenceRow[]): void {
  assert(rows.length === 16 && ratings.length === 4 && strengths.length === 3, 'matrix must be OFF plus 3 strength candidates × 4 ratings')
  for (const rating of ratings) {
    const off = rows.find((row) => row.column === 'off' && row.rating === rating)
    const candidates = rows.filter((row) => typeof row.column === 'number' && row.rating === rating).sort((a, b) => (a.column as number) - (b.column as number))
    assert(off && candidates.length === 3, `rating ${rating} must have OFF plus three candidates`)
    assert(off.diagnostics.bloom.enabled === false, `rating ${rating} OFF reference must disable Bloom`)
    assert(candidates.every((row) => row.diagnostics.bloom.enabled && row.diagnostics.bloom.composition === fixed.composition && row.diagnostics.bloom.threshold === fixed.threshold && row.diagnostics.bloom.radius === fixed.radius), `rating ${rating} must use shared pure-delta Bloom contract`)
    assert(JSON.stringify(candidates.map((row) => row.column)) === JSON.stringify(strengths), `rating ${rating} strength columns mismatch`)
    assert(new Set(candidates.map((row) => row.visual_config_hash)).size === strengths.length, `rating ${rating} candidate visual hashes must differ`)
    const stable = JSON.stringify(stableAcrossStrengths(candidates[0]!))
    for (const row of candidates) {
      assert(JSON.stringify(stableAcrossStrengths(row)) === stable, `rating ${rating} candidates may only vary strength/hash/pixels`)
      assert(row.diagnostics.bloom.strength === row.column, `rating ${rating} strength diagnostic mismatch`)
      assert(row.delta_from_off.changed_pixels > 0 && row.delta_from_off.positive_luma_delta_pixels > 0, `rating ${rating} strength ${row.column} must differ from OFF with a positive luma delta`)
      assert(row.delta_from_off.added_pixels >= 0 && row.delta_from_off.mean_positive_luma_delta >= 0, `rating ${rating} delta must be non-negative`)
    }
  }
  const candidateShaSequences = strengths.map((strength) => JSON.stringify(rows.filter((row) => row.column === strength).sort((a, b) => a.rating - b.rating).map((row) => row.png_sha256)))
  assert(new Set(candidateShaSequences).size === strengths.length, 'strength candidate PNG SHA-256 sequences must differ across ratings')
  for (const column of ['off', ...strengths] as const) {
    const group = rows.filter((row) => row.column === column).sort((a, b) => a.rating - b.rating)
    assert(group.length === 4 && JSON.stringify(group.map((row) => row.rating)) === JSON.stringify(ratings), `column ${column} must contain four ratings`)
    const stable = JSON.stringify(stableWithinColumn(group[0]!))
    for (const row of group) {
      assert(row.diagnostics.key_light.intensity === fixed.key, `column ${column} Key drifted`)
      assert(row.diagnostics.emission_curve.exponent === fixed.exponent && row.diagnostics.emission_curve.intensity_min === fixed.intensityMin && row.diagnostics.emission_curve.intensity_max === fixed.intensityMax, `column ${column} emission contract drifted`)
      assert(JSON.stringify(stableWithinColumn(row)) === stable, `column ${column} may only vary rating/emission`)
    }
  }
}

async function writeContactSheet(rows: EvidenceRow[]): Promise<string> {
  const columns: Array<'off' | number> = ['off', ...strengths]
  const composites: Array<{ input: Buffer; left: number; top: number }> = []
  for (let rowIndex = 0; rowIndex < ratings.length; rowIndex += 1) for (let column = 0; column < columns.length; column += 1) {
    const entry = rows.find((row) => row.rating === ratings[rowIndex] && row.column === columns[column])
    assert(entry, `missing contact-sheet cell rating=${ratings[rowIndex]} column=${columns[column]}`)
    composites.push({ input: await sharp(path.join(output, entry.png)).resize(tile, tile).png().toBuffer(), left: column * tile, top: rowIndex * tile })
  }
  const file = 'contact-sheet-rows-rating-0-4-5-10-columns-off-strength-0.0025-0.005-0.01.png'
  await sharp({ create: { width: tile * 4, height: tile * 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).composite(composites.map((entry) => ({ ...entry, blend: 'over' as const }))).png().toFile(path.join(output, file))
  return file
}

async function renderCell(column: 'off' | number, rating: number): Promise<EvidenceRow> {
  const fixture = path.join(fixtureDirectory, `controlled-rating-${rating}.json`)
  await access(fixture)
  const source: DataSource = { kind: 'file', label: `file:${fixture}`, bytes: await readFile(fixture) }
  const id = column === 'off' ? 'bloom-off-reference' : candidateId(column)
  const png = `${id}-rating-${rating}.png`
  const args: ExportArgs = { movieId: 157336, output: path.join(output, png), resolution, padding, bloom: column === 'off' ? 'off' : 'on', sizeRoot: 3, renderMode: 'shader', dataFile: fixture }
  const render: BrowserRender = column === 'off' ? await renderInBrowser(args, source, root) : await renderP3911CheckpointCStrengthInBrowser(args, source, root, column)
  assertPngSafe(render.png, resolution)
  if (column === 'off') render.visualHash = JSON.stringify({ diagnostic: 'p39.11-checkpoint-c3-bloom-off-reference-v1', productionVisualConfig: render.visualHash ?? '', bloom: { enabled: false, composition: fixed.composition } })
  const diagnostics = normalizeDiagnostics(render.visualDiagnostics)
  const baseMetadata = metadataFor(args, source, render, getGitCommit(root))
  const sidecar = `${png}.render.json`
  await writeArtifactsAtomically({ png: path.join(output, png), metadata: path.join(output, sidecar) }, render.png, { ...baseMetadata, p39_11: { checkpoint: 'C3-strength', column, strength: column === 'off' ? null : column, visual_config_hash: baseMetadata.visual_config_hash, bloom: diagnostics.bloom } })
  const persisted = JSON.parse(await readFile(path.join(output, sidecar), 'utf8')) as { png_sha256?: unknown }
  assert(persisted.png_sha256 === baseMetadata.png_sha256, `sidecar PNG SHA mismatch for rating=${rating} column=${column}`)
  const inspected = await inspectPng(render.png)
  return { column, rating, png, sidecar, png_sha256: baseMetadata.png_sha256 as string, visual_config_hash: baseMetadata.visual_config_hash as string, diagnostics, brightness: inspected.brightness, delta_from_off: { changed_pixels: 0, added_pixels: 0, positive_luma_delta_pixels: 0, mean_positive_luma_delta: 0 } }
}

async function main(): Promise<void> {
  await mkdir(output, { recursive: true })
  await writePhase39Fixtures(['--baseline-file', baseline, '--output-dir', fixtureDirectory])
  const rows: EvidenceRow[] = []
  for (const rating of ratings) {
    const off = await renderCell('off', rating)
    const offImage = (await inspectPng(await readFile(path.join(output, off.png)))).image
    rows.push(off)
    for (const strength of strengths) {
      const candidate = await renderCell(strength, rating)
      candidate.delta_from_off = deltaFromOff(offImage, (await inspectPng(await readFile(path.join(output, candidate.png)))).image)
      rows.push(candidate)
    }
  }
  assertMatrix(rows)
  const fixture = path.join(fixtureDirectory, 'controlled-rating-5.json')
  const repeat = await renderP3911CheckpointCStrengthInBrowser({ movieId: 157336, output: path.join(output, 'repeat.png'), resolution, padding, bloom: 'on', sizeRoot: 3, renderMode: 'shader' }, { kind: 'file', label: `file:${fixture}`, bytes: await readFile(fixture) }, root, 0.005)
  const canonical = rows.find((row) => row.column === 0.005 && row.rating === 5)
  assert(canonical, 'canonical repeat candidate must exist')
  const repeatedSha256 = createHash('sha256').update(repeat.png).digest('hex')
  assert(repeatedSha256 === canonical.png_sha256, 'repeat export SHA-256 must be byte-stable')
  const contactSheet = await writeContactSheet(rows)
  const validation = { checkpoint: 'C3-strength', contract: 'p39.11-strength-pure-delta-offline-diagnostics-v1', input: { tmdb_id: 157336, ratings, strength_candidates: strengths, off_reference: true, bloom: fixed, resolution, baseline_fixture: path.relative(root, baseline).replaceAll('\\', '/') }, contact_sheet: { file: contactSheet, rows: 'rating=0,4,5,10', columns: 'OFF / strength0.0025 / strength0.005 / strength0.01' }, matrix: rows.map((row) => ({ column: row.column, rating: row.rating, png: row.png, sidecar: row.sidecar, png_sha256: row.png_sha256, visual_config_hash: row.visual_config_hash, brightness: row.brightness, delta_from_off: row.delta_from_off })), assertions: { matrix_dimensions: 'pass', candidate_single_variable_strength: 'pass', candidate_matrix_png_sha_sequences_distinct: 'pass', pure_delta_bloom_contract: 'pass', sidecar_sha_rgba_boundary: 'pass', deterministic_repeat: { candidate: canonical.column, rating: canonical.rating, canonical_png_sha256: canonical.png_sha256, repeated_png_sha256: repeatedSha256, byte_stable: true } } }
  await writeFile(path.join(output, 'validation.json'), `${JSON.stringify(validation, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ output, candidateCount: strengths.length, sampleConfig: { tmdbId: 157336, ratings, strengths, offReference: true, ...fixed }, exports: rows.length, contactSheet, deterministicRepeat: repeatedSha256 }))
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1 })