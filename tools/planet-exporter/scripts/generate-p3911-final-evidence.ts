import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import type { ExportArgs } from '../src/args.js'
import { writeArtifactsAtomically } from '../src/artifacts.js'
import { assertPureBloomCore, type CoreBloomStats, type RgbaImage } from '../src/bloomProof.js'
import { getGitCommit, metadataFor, renderInBrowser } from '../src/browser.js'
import type { DataSource } from '../src/data-source.js'
import { assertPngSafe } from '../src/png.js'
import { main as writePhase39Fixtures } from '../src/phase39Fixtures.js'

const root = path.resolve(import.meta.dirname, '../../..')
const output = path.join(root, 'data/runs/phase39-p39.11/final')
const fixtureDirectory = path.join(output, 'fixtures')
const baselineFixture = path.join(root, 'tools/planet-exporter/fixtures/phase39-contract-baseline.json')
const realSource = path.join(root, 'data/runs/phase39-p39.7/source-galaxy_data.json.gz')
const ratings = [0, 4, 5, 10] as const
const realTiers = ['low', 'mid', 'high'] as const
const resolution = 3000
const padding = 0.08
const sizeRoot = 3 as const
const tile = 750

const productionContract = {
  schemaVersion: 5,
  keyLightIntensity: 0.35,
  emissionModel: 'vote-average-power-clamped-v1',
  emissionExponent: 2,
  intensityMin: 0.06,
  intensityMax: 0.6,
  bloomComposition: 'pure-bloom-delta-v1',
  bloomStrength: 0.01,
  bloomRadius: 1,
  bloomThreshold: 0,
  colorPipelineVersion: 'oklch-local-base-linear-emission-fixed-key-single-srgb-v1',
} as const

const expectedEmission = new Map<number, number>([
  [0, 0.06],
  [4, 0.1464],
  [5, 0.195],
  [10, 0.6],
])

type JsonRecord = Record<string, unknown>
type RgbaStats = {
  visible_pixels: number
  mean_luma_srgb: number
  min_luma_srgb: number
  max_luma_srgb: number
  any_rgb_255_pixels: number
  any_rgb_255_fraction: number
  all_rgb_255_pixels: number
  all_rgb_255_fraction: number
  luma_gte_0_98_pixels: number
  luma_gte_0_98_fraction: number
  boundary_alpha: { max: number; mean: number; visible_pixels: number }
}
type Artifact = {
  kind: 'controlled' | 'real'
  label: string
  movie_id: number
  rating: number
  bloom: 'off' | 'on'
  png: string
  sidecar: string
  png_sha256: string
  visual_config_hash: string
  visual_diagnostics: JsonRecord
  brightness: RgbaStats
}

