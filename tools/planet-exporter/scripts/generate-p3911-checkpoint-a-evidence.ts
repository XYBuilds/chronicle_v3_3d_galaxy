import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { writeArtifactsAtomically } from '../src/artifacts.js'
import { getGitCommit, metadataFor } from '../src/browser.js'
import { type ExportArgs } from '../src/args.js'
import { type DataSource } from '../src/data-source.js'
import { assertPngSafe } from '../src/png.js'
import { renderP3911CheckpointAInBrowser } from '../src/p3911CheckpointA.js'
import { main as writePhase39Fixtures } from '../src/phase39Fixtures.js'

const root = path.resolve(import.meta.dirname, '../../..')
const output = path.join(root, 'data/runs/phase39-p39.11/checkpoint-a')
const fixtureDirectory = path.join(output, 'fixtures')
const baseline = path.join(root, 'tools/planet-exporter/fixtures/phase39-contract-baseline.json')
const ratings = [0, 4, 5, 10] as const
const candidates = [0.35, 0.5, 0.65] as const
const resolution = 3000
const padding = 0.08
const tile = 750

type Diagnostics = {
  movie_id: number
  genres: string[]
  rating: number
  emission: number
  emission_curve: { model_version: string; exponent: number; intensity_min: number; intensity_max: number }
  fixed_lightness: number
  fixed_chroma: number
  bloom: { enabled: boolean; composition: string; strength: number; radius: number; threshold: number }
  key_light: { enabled: boolean; direction: [number, number, number]; intensity: number; flat_shading_mix: number }
  noise: { seed: number; scale: number; octaves: number; persistence: number }
  rotation: Record<string, unknown>
  camera: Record<string, unknown>
  [key: string]: unknown
}

