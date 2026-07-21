import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import sharp from 'sharp'

import type { ExportArgs } from '../src/args.js'
import { writeArtifactsAtomically } from '../src/artifacts.js'
import { getGitCommit, metadataFor } from '../src/browser.js'
import { generateContactSheet, type ContactSheetInput } from '../src/contactSheet.js'
import { type DataSource } from '../src/data-source.js'
import {
  P416_BLOOM_CANDIDATE_ID,
  P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY,
  P416_BLOOM_MATRIX_COLUMNS,
  P416_BLOOM_OFF,
  P416_BLOOM_ON,
  assertP416EvidenceContract,
  assertP416PairOnlyBloomVariation,
  createP416BloomOverride,
  measureP416BloomPair,
  p416Sha256,
} from '../src/p416BloomEvidence.js'
import {
  P41_EMISSION_AUTHORITATIVE_DATA,
  P41_EMISSION_FIXED_PROFILE,
  P41_EMISSION_FIXTURE_ROWS,
  P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS,
  P41_MIDRANK_CDF_LUT_EVIDENCE_RELATIVE_DIRECTORY,
} from '../src/p41EmissionEvidence.js'
import { loadAuthoritativeGalaxy, type JsonRecord } from '../src/phase41Baseline.js'
import { renderPhase41DiagnosticInBrowser } from '../src/phase41Diagnostic.js'
import {
  focusEmissionIntensityFromProfile,
  generateRatingMidrankCdfLutProfile,
  validateRatingMidrankCdfLutProfile,
  type RatingMidrankCdfLutProfile,
} from '../../../frontend/src/three/focusEmission.js'

const root = path.resolve(import.meta.dirname, '../../..')
const directory = path.resolve(root, P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY)
const p415Directory = path.resolve(root, P41_MIDRANK_CDF_LUT_EVIDENCE_RELATIVE_DIRECTORY)
const resolution = 1024
const padding = 0.08
const sizeRoot = 3 as const
const command = 'npm run evidence:p41.6 -w planet-exporter'

type Artifact = {
  fixture: string
  rating: number
  mode: typeof P416_BLOOM_MATRIX_COLUMNS[number]
  movieId: number
  png: string
  sidecar: string
  pngSha256: string
  diagnostics: JsonRecord
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P41.6 Bloom integration] ${message}`)
}

function record(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as JsonRecord
}

function number(value: unknown, label: string): number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`)
  return value
}

function text(value: unknown, label: string): string {
  assert(typeof value === 'string' && value.length > 0, `${label} must be non-empty`)
  return value
}

