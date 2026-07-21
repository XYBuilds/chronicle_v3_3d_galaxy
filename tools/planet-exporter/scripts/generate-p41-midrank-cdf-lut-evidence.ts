import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { ExportArgs } from '../src/args.js'
import { writeArtifactsAtomically } from '../src/artifacts.js'
import { getGitCommit, metadataFor } from '../src/browser.js'
import { generateContactSheet, type ContactSheetInput } from '../src/contactSheet.js'
import type { DataSource } from '../src/data-source.js'
import {
  P41_EMISSION_ALLOWED_VARIATION_FIELDS,
  P41_EMISSION_AUTHORITATIVE_DATA,
  P41_EMISSION_BLOOM_OFF,
  P41_EMISSION_FIXED_PROFILE,
  P41_EMISSION_FIXTURE_ROWS,
  P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE,
  P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE,
  P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS,
  P41_MIDRANK_CDF_LUT_EVIDENCE_RELATIVE_DIRECTORY,
  assertP41EmissionEvidenceContract,
  assertP41EmissionRatingOnlyVariation,
  assertP41MidrankCdfLutEvidenceManifest,
  createP41MidrankCdfLutEvidenceManifest,
  serializeP41MidrankCdfLutEvidenceManifest,
} from '../src/p41EmissionEvidence.js'
import { loadAuthoritativeGalaxy, type JsonRecord } from '../src/phase41Baseline.js'
import {
  PHASE41_DIAGNOSTIC_MARKER,
  renderPhase41DiagnosticInBrowser,
  type Phase41DiagnosticOverride,
} from '../src/phase41Diagnostic.js'
import { assertPngSafe } from '../src/png.js'
import {
  focusEmissionIntensityFromProfile,
  generateRatingMidrankCdfLutProfile,
  validateRatingMidrankCdfLutProfile,
  type RatingMidrankCdfLutProfile,
} from '../../../frontend/src/three/focusEmission.js'

const root = path.resolve(import.meta.dirname, '../../..')
const directory = path.resolve(root, P41_MIDRANK_CDF_LUT_EVIDENCE_RELATIVE_DIRECTORY)
const resolution = 1024
const padding = 0.08
const sizeRoot = 3 as const
const command = 'npm run evidence:p41.5:cdf-lut -w planet-exporter'

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
  if (!condition) throw new Error(`[P41.5 CDF/LUT evidence] ${message}`)
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

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function cellKey(fixture: string, rating: number): string {
  return `${fixture}\u0000${rating}`
}

function ratingLabel(rating: number): string {
  return rating.toFixed(1)
}

