import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { ExportArgs } from '../src/args.js'
import { writeArtifactsAtomically } from '../src/artifacts.js'
import { getGitCommit, metadataFor } from '../src/browser.js'
import { generateContactSheet, type ContactSheetInput } from '../src/contactSheet.js'
import type { DataSource } from '../src/data-source.js'
import {
  P41_EMISSION_BLOOM_OFF,
  P41_EMISSION_HISTORICAL_CURVE,
  P41_EMISSION_EVIDENCE_RELATIVE_DIRECTORY,
  P41_EMISSION_FIXED_PROFILE,
  P41_EMISSION_FIXTURE_ROWS,
  assertP41EmissionEvidenceContract,
  profileWithoutRatingAndEmission,
} from '../src/p41EmissionEvidence.js'
import {
  PHASE41_CONTROLLED_RATINGS,
  writePhase41Baseline,
  type JsonRecord,
} from '../src/phase41Baseline.js'
import {
  PHASE41_DIAGNOSTIC_MARKER,
  renderPhase41DiagnosticInBrowser,
  type Phase41DiagnosticOverride,
} from '../src/phase41Diagnostic.js'
import { assertPngSafe } from '../src/png.js'

const root = path.resolve(import.meta.dirname, '../../..')
const directory = path.resolve(root, P41_EMISSION_EVIDENCE_RELATIVE_DIRECTORY)
const resolution = 1024
const padding = 0.08
const sizeRoot = 3 as const

type Artifact = {
  fixture: string
  rating: number
  movieId: number
  title: string
  sourceVoteAverage: number
  voteCount: number
  hue: number
  genres: readonly string[]
  seed: number
  png: string
  sidecar: string
  pngSha256: string
  diagnostics: JsonRecord
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P41.5 emission evidence] ${message}`)
}

function record(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as JsonRecord
}

function text(value: unknown, label: string): string {
  assert(typeof value === 'string' && value.length > 0, `${label} must be non-empty`)
  return value
}

function number(value: unknown, label: string): number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`)
  return value
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function cellKey(fixture: string, rating: number): string {
  return `${fixture}\u0000${rating}`
}

function ratingLabel(rating: number): string {
  return rating.toFixed(1)
}

function profileOverride(): Phase41DiagnosticOverride {
  return {
    diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
    emissionCurve: { ...P41_EMISSION_HISTORICAL_CURVE },
    lightness: P41_EMISSION_FIXED_PROFILE.lightness,
    keyLightIntensity: P41_EMISSION_FIXED_PROFILE.keyLightIntensity,
    direction: [...P41_EMISSION_FIXED_PROFILE.direction],
    bloom: { ...P41_EMISSION_BLOOM_OFF },
  }
}

function readFixtureMovie(value: unknown, fixture: string): { movie: JsonRecord; meta: JsonRecord; phaseFixture: JsonRecord } {
  const payload = record(value, `${fixture} fixture`)
  const movies = payload.movies
  assert(Array.isArray(movies) && movies.length === 1, `${fixture} fixture must contain exactly one movie`)
  return {
    movie: record(movies[0], `${fixture} movie`),
    meta: record(payload.meta, `${fixture} meta`),
    phaseFixture: record(payload.phase41_fixture, `${fixture} fixture metadata`),
  }
}

async function loadFixture(fixture: string): Promise<{ bytes: Buffer; movie: JsonRecord; meta: JsonRecord; phaseFixture: JsonRecord }> {
  const file = path.join(root, 'data/runs/phase41/baseline/fixtures', `real-${fixture}.json`)
  const bytes = await fs.readFile(file)
  const parsed = readFixtureMovie(JSON.parse(bytes.toString('utf8')) as unknown, fixture)
  return { bytes, ...parsed }
}

function controlledFixtureBytes(original: Buffer, fixture: string, rating: number): Buffer {
  const parsed = record(JSON.parse(original.toString('utf8')) as unknown, fixture)
  const { movie, meta, phaseFixture } = readFixtureMovie(parsed, fixture)
  const clone = JSON.parse(JSON.stringify(parsed)) as JsonRecord
  const clonedMovie = record((clone.movies as unknown[])[0], `${fixture} clone movie`)
  const clonedMeta = record(clone.meta, `${fixture} clone meta`)
  const clonedFixture = record(clone.phase41_fixture, `${fixture} clone metadata`)
  clonedMovie.vote_average = rating
  clonedMeta.version = `${text(meta.version, `${fixture} meta.version`)}-p41.5-controlled-rating-${ratingLabel(rating)}`
  clonedFixture.selection = `${text(phaseFixture.selection, `${fixture} selection`)}; P41.5 controlled rating override=${ratingLabel(rating)}`
  assert(number(movie.vote_average, `${fixture} source vote_average`) >= 0, `${fixture} source rating must be valid`)
  return Buffer.from(`${JSON.stringify(clone)}\n`, 'utf8')
}