function stable(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'stable values must be finite')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  assert(typeof value === 'object', 'stable values must be JSON-compatible')
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`
}

function equal(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right)
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function ratingLabel(rating: number): string {
  return rating.toFixed(1)
}

function phaseFixture(value: unknown, fixture: string): { movie: JsonRecord; meta: JsonRecord; selection: string } {
  const payload = record(value, `${fixture} fixture`)
  assert(Array.isArray(payload.movies) && payload.movies.length === 1, `${fixture} fixture must contain exactly one movie`)
  const phase = record(payload.phase41_fixture, `${fixture} phase fixture`)
  return { movie: record(payload.movies[0], `${fixture} movie`), meta: record(payload.meta, `${fixture} meta`), selection: text(phase.selection, `${fixture} fixture selection`) }
}

async function fixtureBytes(fixture: string, rating: number): Promise<{ bytes: Buffer; movie: JsonRecord }> {
  const source = await fs.readFile(path.join(root, 'data/runs/phase41/baseline/fixtures', `real-${fixture}.json`))
  const clone = JSON.parse(source.toString('utf8')) as JsonRecord
  const parsed = phaseFixture(clone, fixture)
  parsed.movie.vote_average = rating
  parsed.meta.version = `${text(parsed.meta.version, `${fixture} meta.version`)}-p41.6-rating-${ratingLabel(rating)}`
  const phase = record(clone.phase41_fixture, `${fixture} phase fixture`)
  phase.selection = `${parsed.selection}; P41.6 controlled rating=${ratingLabel(rating)}`
  return { bytes: Buffer.from(`${JSON.stringify(clone)}\n`, 'utf8'), movie: parsed.movie }
}

function sourceCellName(fixture: string, rating: number): string {
  return `${fixture}__rating-${ratingLabel(rating)}.png`
}

function sidecarProfile(sidecar: JsonRecord): JsonRecord {
  return record(record(sidecar.visual_diagnostics, 'sidecar visual diagnostics').phase41_resolved_profile, 'resolved Phase 41 profile')
}

function pairComparable(artifact: Artifact): Record<string, unknown> {
  const diagnostics = artifact.diagnostics
  const profile = record(diagnostics.phase41_resolved_profile, `${artifact.png} profile`)
  const key = record(diagnostics.key_light, `${artifact.png} key light`)
  const noise = record(diagnostics.noise, `${artifact.png} noise`)
  assert(diagnostics.fixed_lightness === P41_EMISSION_FIXED_PROFILE.lightness, `${artifact.png} Lightness drifted`)
  assert(key.intensity === P41_EMISSION_FIXED_PROFILE.keyLightIntensity, `${artifact.png} Key drifted`)
  assert(equal(key.direction, P41_EMISSION_FIXED_PROFILE.direction), `${artifact.png} direction drifted`)
  assert(key.flat_shading_mix === P41_EMISSION_FIXED_PROFILE.flatShadingMix, `${artifact.png} flatShadingMix drifted`)
  return {
    authoritative_data: P41_EMISSION_AUTHORITATIVE_DATA,
    fixture: artifact.fixture,
    movie_id: diagnostics.movie_id,
    camera: diagnostics.camera,
    seed: noise.seed,
    rotation: diagnostics.rotation,
    lightness: diagnostics.fixed_lightness,
    key_light: key.intensity,
    direction: key.direction,
    flat_shading_mix: key.flat_shading_mix,
    rating: diagnostics.rating,
    emission: diagnostics.emission,
    curve: profile.curve,
    bloom: profile.bloom,
  }
}

async function rgba(png: Buffer): Promise<{ data: Uint8Array; width: number; height: number }> {
  const decoded = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert(decoded.info.width === resolution && decoded.info.height === resolution && decoded.data.length === resolution * resolution * 4, 'PNG raster dimensions drifted')
  return { data: decoded.data, width: decoded.info.width, height: decoded.info.height }
}

async function loadP415Off(fixture: string, rating: number, profile: RatingMidrankCdfLutProfile): Promise<Artifact> {
  const name = sourceCellName(fixture, rating)
  const png = await fs.readFile(path.join(p415Directory, 'cells', name))
  const sidecar = record(JSON.parse(await fs.readFile(path.join(p415Directory, 'cells', `${name}.render.json`), 'utf8')) as unknown, `${name} sidecar`)
  const diagnostics = record(sidecar.visual_diagnostics, `${name} diagnostics`)
  assert(sidecar.png_sha256 === sha256(png), `${name} P41.5 PNG hash drifted`)
  assert(diagnostics.rating === rating, `${name} P41.5 rating drifted`)
  assert(diagnostics.emission === focusEmissionIntensityFromProfile(rating, profile), `${name} P41.5 emission drifted`)
  const profileEntry = sidecarProfile(sidecar)
  assert(profileEntry.overrideProvenance === 'phase41-diagnostic-override', `${name} must retain diagnostic-only provenance`)
  const bloom = record(diagnostics.bloom, `${name} Bloom`)
  assert(equal(bloom, { enabled: false, composition: 'pure-bloom-delta-v1', strength: P416_BLOOM_OFF.strength, radius: P416_BLOOM_OFF.radius, threshold: P416_BLOOM_OFF.threshold }), `${name} P41.5 Bloom OFF drifted`)
  return { fixture, rating, mode: 'off', movieId: number(diagnostics.movie_id, `${name} movie id`), png: `cells/${fixture}__rating-${ratingLabel(rating)}__bloom-off.png`, sidecar: `cells/${fixture}__rating-${ratingLabel(rating)}__bloom-off.png.render.json`, pngSha256: sha256(png), diagnostics }
}

async function renderOn(fixture: string, rating: number, profile: RatingMidrankCdfLutProfile): Promise<{ artifact: Artifact; png: Buffer; renderMetadata: Record<string, unknown> }> {
  const loaded = await fixtureBytes(fixture, rating)
  const movieId = number(loaded.movie.id, `${fixture} movie id`)
  const fileName = `${fixture}__rating-${ratingLabel(rating)}__bloom-on.png`
  const source: DataSource = { kind: 'file', label: `p41.6:${fixture};rating=${ratingLabel(rating)}`, bytes: loaded.bytes }
  const args: ExportArgs = { movieId, output: path.join(directory, 'cells', fileName), resolution, padding, bloom: 'on', sizeRoot, renderMode: 'shader' }
  const render = await renderPhase41DiagnosticInBrowser(args, source, root, createP416BloomOverride(P416_BLOOM_ON, profile))
  assert(render.png.byteLength > 0, `${fileName} PNG is empty`)
  const diagnostics = render.visualDiagnostics as JsonRecord
  assert(diagnostics.rating === rating && diagnostics.emission === focusEmissionIntensityFromProfile(rating, profile), `${fileName} ON renderer drifted`) 
  const bloom = record(diagnostics.bloom, `${fileName} Bloom`)
  assert(equal(bloom, { enabled: true, composition: 'pure-bloom-delta-v1', strength: P416_BLOOM_ON.strength, radius: P416_BLOOM_ON.radius, threshold: P416_BLOOM_ON.threshold }), `${fileName} Bloom ON drifted`)
  return {
    artifact: { fixture, rating, mode: 'on', movieId, png: `cells/${fileName}`, sidecar: `cells/${fileName}.render.json`, pngSha256: sha256(render.png), diagnostics },
    png: render.png,
    renderMetadata: metadataFor(args, source, render, getGitCommit(root)),
  }
}

async function publishPair(fixture: string, rating: number, profile: RatingMidrankCdfLutProfile): Promise<Artifact[]> {
  const off = await loadP415Off(fixture, rating, profile)
  const on = await renderOn(fixture, rating, profile)
  assertP416PairOnlyBloomVariation(pairComparable(off), pairComparable(on.artifact))
  const offPng = await fs.readFile(path.join(p415Directory, 'cells', sourceCellName(fixture, rating)))
  const stats = measureP416BloomPair(await rgba(offPng), await rgba(on.png))
  const shared = { status: 'pending-human-review', human_review_required: true, diagnostic_only: 'phase41-visual-diagnostic-v1', candidate_id: P416_BLOOM_CANDIDATE_ID, source_candidate: 'rating-midrank-cdf-lut-v1', authoritative_data: P41_EMISSION_AUTHORITATIVE_DATA, fixture, controlled_rating: rating, profile_sha256: p416Sha256({ curve: profile, off: P416_BLOOM_OFF, on: P416_BLOOM_ON }), pair_pixel_statistics: stats, only_declared_pair_variation: ['bloom', 'on_render_output_diagnostics'] }
  await writeArtifactsAtomically({ png: path.join(directory, off.png), metadata: path.join(directory, off.sidecar) }, offPng, { ...shared, bloom_mode: 'off', png_sha256: off.pngSha256, visual_diagnostics: off.diagnostics })
  await writeArtifactsAtomically({ png: path.join(directory, on.artifact.png), metadata: path.join(directory, on.artifact.sidecar) }, on.png, { ...on.renderMetadata, generated_at: undefined, p41_6_bloom_integration: { ...shared, bloom_mode: 'on', png_sha256: on.artifact.pngSha256, visual_diagnostics: on.artifact.diagnostics } })
  return [off, on.artifact]
}

function contactSheetInput(artifacts: readonly Artifact[]): ContactSheetInput {
  return {
    title: 'P41.6 rating-midrank-cdf-lut-v1 · explicit Bloom OFF/ON · pending-human-review',
    rows: P41_EMISSION_FIXTURE_ROWS.map((fixture) => ({ key: fixture, label: fixture })),
    columns: P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS.flatMap((rating) => P416_BLOOM_MATRIX_COLUMNS.map((mode) => ({ key: `${ratingLabel(rating)}-${mode}`, label: `rating ${ratingLabel(rating)} · Bloom ${mode.toUpperCase()}` }))),
    cells: artifacts.map((artifact) => ({
      rowKey: artifact.fixture,
      columnKey: `${ratingLabel(artifact.rating)}-${artifact.mode}`,
      input: artifact.png,
      caption: `rating=${ratingLabel(artifact.rating)} emission=${number(artifact.diagnostics.emission, 'emission').toFixed(6)}\nBloom=${artifact.mode.toUpperCase()} · explicit candidate=${P416_BLOOM_CANDIDATE_ID}`,
      parameters: { fixture: artifact.fixture, rating: artifact.rating, bloom: artifact.mode, emission: number(artifact.diagnostics.emission, 'emission'), png: artifact.png, sidecar: artifact.sidecar },
    })),
  }
}

async function verify(artifacts: readonly Artifact[], profile: RatingMidrankCdfLutProfile, sourceSha256: string): Promise<void> {
  const expected = P41_EMISSION_FIXTURE_ROWS.length * P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS.length * P416_BLOOM_MATRIX_COLUMNS.length
  assert(artifacts.length === expected, `matrix has ${artifacts.length} cells; expected ${expected}`)
  const cells = await fs.readdir(path.join(directory, 'cells'))
  assert(cells.filter((file) => file.endsWith('.png')).length === expected, 'missing or stale cell PNG')
  assert(cells.filter((file) => file.endsWith('.png.render.json')).length === expected, 'missing or stale cell sidecar')
  const seen = new Set<string>()
  for (const artifact of artifacts) {
    const key = `${artifact.fixture}\u0000${artifact.rating}\u0000${artifact.mode}`
    assert(!seen.has(key), `duplicate matrix cell ${key}`)
    seen.add(key)
    const png = await fs.readFile(path.join(directory, artifact.png))
    assert(sha256(png) === artifact.pngSha256, `${artifact.png} hash mismatch`)
    const sidecar = record(JSON.parse(await fs.readFile(path.join(directory, artifact.sidecar), 'utf8')) as unknown, artifact.sidecar)
    const evidence = artifact.mode === 'on' ? record(sidecar.p41_6_bloom_integration, `${artifact.sidecar} evidence`) : sidecar
    assert(evidence.png_sha256 === artifact.pngSha256, `${artifact.sidecar} hash mismatch`)
  }
  for (const fixture of P41_EMISSION_FIXTURE_ROWS) {
    for (const rating of P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS) {
      const off = artifacts.find((artifact) => artifact.fixture === fixture && artifact.rating === rating && artifact.mode === 'off')!
      const on = artifacts.find((artifact) => artifact.fixture === fixture && artifact.rating === rating && artifact.mode === 'on')!
      assertP416PairOnlyBloomVariation(pairComparable(off), pairComparable(on))
    }
  }
  const contactManifest = record(JSON.parse(await fs.readFile(path.join(directory, 'contact-sheet.manifest.json'), 'utf8')) as unknown, 'contact sheet manifest')
  assert(Array.isArray(contactManifest.sources) && contactManifest.sources.length === expected, 'contact sheet matrix incomplete')
  const validation = { schema_version: 'p41.6-bloom-integration-validation-v1', status: 'pending-human-review', human_review_required: true, evidence_directory: P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY, reproduction_command: command, candidate_id: P416_BLOOM_CANDIDATE_ID, authoritative_data: P41_EMISSION_AUTHORITATIVE_DATA, source_sha256: sourceSha256, profile, profile_sha256: p416Sha256({ curve: profile, off: P416_BLOOM_OFF, on: P416_BLOOM_ON }), matrix: { rows: P41_EMISSION_FIXTURE_ROWS, ratings: P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS, bloom_modes: P416_BLOOM_MATRIX_COLUMNS, expected_cells: expected }, assertions: { authoritative_gzip: 'pass', fixture_movie_camera_seed_rotation_fixed: 'pass', lightness_key_direction_flat_shading_fixed: 'pass', rating_emission_only_by_row: 'pass', off_on_only_declared_bloom_variation: 'pass', pure_bloom_delta_core: 'pass', cell_hashes: 'pass', contact_sheet_complete: 'pass' }, hashes: { contact_sheet_sha256: sha256(await fs.readFile(path.join(directory, 'contact-sheet.png'))), contact_sheet_manifest_sha256: sha256(await fs.readFile(path.join(directory, 'contact-sheet.manifest.json'))) }, cells: artifacts.map((artifact) => ({ fixture: artifact.fixture, rating: artifact.rating, bloom: artifact.mode, png: artifact.png, sidecar: artifact.sidecar, png_sha256: artifact.pngSha256 })) }
  await fs.writeFile(path.join(directory, 'validation.json'), `${stable(validation)}\n`, 'utf8')
}

async function main(): Promise<void> {
  assertP416EvidenceContract()
  const { galaxy, sourceSha256 } = await loadAuthoritativeGalaxy(root)
  assert(sourceSha256 === P41_EMISSION_AUTHORITATIVE_DATA.sha256, 'authoritative gzip SHA-256 drifted')
  assert(galaxy.meta.version === P41_EMISSION_AUTHORITATIVE_DATA.dataVersion && galaxy.movies.length === P41_EMISSION_AUTHORITATIVE_DATA.movieCount, 'authoritative gzip metadata drifted')
  const ratings = galaxy.movies.map((movie) => movie.vote_average).sort((left, right) => left - right)
  const profile = validateRatingMidrankCdfLutProfile(generateRatingMidrankCdfLutProfile(ratings))
  console.log(JSON.stringify({ matrix_shape: [P41_EMISSION_FIXTURE_ROWS.length, P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS.length, P416_BLOOM_MATRIX_COLUMNS.length], rating_min: ratings[0], rating_max: ratings.at(-1), profile_intensity_min: profile.intensityMin, profile_intensity_max: profile.intensityMax }))
  await fs.rm(directory, { recursive: true, force: true })
  await fs.mkdir(path.join(directory, 'cells'), { recursive: true })
  const artifacts: Artifact[] = []
  for (const fixture of P41_EMISSION_FIXTURE_ROWS) {
    for (const rating of P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS) artifacts.push(...await publishPair(fixture, rating, profile))
  }
  await generateContactSheet(contactSheetInput(artifacts), { inputRoot: directory, outputDirectory: directory, workingDirectory: root, gitCommit: getGitCommit(root), command })
  await verify(artifacts, profile, sourceSha256)
  console.log(JSON.stringify({ evidence_directory: P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY, cells: artifacts.length, status: 'pending-human-review' }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})