function stable(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'stable evidence values must be finite')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  assert(typeof value === 'object', 'stable evidence values must be JSON-compatible')
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`
}

async function writeStableJson(file: string, value: unknown): Promise<void> {
  const output = `${stable(value)}\n`
  await fs.writeFile(file, output, 'utf8')
}

type HistoricalEvidenceSnapshot = {
  fileHashes: Record<string, string>
}

async function snapshotHistoricalEvidence(): Promise<HistoricalEvidenceSnapshot> {
  const historicalDirectory = path.resolve(root, P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE.evidenceDirectory)
  const manifestFile = path.join(historicalDirectory, 'contact-sheet.manifest.json')
  const validationFile = path.join(historicalDirectory, 'validation.json')
  const manifest = record(JSON.parse(await fs.readFile(manifestFile, 'utf8')) as unknown, 'historical contact sheet manifest')
  const validation = record(JSON.parse(await fs.readFile(validationFile, 'utf8')) as unknown, 'historical validation')
  assert(validation.status === 'pending-human-review', 'historical baseline status must remain pending-human-review')
  const sources = manifest.sources
  assert(Array.isArray(sources) && sources.length > 0, 'historical contact sheet manifest must list source PNGs')
  const historicalFiles = P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE.evidenceDirectory
  const files = ['contact-sheet.png', 'contact-sheet.manifest.json', 'validation.json'].map((file) => `${historicalFiles}/${file}`)
  for (const source of sources) {
    const entry = record(source, 'historical contact sheet source')
    const input = text(entry.input, 'historical contact sheet source input')
    const expectedHash = text(entry.sha256, 'historical contact sheet source hash')
    const relative = path.relative(root, path.resolve(root, input)).replaceAll('\\', '/')
    assert(!relative.startsWith('../') && relative.startsWith(`${P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE.evidenceDirectory}/cells/`), 'historical contact sheet source must remain inside its evidence directory')
    const bytes = await fs.readFile(path.resolve(root, input))
    assert(sha256(bytes) === expectedHash, `historical source hash drifted for ${input}`)
    files.push(relative)
  }
  const fileHashes = Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await fs.readFile(path.join(root, file)))] as const)))
  return { fileHashes }
}

function assertHistoricalEvidenceUnchanged(snapshot: HistoricalEvidenceSnapshot, after: HistoricalEvidenceSnapshot): void {
  assert(equal(snapshot.fileHashes, after.fileHashes), 'historical anchored-smoothstep evidence changed during CDF/LUT generation')
}

/** Returns deterministic hashes for a prior complete run; partial output is intentionally ignored. */
async function existingEvidenceHashes(): Promise<Record<string, string> | undefined> {
  try {
    const rootFiles = ['profile.manifest.json', 'contact-sheet.png', 'contact-sheet.manifest.json', 'validation.json']
    const cellFiles = (await fs.readdir(path.join(directory, 'cells'))).filter((file) => file.endsWith('.png') || file.endsWith('.png.render.json')).sort()
    if (cellFiles.length !== P41_EMISSION_FIXTURE_ROWS.length * P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS.length * 2) return undefined
    const files = [...rootFiles, ...cellFiles.map((file) => `cells/${file}`)]
    const hashes = Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await fs.readFile(path.join(directory, file)))] as const)))
    return hashes
  } catch {
    return undefined
  }
}

function profileOverride(profile: RatingMidrankCdfLutProfile): Phase41DiagnosticOverride {
  return {
    diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
    emissionCurve: profile,
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
    phaseFixture: record(payload.phase41_fixture, `${fixture} phase fixture`),
  }
}

async function loadFixture(fixture: string, sourceSha256: string): Promise<{ bytes: Buffer; movie: JsonRecord; meta: JsonRecord; phaseFixture: JsonRecord }> {
  const file = path.join(root, 'data/runs/phase41/baseline/fixtures', `real-${fixture}.json`)
  const bytes = await fs.readFile(file)
  const parsed = readFixtureMovie(JSON.parse(bytes.toString('utf8')) as unknown, fixture)
  assert(text(parsed.phaseFixture.source_sha256, `${fixture} source SHA`) === sourceSha256, `${fixture} does not derive from the current authoritative gzip`)
  return { bytes, ...parsed }
}

function controlledFixtureBytes(original: Buffer, fixture: string, rating: number): Buffer {
  const clone = JSON.parse(original.toString('utf8')) as JsonRecord
  const { meta, phaseFixture } = readFixtureMovie(clone, fixture)
  const movie = record((clone.movies as unknown[])[0], `${fixture} cloned movie`)
  const clonedMeta = record(clone.meta, `${fixture} cloned meta`)
  const clonedFixture = record(clone.phase41_fixture, `${fixture} cloned fixture`)
  movie.vote_average = rating
  clonedMeta.version = `${text(meta.version, `${fixture} meta.version`)}-p41.5-cdf-lut-rating-${ratingLabel(rating)}`
  clonedFixture.selection = `${text(phaseFixture.selection, `${fixture} selection`)}; P41.5 CDF/LUT controlled rating=${ratingLabel(rating)}`
  return Buffer.from(`${JSON.stringify(clone)}\n`, 'utf8')
}

function artifactProfile(artifact: Artifact): JsonRecord {
  return record(artifact.diagnostics.phase41_resolved_profile, `${artifact.png} resolved profile`)
}

function emission(artifact: Artifact): number {
  return number(artifact.diagnostics.emission, `${artifact.png} emission`)
}

function assertArtifact(artifact: Artifact, profile: RatingMidrankCdfLutProfile): void {
  assert(artifact.diagnostics.rating === artifact.rating, `${artifact.png} rendered rating drifted`)
  assert(emission(artifact) === focusEmissionIntensityFromProfile(artifact.rating, profile), `${artifact.png} rendered emission drifted`)
  const bloom = record(artifact.diagnostics.bloom, `${artifact.png} bloom`)
  assert(
    bloom.enabled === P41_EMISSION_BLOOM_OFF.enabled
      && bloom.strength === P41_EMISSION_BLOOM_OFF.strength
      && bloom.radius === P41_EMISSION_BLOOM_OFF.radius
      && bloom.threshold === P41_EMISSION_BLOOM_OFF.threshold
      && bloom.composition === 'pure-bloom-delta-v1',
    `${artifact.png} must be Bloom OFF`,
  )
  assert(artifact.diagnostics.fixed_lightness === P41_EMISSION_FIXED_PROFILE.lightness, `${artifact.png} lightness drifted`)
  const key = record(artifact.diagnostics.key_light, `${artifact.png} key light`)
  assert(key.intensity === P41_EMISSION_FIXED_PROFILE.keyLightIntensity, `${artifact.png} Key drifted`)
  assert(key.flat_shading_mix === P41_EMISSION_FIXED_PROFILE.flatShadingMix, `${artifact.png} flat shading drifted`)
  assert(equal(key.direction, P41_EMISSION_FIXED_PROFILE.direction), `${artifact.png} direction drifted`)
  const curve = record(artifact.diagnostics.emission_curve, `${artifact.png} curve diagnostics`)
  assert(curve.model_version === profile.modelVersion && curve.sample_step === profile.sampleStep && curve.sample_count === profile.samples.length, `${artifact.png} LUT diagnostics drifted`)
  const resolved = artifactProfile(artifact)
  assert(resolved.overrideProvenance === 'phase41-diagnostic-override', `${artifact.png} must retain diagnostic-only provenance`)
  assert(resolved.productionSource === 'PLANET_VISUAL_DEFAULTS', `${artifact.png} must retain production provenance`)
  assert(equal(resolved.curve, profile), `${artifact.png} resolved LUT drifted`)
  assert(equal(resolved.bloom, P41_EMISSION_BLOOM_OFF), `${artifact.png} profile Bloom drifted`)
}

function rowComparable(artifact: Artifact): Record<string, unknown> {
  const profile = artifactProfile(artifact)
  return {
    rating: artifact.rating,
    emission: emission(artifact),
    fixture: artifact.fixture,
    movieId: artifact.movieId,
    hue: artifact.hue,
    genres: artifact.genres,
    profile: {
      lightness: profile.lightness,
      chroma: profile.chroma,
      keyLightIntensity: profile.keyLightIntensity,
      direction: profile.direction,
      bloom: profile.bloom,
      flatShadingMix: profile.flatShadingMix,
      camera: profile.camera,
      seed: profile.seed,
      rotation: profile.rotation,
    },
  }
}

function assertMatrix(artifacts: readonly Artifact[], profile: RatingMidrankCdfLutProfile): void {
  const expected = P41_EMISSION_FIXTURE_ROWS.length * P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS.length
  assert(artifacts.length === expected, `matrix has ${artifacts.length} cells; expected ${expected}`)
  const seen = new Set<string>()
  for (const artifact of artifacts) {
    const key = cellKey(artifact.fixture, artifact.rating)
    assert(!seen.has(key), `duplicate matrix cell ${artifact.fixture}/${artifact.rating}`)
    seen.add(key)
    assertArtifact(artifact, profile)
  }
  for (const fixture of P41_EMISSION_FIXTURE_ROWS) {
    const row = artifacts.filter((artifact) => artifact.fixture === fixture)
    assert(row.length === P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS.length, `${fixture} row is incomplete`)
    const baseline = rowComparable(row[0]!)
    for (const artifact of row.slice(1)) assertP41EmissionRatingOnlyVariation(baseline, rowComparable(artifact))
  }
}

async function renderCell(fixture: string, rating: number, profile: RatingMidrankCdfLutProfile, sourceSha256: string): Promise<Artifact> {
  const loaded = await loadFixture(fixture, sourceSha256)
  const movieId = number(loaded.movie.id, `${fixture} movie id`)
  const title = text(loaded.movie.title, `${fixture} title`)
  const sourceVoteAverage = number(loaded.movie.vote_average, `${fixture} source vote average`)
  const voteCount = number(loaded.movie.vote_count, `${fixture} vote count`)
  const hue = number(loaded.movie.genre_hue, `${fixture} hue`)
  const genres = loaded.movie.genres
  assert(Array.isArray(genres) && genres.length > 0 && genres.every((genre) => typeof genre === 'string'), `${fixture} genres are invalid`)
  const fileName = `${fixture}__rating-${ratingLabel(rating)}.png`
  const source: DataSource = { kind: 'file', label: `phase41-baseline-fixture:${fixture};cdf-lut-controlled-rating=${ratingLabel(rating)}`, bytes: controlledFixtureBytes(loaded.bytes, fixture, rating) }
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
  const render = await renderPhase41DiagnosticInBrowser(args, source, root, profileOverride(profile))
  assertPngSafe(render.png, resolution)
  const diagnostics = render.visualDiagnostics
  const seed = number(record(diagnostics.noise, `${fileName} noise`).seed, `${fileName} seed`)
  const metadata = metadataFor(args, source, render, getGitCommit(root))
  delete metadata.generated_at
  const sidecar = `${fileName}.render.json`
  await writeArtifactsAtomically(
    { png: path.join(directory, 'cells', fileName), metadata: path.join(directory, 'cells', sidecar) },
    render.png,
    {
      ...metadata,
      p41_5_midrank_cdf_lut: {
        status: 'pending-human-review',
        human_review_required: true,
        candidate: P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE,
        fixture,
        controlled_rating: rating,
        source_vote_average: sourceVoteAverage,
        source_vote_count: voteCount,
        fixture_hue: hue,
        fixture_genres: genres,
        fixture_seed: seed,
        diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
        override: profileOverride(profile),
        fixed_profile: P41_EMISSION_FIXED_PROFILE,
        allowed_variation_fields: P41_EMISSION_ALLOWED_VARIATION_FIELDS,
      },
    },
  )
  return { fixture, rating, movieId, title, sourceVoteAverage, voteCount, hue, genres, seed, png: `cells/${fileName}`, sidecar: `cells/${sidecar}`, pngSha256: sha256(render.png), diagnostics }
}

function contactSheetInput(artifacts: readonly Artifact[]): ContactSheetInput {
  return {
    title: 'P41.5 rating-midrank-cdf-lut-v1 · Bloom OFF · pending-human-review',
    rows: P41_EMISSION_FIXTURE_ROWS.map((fixture) => {
      const artifact = artifacts.find((entry) => entry.fixture === fixture)!
      return { key: fixture, label: `${fixture} · hue=${artifact.hue.toFixed(3)} · seed=${artifact.seed} · genres=${artifact.genres.length}` }
    }),
    columns: P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS.map((rating) => ({ key: ratingLabel(rating), label: `rating ${ratingLabel(rating)}` })),
    cells: artifacts.map((artifact) => ({
      rowKey: artifact.fixture,
      columnKey: ratingLabel(artifact.rating),
      input: artifact.png,
      caption: [
        'candidate=rating-midrank-cdf-lut-v1',
        `rating=${ratingLabel(artifact.rating)} emission=${emission(artifact).toFixed(6)}`,
        'Bloom=OFF · L=0.660 · Key=0.450 · Flat=0.800',
      ].join('\n'),
      parameters: {
        candidate: 'rating-midrank-cdf-lut-v1', rating: artifact.rating, emission: emission(artifact), bloom: 'OFF',
        fixed_profile: 'L=0.660 Key=0.450 Flat=0.800', fixture: artifact.fixture, hue: artifact.hue, seed: artifact.seed,
        genres: artifact.genres, png: artifact.png, sidecar: artifact.sidecar,
      },
    })),
  }
}

async function verifyPublishedEvidence(artifacts: readonly Artifact[], profile: RatingMidrankCdfLutProfile, profileManifest: string, sourceSha256: string): Promise<void> {
  const cells = await fs.readdir(path.join(directory, 'cells'))
  const expected = artifacts.length
  assert(cells.filter((file) => file.endsWith('.png')).length === expected, 'cells directory has incomplete or stale PNG artifacts')
  assert(cells.filter((file) => file.endsWith('.png.render.json')).length === expected, 'cells directory has incomplete or stale sidecars')
  for (const artifact of artifacts) {
    const png = await fs.readFile(path.join(directory, artifact.png))
    const sidecar = record(JSON.parse(await fs.readFile(path.join(directory, artifact.sidecar), 'utf8')) as unknown, artifact.sidecar)
    assert(sha256(png) === artifact.pngSha256 && sidecar.png_sha256 === artifact.pngSha256, `${artifact.png} hash drifted`)
    assert(sidecar.chronicle_git_commit === getGitCommit(root), `${artifact.sidecar} Git commit drifted`)
    const candidateEvidence = record(sidecar.p41_5_midrank_cdf_lut, `${artifact.sidecar} candidate evidence`)
    assert(candidateEvidence.status === 'pending-human-review' && candidateEvidence.human_review_required === true, `${artifact.sidecar} candidate review status drifted`)
    assert(candidateEvidence.controlled_rating === artifact.rating && candidateEvidence.fixture === artifact.fixture, `${artifact.sidecar} controlled matrix coordinates drifted`)
    assert(equal(candidateEvidence.fixed_profile, P41_EMISSION_FIXED_PROFILE), `${artifact.sidecar} fixed profile drifted`)
    assert(equal(candidateEvidence.allowed_variation_fields, P41_EMISSION_ALLOWED_VARIATION_FIELDS), `${artifact.sidecar} allowed variation fields drifted`)
  }
  const profileManifestBytes = await fs.readFile(path.join(directory, 'profile.manifest.json'))
  assert(profileManifestBytes.toString('utf8') === profileManifest, 'published profile manifest bytes drifted')
  assertP41MidrankCdfLutEvidenceManifest(JSON.parse(profileManifestBytes.toString('utf8')) as Parameters<typeof assertP41MidrankCdfLutEvidenceManifest>[0])
  const contactManifestBytes = await fs.readFile(path.join(directory, 'contact-sheet.manifest.json'))
  const contactManifest = record(JSON.parse(contactManifestBytes.toString('utf8')) as unknown, 'contact sheet manifest')
  assert(Array.isArray(contactManifest.sources) && contactManifest.sources.length === expected, 'contact sheet manifest is incomplete')
  const validation = record(JSON.parse(await fs.readFile(path.join(directory, 'validation.json'), 'utf8')) as unknown, 'validation')
  assert(validation.source_sha256 === sourceSha256, 'validation source hash drifted')
  assert(validation.profile_sha256 === sha256(profileManifest), 'validation profile hash drifted')
  const validationHashes = record(validation.hashes, 'validation hashes')
  assert(validationHashes.contact_sheet_sha256 === sha256(await fs.readFile(path.join(directory, 'contact-sheet.png'))), 'validation contact-sheet PNG hash drifted')
  assert(validationHashes.contact_sheet_manifest_sha256 === sha256(contactManifestBytes), 'validation contact-sheet manifest hash drifted')
  assert(stable(validation.profile) === stable(profile), 'validation LUT drifted')
}

async function main(): Promise<void> {
  assertP41EmissionEvidenceContract()
  const { galaxy, sourceSha256 } = await loadAuthoritativeGalaxy(root)
  assert(sourceSha256 === P41_EMISSION_AUTHORITATIVE_DATA.sha256, 'authoritative gzip SHA-256 drifted')
  assert(galaxy.meta.version === P41_EMISSION_AUTHORITATIVE_DATA.dataVersion, 'authoritative data version drifted')
  assert(galaxy.movies.length === P41_EMISSION_AUTHORITATIVE_DATA.movieCount, 'authoritative movie count drifted')
  const sortedRatings = galaxy.movies.map((movie) => movie.vote_average).sort((left, right) => left - right)
  const profile = validateRatingMidrankCdfLutProfile(generateRatingMidrankCdfLutProfile(sortedRatings))
  const gitCommit = getGitCommit(root)
  const profileManifest = serializeP41MidrankCdfLutEvidenceManifest(createP41MidrankCdfLutEvidenceManifest(profile, gitCommit))
  const historicalEvidence = await snapshotHistoricalEvidence()
  const previousHashes = await existingEvidenceHashes()

  await fs.rm(directory, { recursive: true, force: true })
  await fs.mkdir(path.join(directory, 'cells'), { recursive: true })
  await fs.writeFile(path.join(directory, 'profile.manifest.json'), profileManifest, 'utf8')

  const artifacts: Artifact[] = []
  for (const fixture of P41_EMISSION_FIXTURE_ROWS) {
    for (const rating of P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS) artifacts.push(await renderCell(fixture, rating, profile, sourceSha256))
  }
  assertMatrix(artifacts, profile)
  await generateContactSheet(contactSheetInput(artifacts), { inputRoot: directory, outputDirectory: directory, workingDirectory: root, gitCommit, command })
  const contactSheetBytes = await fs.readFile(path.join(directory, 'contact-sheet.png'))
  const contactManifestBytes = await fs.readFile(path.join(directory, 'contact-sheet.manifest.json'))
  await writeStableJson(path.join(directory, 'validation.json'), {
    schema_version: 'p41.5-midrank-cdf-lut-validation-v1', status: 'pending-human-review', human_review_required: true,
    evidence_directory: P41_MIDRANK_CDF_LUT_EVIDENCE_RELATIVE_DIRECTORY, reproduction_command: command, git_commit: gitCommit,
    candidate: P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE, source_path: P41_EMISSION_AUTHORITATIVE_DATA.relativePath,
    source_sha256: sourceSha256, data_version: galaxy.meta.version, movie_count: galaxy.movies.length,
    profile, profile_manifest: 'profile.manifest.json', profile_sha256: sha256(profileManifest),
    matrix: { rows: P41_EMISSION_FIXTURE_ROWS, columns: P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS, expected_cells: artifacts.length },
    fixed_profile: P41_EMISSION_FIXED_PROFILE, allowed_variation_fields: P41_EMISSION_ALLOWED_VARIATION_FIELDS,
    hashes: { source_sha256: sourceSha256, profile_sha256: sha256(profileManifest), contact_sheet_sha256: sha256(contactSheetBytes), contact_sheet_manifest_sha256: sha256(contactManifestBytes) },
    assertions: { authoritative_gzip_only: 'pass', sorted_final_movies: 'pass', lut_finite_monotonic_exact_endpoints: 'pass', fixture_source_hashes: 'pass', rating_emission_only_variation: 'pass', bloom_off: 'pass', historical_anchored_smoothstep_unchanged: 'pass', png_hashes: 'pass', contact_sheet_manifest: 'pass' },
    cells: artifacts.map((artifact) => ({ fixture: artifact.fixture, rating: artifact.rating, emission: emission(artifact), png: artifact.png, sidecar: artifact.sidecar, png_sha256: artifact.pngSha256, movie_id: artifact.movieId, title: artifact.title, hue: artifact.hue, seed: artifact.seed, genres: artifact.genres, source_vote_average: artifact.sourceVoteAverage, vote_count: artifact.voteCount })),
  })
  await verifyPublishedEvidence(artifacts, profile, profileManifest, sourceSha256)
  assertHistoricalEvidenceUnchanged(historicalEvidence, await snapshotHistoricalEvidence())
  if (previousHashes !== undefined) {
    assert(equal(previousHashes, await existingEvidenceHashes()), 'same source, Git commit, fixtures, and profile must reproduce byte-stable evidence')
  }
  console.log(JSON.stringify({ evidence_directory: P41_MIDRANK_CDF_LUT_EVIDENCE_RELATIVE_DIRECTORY, rows: P41_EMISSION_FIXTURE_ROWS.length, columns: P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS.length, cells: artifacts.length, command, status: 'pending-human-review' }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})