function expectedEmission(rating: number): number {
  // The production pure function is exercised by the shared invariant helper;
  // values here are independently reconstructed from the versioned contract for sidecar checks.
  const t = Math.max(0, Math.min(1, (rating - P41_EMISSION_HISTORICAL_CURVE.ratingLowAnchor) / (P41_EMISSION_HISTORICAL_CURVE.ratingHighAnchor - P41_EMISSION_HISTORICAL_CURVE.ratingLowAnchor)))
  return P41_EMISSION_HISTORICAL_CURVE.intensityMin + (t * t * (3 - 2 * t)) * (P41_EMISSION_HISTORICAL_CURVE.intensityMax - P41_EMISSION_HISTORICAL_CURVE.intensityMin)
}

function assertedProfile(artifact: Artifact): JsonRecord {
  return record(artifact.diagnostics.phase41_resolved_profile, `${artifact.png} resolved profile`)
}

function assertArtifact(artifact: Artifact): void {
  const diagnostics = artifact.diagnostics
  assert(diagnostics.rating === artifact.rating, `${artifact.png} rendered rating drifted`)
  assert(diagnostics.emission === expectedEmission(artifact.rating), `${artifact.png} rendered emission drifted`)
  const bloom = record(diagnostics.bloom, `${artifact.png} bloom`)
  assert(
    bloom.enabled === P41_EMISSION_BLOOM_OFF.enabled
      && bloom.strength === P41_EMISSION_BLOOM_OFF.strength
      && bloom.radius === P41_EMISSION_BLOOM_OFF.radius
      && bloom.threshold === P41_EMISSION_BLOOM_OFF.threshold
      && bloom.composition === 'pure-bloom-delta-v1',
    `${artifact.png} must retain Bloom OFF pure-delta composition`,
  )
  assert(diagnostics.fixed_lightness === P41_EMISSION_FIXED_PROFILE.lightness, `${artifact.png} Lightness drifted`)
  const key = record(diagnostics.key_light, `${artifact.png} key light`)
  assert(key.intensity === P41_EMISSION_FIXED_PROFILE.keyLightIntensity, `${artifact.png} Key drifted`)
  assert(key.flat_shading_mix === P41_EMISSION_FIXED_PROFILE.flatShadingMix, `${artifact.png} flat shading drifted`)
  assert(equal(key.direction, P41_EMISSION_FIXED_PROFILE.direction), `${artifact.png} direction drifted`)
  const curve = record(diagnostics.emission_curve, `${artifact.png} emission curve`)
  assert(equal(curve, {
    model_version: P41_EMISSION_HISTORICAL_CURVE.modelVersion,
    rating_low_anchor: P41_EMISSION_HISTORICAL_CURVE.ratingLowAnchor,
    rating_high_anchor: P41_EMISSION_HISTORICAL_CURVE.ratingHighAnchor,
    intensity_min: P41_EMISSION_HISTORICAL_CURVE.intensityMin,
    intensity_max: P41_EMISSION_HISTORICAL_CURVE.intensityMax,
  }), `${artifact.png} production curve drifted`)
  const profile = assertedProfile(artifact)
  assert(profile.overrideProvenance === 'phase41-diagnostic-override', `${artifact.png} must record diagnostic-only provenance`)
  assert(profile.productionSource === 'PLANET_VISUAL_DEFAULTS', `${artifact.png} must retain production provenance`)
  assert(text(profile.productionVisualConfigInput, `${artifact.png} production config`) !== text(profile.resolvedVisualConfigInput, `${artifact.png} resolved config`), `${artifact.png} must not claim an override as production configuration`)
  assert(equal(profile.curve, P41_EMISSION_HISTORICAL_CURVE), `${artifact.png} resolved curve drifted`)
  assert(profile.lightness === P41_EMISSION_FIXED_PROFILE.lightness && profile.keyLightIntensity === P41_EMISSION_FIXED_PROFILE.keyLightIntensity, `${artifact.png} fixed profile drifted`)
  assert(equal(profile.direction, P41_EMISSION_FIXED_PROFILE.direction), `${artifact.png} profile direction drifted`)
  assert(equal(profile.bloom, P41_EMISSION_BLOOM_OFF), `${artifact.png} profile Bloom drifted`)
}

