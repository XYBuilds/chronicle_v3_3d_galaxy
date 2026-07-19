import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { type ExportArgs } from '../src/args.js'
import { writeArtifactsAtomically } from '../src/artifacts.js'
import { getGitCommit, metadataFor } from '../src/browser.js'
import { type DataSource } from '../src/data-source.js'
import { assertPngSafe } from '../src/png.js'
import { P3911_CHECKPOINT_B_EXPONENTS, renderP3911CheckpointBInBrowser } from '../src/p3911CheckpointB.js'
import { main as writePhase39Fixtures } from '../src/phase39Fixtures.js'

const root = path.resolve(import.meta.dirname, '../../..')
const output = path.join(root, 'data/runs/phase39-p39.11/checkpoint-b')
const fixtureDirectory = path.join(output, 'fixtures')
const baseline = path.join(root, 'tools/planet-exporter/fixtures/phase39-contract-baseline.json')
const ratings = [0, 4, 5, 10] as const
const candidates = P3911_CHECKPOINT_B_EXPONENTS
const resolution = 3000
const padding = 0.08
const key = 0.35
const emissionMinimum = 0.06
const emissionMaximum = 0.6
const diagnosticModelVersion = 'p39.11-checkpoint-b-emission-exponent-v1'
const tile = 750

type Diagnostics = {
  movie_id: number
  genres: string[]
  rating: number
  emission: number
  emission_curve: { model_version: string; exponent: number; intensity_min: number; intensity_max: number }
  bloom: { enabled: boolean }
  key_light: { intensity: number; [key: string]: unknown }
  [key: string]: unknown
}