type EvidenceRow = {
  candidate: string
  key_light_intensity: number
  rating: number
  png: string
  sidecar: string
  png_sha256: string
  visual_config_hash: string
  diagnostics: Diagnostics
  brightness: { visible_pixels: number; mean_luma_srgb: number; min_luma_srgb: number; max_luma_srgb: number }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P39.11 Checkpoint A] ${message}`)
}

function candidateId(key: number): string {
  return `fixed-key-${key.toFixed(2)}`
}

function emissionForRating(rating: number): number {
  return 0.06 + Math.pow(rating / 10, 3) * (0.6 - 0.06)
}

function normalizeDiagnostics(value: unknown): Diagnostics {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'renderer diagnostics must be an object')
  return value as Diagnostics
}

async function brightness(png: Buffer): Promise<EvidenceRow['brightness']> {
  const image = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert(image.info.width === resolution && image.info.height === resolution && image.info.channels === 4, 'PNG must be 3000×3000 RGBA')
  let visible = 0
  let sum = 0
  let min = 1
  let max = 0
  for (let index = 0; index < image.data.length; index += 4) {
    if (image.data[index + 3]! < 2) continue
    const luma = (0.2126 * image.data[index]! + 0.7152 * image.data[index + 1]! + 0.0722 * image.data[index + 2]!) / 255
    visible += 1
    sum += luma
    min = Math.min(min, luma)
    max = Math.max(max, luma)
  }
  assert(visible > 0, 'PNG must contain visible pixels')
  return {
    visible_pixels: visible,
    mean_luma_srgb: sum / visible,
    min_luma_srgb: min,
    max_luma_srgb: max,
  }
}

function stableWithinKey(row: EvidenceRow): unknown {
  const diagnostics = { ...row.diagnostics } as Record<string, unknown>
  delete diagnostics.rating
  delete diagnostics.emission
  return diagnostics
}

function stableAcrossKeys(row: EvidenceRow): unknown {
  const diagnostics = { ...row.diagnostics } as Record<string, unknown>
  const keyLight = { ...row.diagnostics.key_light } as Record<string, unknown>
  delete diagnostics.rating
  delete diagnostics.emission
  delete keyLight.intensity
  diagnostics.key_light = keyLight
  return diagnostics
}

function assertMatrix(rows: EvidenceRow[]): void {
  assert(candidates.length === 3 && ratings.length === 4, 'matrix dimensions must be 3 candidates × 4 ratings')
  assert(rows.length === candidates.length * ratings.length, `matrix must contain 12 rows; received ${rows.length}`)
  for (const key of candidates) {
    const group = rows.filter((row) => row.key_light_intensity === key).sort((a, b) => a.rating - b.rating)
    assert(group.length === ratings.length, `candidate ${key} must contain four ratings`)
    assert(JSON.stringify(group.map((row) => row.rating)) === JSON.stringify(ratings), `candidate ${key} rating matrix mismatch`)
    const stable = JSON.stringify(stableWithinKey(group[0]!))
    for (const row of group) {
      const diagnostics = row.diagnostics
      assert(diagnostics.key_light.intensity === key, `candidate ${key} has an unexpected Key`)
      assert(diagnostics.bloom.enabled === false, `candidate ${key} must have Bloom OFF`)
      assert(diagnostics.emission_curve.exponent === 3 && diagnostics.emission_curve.intensity_min === 0.06 && diagnostics.emission_curve.intensity_max === 0.6, `candidate ${key} emission curve drifted`)
      assert(Math.abs(diagnostics.emission - emissionForRating(row.rating)) < 1e-12, `candidate ${key} rating ${row.rating} emission mismatch`)
      assert(JSON.stringify(stableWithinKey(row)) === stable, `same Key may only change rating/emission; candidate ${key}, rating ${row.rating}`)
    }
  }
  for (const rating of ratings) {
    const group = rows.filter((row) => row.rating === rating).sort((a, b) => a.key_light_intensity - b.key_light_intensity)
    assert(group.length === candidates.length, `rating ${rating} must contain three Key candidates`)
    assert(JSON.stringify(group.map((row) => row.key_light_intensity)) === JSON.stringify(candidates), `rating ${rating} Key matrix mismatch`)
    const stable = JSON.stringify(stableAcrossKeys(group[0]!))
    const hashes = new Set(group.map((row) => row.visual_config_hash))
    assert(hashes.size === candidates.length, `rating ${rating} Key candidates must have distinct visual hashes`)
    for (const row of group) {
      assert(JSON.stringify(stableAcrossKeys(row)) === stable, `cross-Key rows may only change Key/hash; rating ${rating}, Key ${row.key_light_intensity}`)
    }
  }
}

async function writeContactSheet(rows: EvidenceRow[]): Promise<string> {
  const composites: Array<{ input: Buffer; left: number; top: number }> = []
  for (let rowIndex = 0; rowIndex < ratings.length; rowIndex += 1) {
    for (let column = 0; column < candidates.length; column += 1) {
      const row = rows.find((entry) => entry.rating === ratings[rowIndex] && entry.key_light_intensity === candidates[column])
      assert(row, `missing contact-sheet cell rating=${ratings[rowIndex]} key=${candidates[column]}`)
      composites.push({
        input: await sharp(path.join(output, row.png)).resize(tile, tile).png().toBuffer(),
        left: column * tile,
        top: rowIndex * tile,
      })
    }
  }
  const contactSheet = 'contact-sheet-rows-rating-0-4-5-10-columns-key-0.35-0.50-0.65.png'
  await sharp({ create: { width: tile * candidates.length, height: tile * ratings.length, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(composites.map((entry) => ({ ...entry, blend: 'over' as const })))
    .png()
    .toFile(path.join(output, contactSheet))
  return contactSheet
}

async function exportCell(key: number, rating: number): Promise<EvidenceRow> {
  const fixture = path.join(fixtureDirectory, `controlled-rating-${rating}.json`)
  await access(fixture)
  const fixtureBytes = await readFile(fixture)
  const fixtureSource: DataSource = { kind: 'file', label: `file:${fixture}`, bytes: fixtureBytes }
  const id = candidateId(key)
  const png = `${id}-rating-${rating}-bloom-off.png`
  const args: ExportArgs = {
    movieId: 157336,
    output: path.join(output, png),
    resolution,
    padding,
    bloom: 'off',
    sizeRoot: 3,
    renderMode: 'shader',
    dataFile: fixture,
  }
  const render = await renderP3911CheckpointAInBrowser(args, fixtureSource, root, key)
  assertPngSafe(render.png, resolution)
  const diagnostics = normalizeDiagnostics(render.visualDiagnostics)
  const baseMetadata = metadataFor(args, fixtureSource, render, getGitCommit(root))
  const sidecar = `${png}.render.json`
  const metadata = {
    ...baseMetadata,
    p39_11: {
      checkpoint: 'A',
      candidate: id,
      key_light_intensity: key,
      emission_curve: diagnostics.emission_curve,
      fixed_lightness: diagnostics.fixed_lightness,
      fixed_chroma: diagnostics.fixed_chroma,
      seed: diagnostics.noise.seed,
      pose: diagnostics.rotation,
      camera: diagnostics.camera,
      visual_config_hash: baseMetadata.visual_config_hash,
    },
  }
  await writeArtifactsAtomically({ png: path.join(output, png), metadata: path.join(output, sidecar) }, render.png, metadata)
  return {
    candidate: id,
    key_light_intensity: key,
    rating,
    png,
    sidecar,
    png_sha256: baseMetadata.png_sha256 as string,
    visual_config_hash: baseMetadata.visual_config_hash as string,
    diagnostics,
    brightness: await brightness(render.png),
  }
}

async function main(): Promise<void> {
  await mkdir(output, { recursive: true })
  await writePhase39Fixtures(['--baseline-file', baseline, '--output-dir', fixtureDirectory])
  const rows: EvidenceRow[] = []
  for (const key of candidates) {
    for (const rating of ratings) rows.push(await exportCell(key, rating))
  }
  assertMatrix(rows)

  const repeat = await renderP3911CheckpointAInBrowser({
    movieId: 157336,
    output: path.join(output, 'repeat.png'),
    resolution,
    padding,
    bloom: 'off',
    sizeRoot: 3,
    renderMode: 'shader',
  }, { kind: 'file', label: `file:${path.join(fixtureDirectory, 'controlled-rating-5.json')}`, bytes: await readFile(path.join(fixtureDirectory, 'controlled-rating-5.json')) }, root, 0.5)
  const canonical = rows.find((row) => row.key_light_intensity === 0.5 && row.rating === 5)
  assert(canonical, 'canonical repeat candidate must exist')
  const repeatedSha256 = createHash('sha256').update(repeat.png).digest('hex')
  assert(repeatedSha256 === canonical.png_sha256, 'repeat export SHA-256 must be byte-stable')

  const contactSheet = await writeContactSheet(rows)
  const validation = {
    checkpoint: 'A',
    contract: 'p39.11-fixed-key-offline-diagnostics-v1',
    input: {
      tmdb_id: 157336,
      ratings,
      key_candidates: candidates,
      bloom: 'off',
      resolution,
      emission_curve: { exponent: 3, intensity_min: 0.06, intensity_max: 0.6 },
      baseline_fixture: path.relative(root, baseline).replaceAll('\\', '/'),
    },
    contact_sheet: { file: contactSheet, rows: 'rating=0,4,5,10', columns: 'Key=0.35,0.50,0.65' },
    matrix: rows.map((row) => ({
      candidate: row.candidate,
      key_light_intensity: row.key_light_intensity,
      rating: row.rating,
      png: row.png,
      sidecar: row.sidecar,
      png_sha256: row.png_sha256,
      visual_config_hash: row.visual_config_hash,
      brightness: row.brightness,
    })),
    assertions: {
      matrix_dimensions: 'pass',
      same_key_only_rating_and_emission_change: 'pass',
      cross_key_only_key_and_visual_hash_change: 'pass',
      bloom_off: 'pass',
      deterministic_repeat: {
        candidate: canonical.candidate,
        rating: canonical.rating,
        canonical_png_sha256: canonical.png_sha256,
        repeated_png_sha256: repeatedSha256,
        byte_stable: true,
      },
    },
  }
  await writeFile(path.join(output, 'validation.json'), `${JSON.stringify(validation, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ output, candidateCount: candidates.length, sampleConfig: { tmdbId: 157336, ratings, keys: candidates, bloom: 'off', exponent: 3, intensityMin: 0.06, intensityMax: 0.6 }, exports: rows.length, contactSheet, deterministicRepeat: repeatedSha256 }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})