function rowSnapshot(artifact: Artifact): JsonRecord {
  const profile = assertedProfile(artifact)
  return {
    profile: profileWithoutRatingAndEmission({
      rating: artifact.rating,
      emission: diagnosticsEmission(artifact),
      curve: profile.curve,
      lightness: profile.lightness,
      chroma: profile.chroma,
      keyLightIntensity: profile.keyLightIntensity,
      direction: profile.direction,
      bloom: profile.bloom,
      flatShadingMix: profile.flatShadingMix,
      camera: profile.camera,
      seed: profile.seed,
      rotation: profile.rotation,
      overrideProvenance: profile.overrideProvenance,
    }),
    camera: profile.camera,
    seed: profile.seed,
    rotation: profile.rotation,
    bloom: profile.bloom,
    lightness: profile.lightness,
    key: profile.keyLightIntensity,
    direction: profile.direction,
    flat: profile.flatShadingMix,
  }
}

function diagnosticsEmission(artifact: Artifact): number {
  return number(artifact.diagnostics.emission, `${artifact.png} emission`)
}

function assertMatrix(artifacts: readonly Artifact[]): void {
  const expected = P41_EMISSION_FIXTURE_ROWS.length * PHASE41_CONTROLLED_RATINGS.length
  assert(artifacts.length === expected, `matrix has ${artifacts.length} cells; expected ${expected}`)
  const seen = new Set<string>()
  for (const artifact of artifacts) {
    const key = cellKey(artifact.fixture, artifact.rating)
    assert(!seen.has(key), `duplicate matrix cell ${artifact.fixture}/${artifact.rating}`)
    seen.add(key)
    assertArtifact(artifact)
  }
  for (const fixture of P41_EMISSION_FIXTURE_ROWS) {
    const row = artifacts.filter((artifact) => artifact.fixture === fixture)
    assert(row.length === PHASE41_CONTROLLED_RATINGS.length, `${fixture} row is incomplete`)
    const baseline = rowSnapshot(row[0]!)
    for (const rating of PHASE41_CONTROLLED_RATINGS) {
      const artifact = row.find((entry) => entry.rating === rating)
      assert(artifact, `${fixture}/${ratingLabel(rating)} is missing`)
      assert(equal(rowSnapshot(artifact), baseline), `${fixture}/${ratingLabel(rating)} changed profile, camera, seed, rotation, Bloom, Lightness, Key, direction, or flat`)
    }
  }
}