type Brightness = { visible_pixels: number; mean_luma_srgb: number; min_luma_srgb: number; max_luma_srgb: number }
type EvidenceRow = {
  candidate: string
  emission_exponent: number
  rating: number
  png: string
  sidecar: string
  png_sha256: string
  visual_config_hash: string
  diagnostics: Diagnostics
  brightness: Brightness
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P39.11 Checkpoint B] ${message}`)
}

function candidateId(exponent: number): string {
  return `emission-exponent-${String(exponent).replace('.', '_')}`
}

function emissionForRating(rating: number, exponent: number): number {
  return emissionMinimum + Math.pow(Math.min(10, Math.max(0, rating)) / 10, exponent) * (emissionMaximum - emissionMinimum)
}

function normalizeDiagnostics(value: unknown): Diagnostics {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'renderer diagnostics must be an object')
  return value as Diagnostics
}

async function brightness(png: Buffer): Promise<Brightness> {
  const image = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert(image.info.width === resolution && image.info.height === resolution && image.info.channels === 4, 'PNG must be 3000×3000 RGBA')
  let visible = 0
  let sum = 0
  let min = 1
  let max = 0
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const index = (y * resolution + x) * 4
      if (image.data[index + 3]! < 2) continue
      assert(x > 0 && y > 0 && x < resolution - 1 && y < resolution - 1, 'visible planet boundary must not touch PNG edge')
      const luma = (0.2126 * image.data[index]! + 0.7152 * image.data[index + 1]! + 0.0722 * image.data[index + 2]!) / 255
      visible += 1
      sum += luma
      min = Math.min(min, luma)
      max = Math.max(max, luma)
    }
  }
  assert(visible > 0, 'PNG must contain visible pixels')
  return { visible_pixels: visible, mean_luma_srgb: sum / visible, min_luma_srgb: min, max_luma_srgb: max }
}

function stableWithinExponent(row: EvidenceRow): unknown {
  const diagnostics = { ...row.diagnostics }
  delete diagnostics.rating
  delete diagnostics.emission
  return diagnostics
}

function stableAcrossExponents(row: EvidenceRow): unknown {
  const diagnostics = { ...row.diagnostics }
  delete diagnostics.rating
  delete diagnostics.emission
  delete diagnostics.emission_curve
  return diagnostics
}

function assertMatrix(rows: EvidenceRow[]): void {
  assert(candidates.length === 3 && ratings.length === 4, 'matrix dimensions must be 3 candidates × 4 ratings')
  assert(rows.length === candidates.length * ratings.length, `matrix must contain 12 rows; received ${rows.length}`)
  for (const exponent of candidates) {
    const group = rows.filter((row) => row.emission_exponent === exponent).sort((a, b) => a.rating - b.rating)
    assert(group.length === ratings.length && JSON.stringify(group.map((row) => row.rating)) === JSON.stringify(ratings), `exponent ${exponent} rating matrix mismatch`)
    const stable = JSON.stringify(stableWithinExponent(group[0]!))
    for (const row of group) {
      assert(row.diagnostics.key_light.intensity === key, `exponent ${exponent} must have fixed Key=.35`)
      assert(row.diagnostics.bloom.enabled === false, `exponent ${exponent} must have Bloom OFF`)
      assert(row.diagnostics.emission_curve.model_version === diagnosticModelVersion, `exponent ${exponent} model identifier mismatch`)
      assert(row.diagnostics.emission_curve.exponent === exponent, `exponent ${exponent} diagnostics mismatch`)
      assert(row.diagnostics.emission_curve.intensity_min === emissionMinimum && row.diagnostics.emission_curve.intensity_max === emissionMaximum, 'emission range drifted')
      assert(Math.abs(row.diagnostics.emission - emissionForRating(row.rating, exponent)) < 1e-12, `exponent ${exponent}, rating ${row.rating} emission mismatch`)
      assert(JSON.stringify(stableWithinExponent(row)) === stable, `same exponent may only change rating/emission; exponent ${exponent}, rating ${row.rating}`)
    }
  }
  for (const rating of ratings) {
    const group = rows.filter((row) => row.rating === rating).sort((a, b) => b.emission_exponent - a.emission_exponent)
    assert(group.length === candidates.length && JSON.stringify(group.map((row) => row.emission_exponent)) === JSON.stringify(candidates), `rating ${rating} exponent matrix mismatch`)
    const stable = JSON.stringify(stableAcrossExponents(group[0]!))
    assert(new Set(group.map((row) => row.visual_config_hash)).size === candidates.length, `rating ${rating} candidates must have distinct visual hashes`)
    for (const row of group) assert(JSON.stringify(stableAcrossExponents(row)) === stable, `cross-exponent rows may only change exponent/emission/model/hash; rating ${rating}`)
  }
  const zeroRows = rows.filter((row) => row.rating === 0)
  assert(zeroRows.every((row) => row.diagnostics.emission === emissionMinimum), 'rating 0 emission must remain 0.06 for all candidates')
  assert(new Set(zeroRows.map((row) => row.png_sha256)).size === 1, 'rating 0 PNG SHA-256 must be identical for all candidates')
}

async function writeContactSheet(rows: EvidenceRow[]): Promise<string> {
  const composites: Array<{ input: Buffer; left: number; top: number }> = []
  for (let rowIndex = 0; rowIndex < ratings.length; rowIndex += 1) {
    for (let column = 0; column < candidates.length; column += 1) {
      const row = rows.find((entry) => entry.rating === ratings[rowIndex] && entry.emission_exponent === candidates[column])
      assert(row, `missing contact-sheet cell rating=${ratings[rowIndex]} exponent=${candidates[column]}`)
      composites.push({ input: await sharp(path.join(output, row.png)).resize(tile, tile).png().toBuffer(), left: column * tile, top: rowIndex * tile })
    }
  }
  const contactSheet = 'contact-sheet-rows-rating-0-4-5-10-columns-exponent-3-2.5-2.png'
  await sharp({ create: { width: tile * candidates.length, height: tile * ratings.length, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(composites.map((entry) => ({ ...entry, blend: 'over' as const }))).png().toFile(path.join(output, contactSheet))
  return contactSheet
}

async function exportCell(exponent: number, rating: number): Promise<EvidenceRow> {
  const fixture = path.join(fixtureDirectory, `controlled-rating-${rating}.json`)
  await access(fixture)
  const fixtureBytes = await readFile(fixture)
  const fixtureSource: DataSource = { kind: 'file', label: `file:${fixture}`, bytes: fixtureBytes }
  const candidate = candidateId(exponent)
  const png = `${candidate}-rating-${rating}-bloom-off.png`
  const args: ExportArgs = { movieId: 157336, output: path.join(output, png), resolution, padding, bloom: 'off', sizeRoot: 3, renderMode: 'shader', dataFile: fixture }
  const render = await renderP3911CheckpointBInBrowser(args, fixtureSource, root, exponent)
  assertPngSafe(render.png, resolution)
  const diagnostics = normalizeDiagnostics(render.visualDiagnostics)
  const baseMetadata = metadataFor(args, fixtureSource, render, getGitCommit(root))
  const sidecar = `${png}.render.json`
  const metadata = {
    ...baseMetadata,
    p39_11: {
      checkpoint: 'B', candidate, emission_exponent: exponent, key_light_intensity: key,
      emission_curve: diagnostics.emission_curve, fixed_lightness: diagnostics.fixed_lightness, fixed_chroma: diagnostics.fixed_chroma,
      seed: diagnostics.noise, pose: diagnostics.rotation, camera: diagnostics.camera, visual_config_hash: baseMetadata.visual_config_hash,
    },
  }
  await writeArtifactsAtomically({ png: path.join(output, png), metadata: path.join(output, sidecar) }, render.png, metadata)
  const persistedSidecar = JSON.parse(await readFile(path.join(output, sidecar), 'utf8')) as { png_sha256?: unknown }
  assert(persistedSidecar.png_sha256 === baseMetadata.png_sha256, `sidecar PNG SHA mismatch for exponent ${exponent}, rating ${rating}`)
  return {
    candidate, emission_exponent: exponent, rating, png, sidecar, png_sha256: baseMetadata.png_sha256 as string,
    visual_config_hash: baseMetadata.visual_config_hash as string, diagnostics, brightness: await brightness(render.png),
  }
}

async function main(): Promise<void> {
  await mkdir(output, { recursive: true })
  await writePhase39Fixtures(['--baseline-file', baseline, '--output-dir', fixtureDirectory])
  const rows: EvidenceRow[] = []
  for (const exponent of candidates) for (const rating of ratings) rows.push(await exportCell(exponent, rating))
  assertMatrix(rows)
  const fixture = path.join(fixtureDirectory, 'controlled-rating-5.json')
  const repeat = await renderP3911CheckpointBInBrowser(
    { movieId: 157336, output: path.join(output, 'repeat.png'), resolution, padding, bloom: 'off', sizeRoot: 3, renderMode: 'shader' },
    { kind: 'file', label: `file:${fixture}`, bytes: await readFile(fixture) }, root, 2.5,
  )
  const canonical = rows.find((row) => row.emission_exponent === 2.5 && row.rating === 5)
  assert(canonical, 'canonical repeat candidate must exist')
  const repeatedSha256 = createHash('sha256').update(repeat.png).digest('hex')
  assert(repeatedSha256 === canonical.png_sha256, 'repeat export SHA-256 must be byte-stable')
  const contactSheet = await writeContactSheet(rows)
  const validation = {
    checkpoint: 'B', contract: 'p39.11-fixed-key-emission-exponent-offline-diagnostics-v1',
    input: { tmdb_id: 157336, ratings, emission_exponent_candidates: candidates, fixed_key_light_intensity: key, bloom: 'off', resolution,
      emission_curve: { intensity_min: emissionMinimum, intensity_max: emissionMaximum }, baseline_fixture: path.relative(root, baseline).replaceAll('\\', '/') },
    contact_sheet: { file: contactSheet, rows: 'rating=0,4,5,10', columns: 'exponent=3,2.5,2' },
    matrix: rows.map((row) => ({ candidate: row.candidate, emission_exponent: row.emission_exponent, rating: row.rating, png: row.png, sidecar: row.sidecar, png_sha256: row.png_sha256, visual_config_hash: row.visual_config_hash, brightness: row.brightness })),
    assertions: {
      matrix_dimensions: 'pass', same_exponent_only_rating_and_emission_change: 'pass', cross_exponent_only_exponent_emission_model_and_hash_change: 'pass',
      fixed_key_and_bloom_off: 'pass', rating_zero_identical_png: { png_sha256: rows.filter((row) => row.rating === 0).map((row) => ({ exponent: row.emission_exponent, sha256: row.png_sha256 })) },
      deterministic_repeat: { candidate: canonical.candidate, rating: canonical.rating, canonical_png_sha256: canonical.png_sha256, repeated_png_sha256: repeatedSha256, byte_stable: true },
      png_shape_rgba_visible_boundary_and_sidecar_sha: 'pass',
    },
  }
  await writeFile(path.join(output, 'validation.json'), `${JSON.stringify(validation, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ output, candidateCount: candidates.length, sampleConfig: { tmdbId: 157336, ratings, exponents: candidates, key, bloom: 'off', intensityMin: emissionMinimum, intensityMax: emissionMaximum }, exports: rows.length, contactSheet, deterministicRepeat: repeatedSha256 }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})