type ParsedVisualConfig = {
  planet: JsonRecord
  bloom: JsonRecord
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P39.11 final evidence] ${message}`)
}

function record(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as JsonRecord
}

function numberField(object: JsonRecord, field: string, label: string): number {
  const value = object[field]
  assert(typeof value === 'number' && Number.isFinite(value), `${label}.${field} must be finite`)
  return value
}

function stringField(object: JsonRecord, field: string, label: string): string {
  const value = object[field]
  assert(typeof value === 'string' && value.length > 0, `${label}.${field} must be non-empty`) 
  return value
}

function boolField(object: JsonRecord, field: string, label: string): boolean {
  const value = object[field]
  assert(typeof value === 'boolean', `${label}.${field} must be boolean`)
  return value
}

function close(actual: number, expected: number, label: string, tolerance = 1e-12): void {
  assert(Math.abs(actual - expected) <= tolerance, `${label} expected ${expected}, received ${actual}`)
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function luma(raw: Buffer, index: number): number {
  return (0.2126 * raw[index]! + 0.7152 * raw[index + 1]! + 0.0722 * raw[index + 2]!) / 255
}

function relative(file: string): string {
  return path.relative(root, file).replaceAll('\\', '/')
}

function filenameForControlled(rating: number, bloom: 'off' | 'on'): string {
  return `controlled-rating-${rating}-bloom-${bloom}.png`
}

function filenameForReal(tier: string): string {
  return `real-${tier}-bloom-on.png`
}

function parseVisualConfig(input: string | undefined): ParsedVisualConfig {
  assert(input !== undefined, 'production page returned no visual config input')
  const page = record(JSON.parse(input) as unknown, 'visual config page input')
  const planetInput = stringField(page, 'planet', 'visual config page input')
  const bloomInput = stringField(page, 'perlinBloom', 'visual config page input')
  return {
    planet: record(JSON.parse(planetInput) as unknown, 'planet visual config'),
    bloom: record(JSON.parse(bloomInput) as unknown, 'Bloom visual config'),
  }
}

function assertProductionVisualConfig(config: ParsedVisualConfig): void {
  assert(numberField(config.planet, 'schemaVersion', 'planet visual config') === productionContract.schemaVersion, 'schema version drifted')
  const focus = record(config.planet.focus, 'planet visual config.focus')
  const emission = record(focus.emission, 'planet visual config.focus.emission')
  assert(stringField(emission, 'modelVersion', 'planet visual config.focus.emission') === productionContract.emissionModel, 'Emission model version drifted')
  assert(numberField(emission, 'exponent', 'planet visual config.focus.emission') === productionContract.emissionExponent, 'Emission exponent drifted')
  close(numberField(emission, 'intensityMin', 'planet visual config.focus.emission'), productionContract.intensityMin, 'Emission minimum')
  close(numberField(emission, 'intensityMax', 'planet visual config.focus.emission'), productionContract.intensityMax, 'Emission maximum')
  const lighting = record(config.planet.lighting, 'planet visual config.lighting')
  close(numberField(lighting, 'keyLightIntensity', 'planet visual config.lighting'), productionContract.keyLightIntensity, 'fixed Key')
  const color = record(config.planet.color, 'planet visual config.color')
  assert(stringField(color, 'pipelineVersion', 'planet visual config.color') === productionContract.colorPipelineVersion, 'color pipeline version drifted')
  assert(stringField(config.bloom, 'composition', 'Bloom visual config') === productionContract.bloomComposition, 'Bloom composition drifted')
  assert(boolField(config.bloom, 'enabled', 'Bloom visual config') === true, 'Bloom shared default must remain enabled')
  close(numberField(config.bloom, 'strength', 'Bloom visual config'), productionContract.bloomStrength, 'Bloom strength')
  close(numberField(config.bloom, 'radius', 'Bloom visual config'), productionContract.bloomRadius, 'Bloom radius')
  close(numberField(config.bloom, 'threshold', 'Bloom visual config'), productionContract.bloomThreshold, 'Bloom threshold')
}

function assertDiagnosticsContract(diagnostics: JsonRecord, expectedBloom: 'off' | 'on', expectedRating?: number): void {
  const bloom = record(diagnostics.bloom, 'diagnostics.bloom')
  assert(boolField(bloom, 'enabled', 'diagnostics.bloom') === (expectedBloom === 'on'), `Bloom ${expectedBloom} diagnostics mismatch`)
  assert(stringField(bloom, 'composition', 'diagnostics.bloom') === productionContract.bloomComposition, 'diagnostic Bloom composition drifted')
  close(numberField(bloom, 'strength', 'diagnostics.bloom'), productionContract.bloomStrength, 'diagnostic Bloom strength')
  close(numberField(bloom, 'radius', 'diagnostics.bloom'), productionContract.bloomRadius, 'diagnostic Bloom radius')
  close(numberField(bloom, 'threshold', 'diagnostics.bloom'), productionContract.bloomThreshold, 'diagnostic Bloom threshold')
  const emission = record(diagnostics.emission_curve, 'diagnostics.emission_curve')
  assert(stringField(emission, 'model_version', 'diagnostics.emission_curve') === productionContract.emissionModel, 'diagnostic Emission model drifted')
  assert(numberField(emission, 'exponent', 'diagnostics.emission_curve') === productionContract.emissionExponent, 'diagnostic Emission exponent drifted')
  close(numberField(emission, 'intensity_min', 'diagnostics.emission_curve'), productionContract.intensityMin, 'diagnostic Emission minimum')
  close(numberField(emission, 'intensity_max', 'diagnostics.emission_curve'), productionContract.intensityMax, 'diagnostic Emission maximum')
  const key = record(diagnostics.key_light, 'diagnostics.key_light')
  close(numberField(key, 'intensity', 'diagnostics.key_light'), productionContract.keyLightIntensity, 'diagnostic fixed Key')
  if (expectedRating !== undefined) {
    close(numberField(diagnostics, 'rating', 'diagnostics'), expectedRating, 'diagnostic rating')
    close(numberField(diagnostics, 'emission', 'diagnostics'), expectedEmission.get(expectedRating)!, `rating ${expectedRating} emission`, 1e-10)
  }
}

async function inspectPng(png: Buffer): Promise<{ rgba: RgbaImage; stats: RgbaStats }> {
  assertPngSafe(png, resolution)
  const decoded = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert(decoded.info.width === resolution && decoded.info.height === resolution && decoded.info.channels === 4, 'PNG must be 3000×3000 RGBA')

  let visible = 0
  let sum = 0
  let min = 1
  let max = 0
  let any255 = 0
  let all255 = 0
  let lumaHigh = 0
  let boundarySum = 0
  let boundaryMax = 0
  let boundaryVisible = 0
  const boundaryPixels = resolution * 4 - 4

  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const index = (y * resolution + x) * 4
      const alpha = decoded.data[index + 3]!
      if (x === 0 || y === 0 || x === resolution - 1 || y === resolution - 1) {
        boundarySum += alpha
        boundaryMax = Math.max(boundaryMax, alpha)
        if (alpha >= 2) boundaryVisible += 1
      }
      if (alpha < 2) continue
      visible += 1
      const value = luma(decoded.data, index)
      sum += value
      min = Math.min(min, value)
      max = Math.max(max, value)
      const red = decoded.data[index]!
      const green = decoded.data[index + 1]!
      const blue = decoded.data[index + 2]!
      if (red === 255 || green === 255 || blue === 255) any255 += 1
      if (red === 255 && green === 255 && blue === 255) all255 += 1
      if (value >= 0.98) lumaHigh += 1
    }
  }

  assert(visible > 0, 'PNG must contain visible content')
  assert(boundaryMax < 2, `PNG edge alpha must stay below 2; received ${boundaryMax}`)
  assert(boundaryVisible === 0, 'PNG edge must have no visible alpha pixels')
  return {
    rgba: { data: decoded.data, width: decoded.info.width, height: decoded.info.height },
    stats: {
      visible_pixels: visible,
      mean_luma_srgb: sum / visible,
      min_luma_srgb: min,
      max_luma_srgb: max,
      any_rgb_255_pixels: any255,
      any_rgb_255_fraction: any255 / visible,
      all_rgb_255_pixels: all255,
      all_rgb_255_fraction: all255 / visible,
      luma_gte_0_98_pixels: lumaHigh,
      luma_gte_0_98_fraction: lumaHigh / visible,
      boundary_alpha: { max: boundaryMax, mean: boundarySum / boundaryPixels, visible_pixels: boundaryVisible },
    },
  }
}

function stableDiagnostics(diagnostics: JsonRecord, ignored: readonly string[]): string {
  const copy = JSON.parse(JSON.stringify(diagnostics)) as JsonRecord
  for (const field of ignored) delete copy[field]
  return JSON.stringify(copy)
}

function controlledFixture(rating: number): string {
  return path.join(fixtureDirectory, `controlled-rating-${rating}.json`)
}

async function sourceFor(file: string): Promise<DataSource> {
  return { kind: 'file', label: `file:${file}`, bytes: await readFile(file) }
}

async function renderArtifact(kind: 'controlled' | 'real', label: string, fixture: string, movieId: number, bloom: 'off' | 'on'): Promise<Artifact> {
  await access(fixture)
  const png = kind === 'controlled' ? filenameForControlled(Number(label), bloom) : filenameForReal(label)
  const pngPath = path.join(output, png)
  const sidecar = `${png}.render.json`
  const args: ExportArgs = {
    movieId,
    output: pngPath,
    resolution,
    padding,
    bloom,
    sizeRoot,
    renderMode: 'shader',
    dataFile: fixture,
  }
  const source = await sourceFor(fixture)
  const render = await renderInBrowser(args, source, root)
  const diagnostics = render.visualDiagnostics
  assertProductionVisualConfig(parseVisualConfig(render.visualHash))
  assertDiagnosticsContract(diagnostics, bloom, kind === 'controlled' ? Number(label) : undefined)

  const metadata = metadataFor(args, source, render, getGitCommit(root))
  await writeArtifactsAtomically(
    { png: pngPath, metadata: path.join(output, sidecar) },
    render.png,
    { ...metadata, p39_11: { evidence: 'final-production', kind, label, fixture: relative(fixture), production_contract: productionContract } },
  )

  const [persistedPng, sidecarJson] = await Promise.all([
    readFile(pngPath),
    readFile(path.join(output, sidecar), 'utf8').then((text) => JSON.parse(text) as unknown),
  ])
  const persisted = record(sidecarJson, `${sidecar} metadata`)
  const actualSha = sha256(persistedPng)
  assert(persisted.png_sha256 === actualSha, `${sidecar} png_sha256 must match persisted PNG`)
  assert(persisted.visual_config_hash === metadata.visual_config_hash, `${sidecar} visual config hash must match render metadata`)
  const inspected = await inspectPng(persistedPng)
  return {
    kind,
    label,
    movie_id: movieId,
    rating: numberField(diagnostics, 'rating', 'diagnostics'),
    bloom,
    png,
    sidecar,
    png_sha256: actualSha,
    visual_config_hash: stringField(persisted, 'visual_config_hash', `${sidecar} metadata`),
    visual_diagnostics: diagnostics,
    brightness: inspected.stats,
  }
}

function assertControlledMatrix(rows: Artifact[], rgba: ReadonlyMap<string, RgbaImage>): CoreBloomStats[] {
  assert(rows.length === ratings.length * 2, 'controlled matrix must contain four ratings × Bloom OFF/ON')
  assert(new Set(rows.map((row) => row.visual_config_hash)).size === 1, 'ordinary production visual config hash must remain stable across Bloom OFF/ON matrix')
  const coreStats: CoreBloomStats[] = []
  for (const rating of ratings) {
    const off = rows.find((row) => row.rating === rating && row.bloom === 'off')
    const on = rows.find((row) => row.rating === rating && row.bloom === 'on')
    assert(off && on, `rating ${rating} requires Bloom OFF and ON`) 
    assert(stableDiagnostics(off.visual_diagnostics, ['bloom']) === stableDiagnostics(on.visual_diagnostics, ['bloom']), `rating ${rating} OFF/ON may differ only by Bloom diagnostics`)
    const offBloom = record(off.visual_diagnostics.bloom, 'OFF diagnostics.bloom')
    const onBloom = record(on.visual_diagnostics.bloom, 'ON diagnostics.bloom')
    assert(JSON.stringify({ ...offBloom, enabled: null }) === JSON.stringify({ ...onBloom, enabled: null }), `rating ${rating} Bloom OFF/ON must vary only bloom.enabled`)
    const offImage = rgba.get(off.png)
    const onImage = rgba.get(on.png)
    assert(offImage && onImage, `rating ${rating} RGBA data missing`)
    coreStats.push(assertPureBloomCore(offImage, onImage))
  }

  for (const bloom of ['off', 'on'] as const) {
    const group = rows.filter((row) => row.bloom === bloom).sort((a, b) => a.rating - b.rating)
    assert(group.length === ratings.length, `controlled Bloom ${bloom} row count mismatch`)
    const stable = stableDiagnostics(group[0]!.visual_diagnostics, ['rating', 'emission'])
    for (const row of group) {
      assert(stableDiagnostics(row.visual_diagnostics, ['rating', 'emission']) === stable, `controlled Bloom ${bloom} must vary only rating/emission across ratings`)
    }
  }
  return coreStats
}

async function writeContactSheet(file: string, rows: Artifact[], columns: string[], rowsCount: number): Promise<void> {
  assert(rows.length === columns.length * rowsCount, `${file} has incomplete contact-sheet cells`)
  const composites: Array<{ input: Buffer; left: number; top: number }> = []
  for (let row = 0; row < rowsCount; row += 1) {
    for (let column = 0; column < columns.length; column += 1) {
      const entry = rows[row * columns.length + column]
      assert(entry, `${file} missing contact-sheet entry ${row}/${column}`)
      composites.push({
        input: await sharp(path.join(output, entry.png)).resize(tile, tile).png().toBuffer(),
        left: column * tile,
        top: row * tile,
      })
    }
  }
  await sharp({
    create: { width: tile * columns.length, height: tile * rowsCount, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  }).composite(composites.map((entry) => ({ ...entry, blend: 'over' as const }))).png().toFile(path.join(output, file))
}

async function main(): Promise<void> {
  await access(baselineFixture)
  await access(realSource).catch(() => { throw new Error(`canonical P39.7 real-sample source is required: ${realSource}`) })
  await mkdir(output, { recursive: true })
  await writePhase39Fixtures(['--baseline-file', baselineFixture, '--output-dir', fixtureDirectory, '--real-data-file', realSource])

  const controlled: Artifact[] = []
  const rgba = new Map<string, RgbaImage>()
  for (const rating of ratings) {
    for (const bloom of ['off', 'on'] as const) {
      const artifact = await renderArtifact('controlled', String(rating), controlledFixture(rating), 157336, bloom)
      controlled.push(artifact)
      rgba.set(artifact.png, (await inspectPng(await readFile(path.join(output, artifact.png)))).rgba)
    }
  }
  const pureBloomCore = assertControlledMatrix(controlled, rgba)

  const repeatArgs: ExportArgs = {
    movieId: 157336,
    output: path.join(output, 'controlled-rating-5-bloom-on-repeat.png'),
    resolution,
    padding,
    bloom: 'on',
    sizeRoot,
    renderMode: 'shader',
    dataFile: controlledFixture(5),
  }
  const repeatRender = await renderInBrowser(repeatArgs, await sourceFor(controlledFixture(5)), root)
  assertProductionVisualConfig(parseVisualConfig(repeatRender.visualHash))
  assertDiagnosticsContract(repeatRender.visualDiagnostics, 'on', 5)
  const repeatSha256 = sha256(repeatRender.png)
  const canonical = controlled.find((artifact) => artifact.rating === 5 && artifact.bloom === 'on')
  assert(canonical, 'rating 5 Bloom ON canonical artifact missing')
  assert(repeatSha256 === canonical.png_sha256, 'rating 5 Bloom ON repeated PNG must be byte-stable')

  const real: Artifact[] = []
  for (const tier of realTiers) {
    const fixture = path.join(fixtureDirectory, `real-${tier}.json`)
    const fixtureJson = record(JSON.parse(await readFile(fixture, 'utf8')) as unknown, `${tier} fixture`)
    const movies = fixtureJson.movies
    assert(Array.isArray(movies) && movies.length === 1, `${tier} fixture must contain exactly one movie`)
    const movie = record(movies[0], `${tier} fixture movie`)
    const movieId = numberField(movie, 'id', `${tier} fixture movie`)
    real.push(await renderArtifact('real', tier, fixture, movieId, 'on'))
  }

  const orderedControlled = ratings.flatMap((rating) => [
    controlled.find((artifact) => artifact.rating === rating && artifact.bloom === 'off')!,
    controlled.find((artifact) => artifact.rating === rating && artifact.bloom === 'on')!,
  ])
  await writeContactSheet('contact-sheet-rows-rating-0-4-5-10-columns-bloom-off-on.png', orderedControlled, ['off', 'on'], ratings.length)
  await writeContactSheet('contact-sheet-real-low-mid-high-bloom-on.png', real, [...realTiers], 1)

  const validation = {
    evidence: 'p39.11-final-production-v1',
    production_contract: productionContract,
    inputs: {
      controlled: { tmdb_id: 157336, ratings, bloom: ['off', 'on'], resolution, padding, size_root: sizeRoot, render_mode: 'shader', fixture_source: relative(baselineFixture) },
      real: { tiers: realTiers, bloom: 'on', fixture_source: relative(realSource) },
    },
    contact_sheets: [
      'contact-sheet-rows-rating-0-4-5-10-columns-bloom-off-on.png',
      'contact-sheet-real-low-mid-high-bloom-on.png',
    ],
    controlled,
    real,
    pure_bloom_core: pureBloomCore,
    deterministic_repeat: {
      input: { movie_id: 157336, rating: 5, bloom: 'on' },
      canonical_png: canonical.png,
      canonical_png_sha256: canonical.png_sha256,
      repeated_png: 'in-memory-repeat',
      repeated_png_sha256: repeatSha256,
      byte_stable: true,
    },
  }
  await writeFile(path.join(output, 'validation.json'), `${JSON.stringify(validation, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ output: relative(output), controlled: controlled.length, real: real.length, repeat_sha256: canonical.png_sha256 }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})