async function writeJsonAtomically(file: string, value: unknown): Promise<void> {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`)
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await fs.rename(temporary, file)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

async function renderCell(fixture: string, rating: number): Promise<Artifact> {
  const loaded = await loadFixture(fixture)
  const movieId = number(loaded.movie.id, `${fixture} movie id`)
  const title = text(loaded.movie.title, `${fixture} title`)
  const sourceVoteAverage = number(loaded.movie.vote_average, `${fixture} source vote average`)
  const voteCount = number(loaded.movie.vote_count, `${fixture} vote count`)
  const hue = number(loaded.movie.genre_hue, `${fixture} hue`)
  const genres = loaded.movie.genres
  assert(Array.isArray(genres) && genres.length > 0 && genres.every((genre) => typeof genre === 'string'), `${fixture} genres are invalid`)
  const bytes = controlledFixtureBytes(loaded.bytes, fixture, rating)
  const source: DataSource = { kind: 'file', label: `phase41-baseline-fixture:${fixture};controlled-rating=${ratingLabel(rating)}`, bytes }
  const fileName = `${fixture}__rating-${ratingLabel(rating)}.png`
  const args: ExportArgs = {
    movieId,
    output: path.join(directory, 'cells', fileName),
    resolution,
    padding,
    bloom: 'off',
    sizeRoot,
    renderMode: 'shader',
    dataFile: path.join(root, 'data/runs/phase41/baseline/fixtures', `real-${fixture}.json`),
  }
  const render = await renderPhase41DiagnosticInBrowser(args, source, root, profileOverride())
  assertPngSafe(render.png, resolution)
  const diagnostics = render.visualDiagnostics
  const seed = number(record(diagnostics.noise, `${fileName} noise`).seed, `${fileName} seed`)
  const rendered = metadataFor(args, source, render, getGitCommit(root))
  const stableMetadata = { ...rendered }
  delete stableMetadata.generated_at
  const sidecar = `${fileName}.render.json`
  await writeArtifactsAtomically(
    { png: path.join(directory, 'cells', fileName), metadata: path.join(directory, 'cells', sidecar) },
    render.png,
    {
      ...stableMetadata,
      p41_5_emission_curve: {
        status: 'pending-human-review',
        human_review_required: true,
        fixture,
        controlled_rating: rating,
        source_vote_average: sourceVoteAverage,
        source_vote_count: voteCount,
        fixture_hue: hue,
        fixture_genres: genres,
        fixture_seed: seed,
        diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
        override: profileOverride(),
        production_curve: P41_EMISSION_HISTORICAL_CURVE,
        fixed_profile: P41_EMISSION_FIXED_PROFILE,
      },
    },
  )
  return {
    fixture,
    rating,
    movieId,
    title,
    sourceVoteAverage,
    voteCount,
    hue,
    genres,
    seed,
    png: path.join('cells', fileName).replaceAll('\\', '/'),
    sidecar: path.join('cells', sidecar).replaceAll('\\', '/'),
    pngSha256: createHash('sha256').update(render.png).digest('hex'),
    diagnostics,
  }
}

function contactSheetInput(artifacts: readonly Artifact[]): ContactSheetInput {
  return {
    title: 'P41.5 rating → emission · Bloom OFF · pending-human-review',
    rows: P41_EMISSION_FIXTURE_ROWS.map((fixture) => {
      const artifact = artifacts.find((entry) => entry.fixture === fixture)!
      return { key: fixture, label: `${fixture} · hue=${artifact.hue.toFixed(3)} · seed=${artifact.seed} · genres=${artifact.genres.length}` }
    }),
    columns: PHASE41_CONTROLLED_RATINGS.map((rating) => ({ key: ratingLabel(rating), label: `rating ${ratingLabel(rating)}` })),
    cells: artifacts.map((artifact) => ({
      rowKey: artifact.fixture,
      columnKey: ratingLabel(artifact.rating),
      input: artifact.png,
      caption: [
        `rating=${ratingLabel(artifact.rating)} emission=${diagnosticsEmission(artifact).toFixed(6)}`,
        'Bloom=OFF · L=0.660 · Key=0.450 · Flat=0.800',
        'vote-average-anchored-smoothstep-v1',
      ].join('\n'),
      parameters: {
        status: 'pending-human-review',
        diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
        fixture: artifact.fixture,
        fixture_movie_id: artifact.movieId,
        fixture_title: artifact.title,
        fixture_hue: artifact.hue,
        fixture_seed: artifact.seed,
        fixture_genres: artifact.genres,
        fixture_source_vote_average: artifact.sourceVoteAverage,
        fixture_vote_count: artifact.voteCount,
        rating: artifact.rating,
        emission: diagnosticsEmission(artifact),
        png: artifact.png,
        sidecar: artifact.sidecar,
        curve: P41_EMISSION_HISTORICAL_CURVE,
        fixed_profile: P41_EMISSION_FIXED_PROFILE,
      },
    })),
  }
}

async function verifyPublishedMatrix(artifacts: readonly Artifact[], baseline: { source: { sha256: string; data_version: string } }): Promise<void> {
  const expectedKeys = new Set(artifacts.map((artifact) => cellKey(artifact.fixture, artifact.rating)))
  const cellFiles = await fs.readdir(path.join(directory, 'cells'))
  const pngFiles = cellFiles.filter((file) => file.endsWith('.png'))
  const sidecarFiles = cellFiles.filter((file) => file.endsWith('.png.render.json'))
  assert(pngFiles.length === expectedKeys.size && sidecarFiles.length === expectedKeys.size, 'cells directory has incomplete or stale rendered artifacts')
  for (const artifact of artifacts) {
    const png = path.join(directory, artifact.png)
    const sidecar = path.join(directory, artifact.sidecar)
    const sidecarData = record(JSON.parse(await fs.readFile(sidecar, 'utf8')) as unknown, `${artifact.sidecar} sidecar`)
    const pngBytes = await fs.readFile(png)
    assert(createHash('sha256').update(pngBytes).digest('hex') === artifact.pngSha256, `${artifact.png} hash changed after rendering`)
    assert(sidecarData.png_sha256 === artifact.pngSha256, `${artifact.sidecar} does not match PNG hash`)
    assert(sidecarData.chronicle_git_commit === getGitCommit(root), `${artifact.sidecar} Git commit drifted`)
    const p415 = record(sidecarData.p41_5_emission_curve, `${artifact.sidecar} P41.5 evidence`)
    assert(p415.status === 'pending-human-review' && p415.human_review_required === true, `${artifact.sidecar} must not claim human approval`)
  }
  const manifest = record(JSON.parse(await fs.readFile(path.join(directory, 'contact-sheet.manifest.json'), 'utf8')) as unknown, 'contact-sheet manifest')
  const sources = manifest.sources
  assert(Array.isArray(sources) && sources.length === expectedKeys.size, 'contact-sheet manifest has incomplete sources')
  for (const source of sources) {
    const cell = record(source, 'contact-sheet source')
    const parameters = record(cell.parameters, 'contact-sheet source parameters')
    const key = cellKey(text(cell.row_key, 'contact-sheet row'), Number(text(cell.column_key, 'contact-sheet column').replace('rating ', '')))
    assert(expectedKeys.has(key), 'contact-sheet manifest references an undeclared cell')
    assert(parameters.status === 'pending-human-review', 'contact-sheet manifest must preserve pending human review')
  }
  const validation = record(JSON.parse(await fs.readFile(path.join(directory, 'validation.json'), 'utf8')) as unknown, 'validation')
  assert(record(validation.authoritative_data, 'validation authoritative data').sha256 === baseline.source.sha256, 'validation authoritative data hash drifted')
  assert(validation.git_commit === getGitCommit(root), 'validation Git commit drifted')
  assert(validation.reproduction_command === 'npm run evidence:p41.5', 'validation reproduction command drifted')
}

async function main(): Promise<void> {
  assertP41EmissionEvidenceContract()
  const { summary } = await writePhase41Baseline(root)
  await fs.mkdir(path.join(directory, 'cells'), { recursive: true })
  const artifacts: Artifact[] = []
  for (const fixture of P41_EMISSION_FIXTURE_ROWS) {
    for (const rating of PHASE41_CONTROLLED_RATINGS) artifacts.push(await renderCell(fixture, rating))
  }
  assertMatrix(artifacts)
  const command = 'npm run evidence:p41.5'
  await generateContactSheet(contactSheetInput(artifacts), {
    inputRoot: directory,
    outputDirectory: directory,
    workingDirectory: root,
    gitCommit: getGitCommit(root),
    command,
  })
  await writeJsonAtomically(path.join(directory, 'validation.json'), {
    schema_version: 'p41.5-emission-curve-validation-v1',
    status: 'pending-human-review',
    human_review_required: true,
    evidence_directory: P41_EMISSION_EVIDENCE_RELATIVE_DIRECTORY,
    reproduction_command: command,
    git_commit: getGitCommit(root),
    authoritative_data: summary.source,
    matrix: {
      rows: P41_EMISSION_FIXTURE_ROWS,
      columns: PHASE41_CONTROLLED_RATINGS,
      expected_cells: P41_EMISSION_FIXTURE_ROWS.length * PHASE41_CONTROLLED_RATINGS.length,
    },
    curve: P41_EMISSION_HISTORICAL_CURVE,
    fixed_profile: P41_EMISSION_FIXED_PROFILE,
    assertions: {
      curve_endpoints: 'pass',
      curve_clamp: 'pass',
      curve_monotonicity: 'pass',
      dense_range_distinguishable: 'pass',
      complete_matrix: 'pass',
      per_row_only_rating_and_emission_vary: 'pass',
      diagnostic_only_override: 'pass',
      bloom_off: 'pass',
      png_hashes: 'pass',
      data_version_and_git_commit: 'pass',
    },
    cells: artifacts.map((artifact) => ({
      fixture: artifact.fixture,
      rating: artifact.rating,
      emission: diagnosticsEmission(artifact),
      png: artifact.png,
      sidecar: artifact.sidecar,
      png_sha256: artifact.pngSha256,
      movie_id: artifact.movieId,
      title: artifact.title,
      hue: artifact.hue,
      seed: artifact.seed,
      genre_count: artifact.genres.length,
      source_vote_average: artifact.sourceVoteAverage,
      vote_count: artifact.voteCount,
    })),
  })
  await verifyPublishedMatrix(artifacts, summary)
  console.log(JSON.stringify({
    evidence_directory: P41_EMISSION_EVIDENCE_RELATIVE_DIRECTORY,
    rows: P41_EMISSION_FIXTURE_ROWS.length,
    columns: PHASE41_CONTROLLED_RATINGS.length,
    cells: artifacts.length,
    png_files: artifacts.length + 1,
    sidecar_files: artifacts.length,
    status: 'pending-human-review',
    command,
  }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})