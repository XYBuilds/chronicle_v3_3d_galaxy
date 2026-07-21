import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import { P41_4_SEMANTIC_FUTURE_ROWS, P41_4_VISIBLE_BAND_CAP } from './p41FixedShaping.js'

export const PHASE41_CONTROLLED_RATINGS = [4.0, 4.5, 5.5, 6.5, 7.5, 8.2, 9.5] as const
export const PHASE41_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/baseline'
export const AUTHORITATIVE_GZIP_RELATIVE_PATH = 'frontend/public/data/galaxy_data.json.gz'

/** Historical P39.11 reference copied into each Phase 41 baseline manifest. */
export const P39_11_PRODUCTION_BASELINE = {
  source_validation: 'data/runs/phase39-p39.11/final/validation.json',
  production_config: {
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
  },
  baseline_png: {
    path: 'data/runs/phase39-p39.11/final/controlled-rating-5-bloom-on.png',
    sha256: 'dcb5a721094808219b90ecd930c310301bc4c323ea474a4a097644485636cd08',
    sidecar: 'data/runs/phase39-p39.11/final/controlled-rating-5-bloom-on.png.render.json',
  },
} as const

export type JsonRecord = Record<string, unknown>
export type Phase41Movie = JsonRecord & {
  id: number
  title: string
  genres: string[]
  genre_hue: number
  vote_average: number
  vote_count: number
}
export type Phase41Galaxy = {
  meta: JsonRecord & { version: string; count: number }
  movies: Phase41Movie[]
}
export type Distribution = {
  min: number
  max: number
  p50: number
  p90: number
  p99: number
}
export type Phase41BaselineSummary = {
  schema_version: 'phase41-baseline-v1'
  source: {
    relative_path: typeof AUTHORITATIVE_GZIP_RELATIVE_PATH
    sha256: string
    data_version: string
  }
  movie_count: number
  rating: Distribution & {
    count_4_5_to_7_5: number
    count_gte_9: number
  }
  vote_count: Distribution
  p39_11_production_baseline: typeof P39_11_PRODUCTION_BASELINE
}
export type Phase41Fixture = Phase41Galaxy & {
  phase41_fixture: {
    kind: 'controlled-rating' | 'real'
    label: string
    source_movie_id: number
    source_sha256: string
    selection: string
  }
}
export type Phase41FixtureSet = {
  controlled: ReadonlyMap<number, Phase41Fixture>
  real: ReadonlyMap<string, Phase41Fixture>
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P41.1 baseline] ${message}`)
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertRecord(value: unknown, label: string): asserts value is JsonRecord {
  assert(isRecord(value), `${label} must be an object`)
}

function finite(value: unknown, label: string): asserts value is number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`)
}

function nonEmpty(value: unknown, label: string): asserts value is string {
  assert(typeof value === 'string' && value.trim().length > 0, `${label} must be a non-empty string`)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sortedNumbers(values: readonly number[]): number[] {
  return [...values].sort((left, right) => left - right)
}

/** Nearest-rank percentile: deterministic and independent of host locale. */
export function nearestRankPercentile(values: readonly number[], percentile: number): number {
  assert(values.length > 0, 'percentile requires at least one value')
  assert(Number.isFinite(percentile) && percentile >= 0 && percentile <= 100, 'percentile must be in [0, 100]')
  const sorted = sortedNumbers(values)
  return sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)]!
}

function distribution(values: readonly number[]): Distribution {
  const sorted = sortedNumbers(values)
  return {
    min: sorted[0]!,
    max: sorted.at(-1)!,
    p50: nearestRankPercentile(sorted, 50),
    p90: nearestRankPercentile(sorted, 90),
    p99: nearestRankPercentile(sorted, 99),
  }
}

function assertCompleteMovie(value: unknown, index: number): asserts value is Phase41Movie {
  assertRecord(value, `movies[${index}]`)
  finite(value.id, `movies[${index}].id`)
  assert(Number.isSafeInteger(value.id) && value.id > 0, `movies[${index}].id must be a positive safe integer`)
  nonEmpty(value.title, `movies[${index}].title`)
  assert(Array.isArray(value.genres) && value.genres.length > 0 && value.genres.every((genre) => typeof genre === 'string' && genre.trim().length > 0), `movies[${index}].genres must be non-empty strings`)
  finite(value.genre_hue, `movies[${index}].genre_hue`)
  finite(value.vote_average, `movies[${index}].vote_average`)
  finite(value.vote_count, `movies[${index}].vote_count`)
  assert(value.vote_count >= 0, `movies[${index}].vote_count must be non-negative`)
  assert(Array.isArray(value.genre_color) && value.genre_color.length === 3 && value.genre_color.every((channel) => typeof channel === 'number' && Number.isFinite(channel)), `movies[${index}].genre_color must be three finite values`)
}

export function parsePhase41Galaxy(value: unknown): Phase41Galaxy {
  assertRecord(value, 'payload')
  assertRecord(value.meta, 'payload.meta')
  nonEmpty(value.meta.version, 'payload.meta.version')
  finite(value.meta.count, 'payload.meta.count')
  assert(Number.isSafeInteger(value.meta.count) && value.meta.count > 0, 'payload.meta.count must be a positive safe integer')
  assert(Array.isArray(value.movies) && value.movies.length > 0, 'payload.movies must be non-empty')
  assert(value.meta.count === value.movies.length, `payload.meta.count (${value.meta.count}) must equal movies.length (${value.movies.length})`)
  const ids = new Set<number>()
  value.movies.forEach((movie, index) => {
    assertCompleteMovie(movie, index)
    assert(!ids.has(movie.id), `movies[${index}].id duplicates ${movie.id}`)
    ids.add(movie.id)
  })
  return { meta: value.meta as Phase41Galaxy['meta'], movies: value.movies as Phase41Movie[] }
}

function assertGzip(bytes: Buffer, file: string): void {
  assert(bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b, `${file} must be a gzip stream; uncompressed JSON is forbidden`)
}

export function parseAuthoritativeGzip(bytes: Buffer, file = AUTHORITATIVE_GZIP_RELATIVE_PATH): Phase41Galaxy {
  assertGzip(bytes, file)
  let parsed: unknown
  try {
    parsed = JSON.parse(gunzipSync(bytes).toString('utf8')) as unknown
  } catch (error) {
    throw new Error(`[P41.1 baseline] ${file} cannot be decompressed and parsed: ${error instanceof Error ? error.message : String(error)}`)
  }
  return parsePhase41Galaxy(parsed)
}

export async function loadAuthoritativeGalaxy(root: string, inputPath?: string): Promise<{ galaxy: Phase41Galaxy; sourceSha256: string }> {
  const expected = path.resolve(root, AUTHORITATIVE_GZIP_RELATIVE_PATH)
  const candidate = inputPath === undefined ? expected : path.resolve(inputPath)
  assert(candidate === expected, `authoritative input must be ${AUTHORITATIVE_GZIP_RELATIVE_PATH}; received ${candidate}`)
  const bytes = await fs.readFile(expected).catch((error: unknown) => {
    throw new Error(`[P41.1 baseline] authoritative gzip is unavailable at ${expected}: ${error instanceof Error ? error.message : String(error)}`)
  })
  return { galaxy: parseAuthoritativeGzip(bytes, AUTHORITATIVE_GZIP_RELATIVE_PATH), sourceSha256: createHash('sha256').update(bytes).digest('hex') }
}

export function summarizePhase41Baseline(galaxy: Phase41Galaxy, sourceSha256: string): Phase41BaselineSummary {
  assert(/^[a-f0-9]{64}$/i.test(sourceSha256), 'source SHA-256 must be 64 hexadecimal characters')
  const ratings = galaxy.movies.map((movie) => movie.vote_average)
  const voteCounts = galaxy.movies.map((movie) => movie.vote_count)
  const ratingDistribution = distribution(ratings)
  return {
    schema_version: 'phase41-baseline-v1',
    source: { relative_path: AUTHORITATIVE_GZIP_RELATIVE_PATH, sha256: sourceSha256, data_version: galaxy.meta.version },
    movie_count: galaxy.movies.length,
    rating: {
      ...ratingDistribution,
      count_4_5_to_7_5: ratings.filter((rating) => rating >= 4.5 && rating <= 7.5).length,
      count_gte_9: ratings.filter((rating) => rating >= 9).length,
    },
    vote_count: distribution(voteCounts),
    p39_11_production_baseline: P39_11_PRODUCTION_BASELINE,
  }
}

/** Same xmur3 contract as the Focus planet, kept dependency-free for Node evidence selection. */
export function phase41NoiseSeed(movieId: number): number {
  assert(Number.isSafeInteger(movieId) && movieId > 0, 'noise seed movie id must be a positive safe integer')
  const text = String(movieId)
  let hash = 1779033703 ^ text.length
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
  return (hash ^ (hash >>> 16)) >>> 0
}

function compareBy(...comparators: Array<(left: Phase41Movie, right: Phase41Movie) => number>): (left: Phase41Movie, right: Phase41Movie) => number {
  return (left, right) => {
    for (const comparator of comparators) {
      const result = comparator(left, right)
      if (result !== 0) return result
    }
    return left.id - right.id
  }
}

function fixtureFromMovie(galaxy: Phase41Galaxy, movie: Phase41Movie, sourceSha256: string, kind: 'controlled-rating' | 'real', label: string, selection: string, rating?: number): Phase41Fixture {
  const fixtureMovie = cloneJson(movie)
  if (rating !== undefined) fixtureMovie.vote_average = rating
  return {
    meta: { ...cloneJson(galaxy.meta), count: 1, version: `${galaxy.meta.version}-p41.1-${kind}-${label}` },
    movies: [fixtureMovie],
    phase41_fixture: { kind, label, source_movie_id: movie.id, source_sha256: sourceSha256, selection },
  }
}

function pickDistinct(candidates: readonly Phase41Movie[], used: Set<number>, label: string): Phase41Movie {
  const selected = candidates.find((movie) => !used.has(movie.id))
  assert(selected, `no distinct movie available for ${label}`)
  used.add(selected.id)
  return selected
}

function controlledRatingLabel(rating: number): string {
  return rating === 4 ? '4.0' : String(rating)
}

function semanticFixtureSelection(row: typeof P41_4_SEMANTIC_FUTURE_ROWS[number]): string {
  return `first authoritative gzip movie with primary genre in ${row.paletteFamily} categorical palette family and ${row.terrainComplexity} (${row.expectedVisibleBandCount} visible bands; cap=${P41_4_VISIBLE_BAND_CAP}); source order is preserved; hue and seed are not selection criteria`
}

function pickSemanticFutureFixture(source: readonly Phase41Movie[], row: typeof P41_4_SEMANTIC_FUTURE_ROWS[number]): Phase41Movie {
  const primaryGenres: readonly string[] = row.primaryGenres
  const selected = source.find((movie) => {
    const visibleBandCount = Math.min(movie.genres.length, P41_4_VISIBLE_BAND_CAP)
    return primaryGenres.includes(movie.genres[0]!) && visibleBandCount === row.expectedVisibleBandCount
  })
  assert(selected, `no authoritative movie satisfies future semantic row ${row.fixture}`)
  return selected
}

/**
 * Picks seven distinct, fully preserved source records. Labels describe the deterministic
 * order rather than subjective quality; each ordering ends with the TMDB id tie-break.
 */
export function createPhase41Fixtures(galaxy: Phase41Galaxy, sourceSha256: string): Phase41FixtureSet {
  const source = [...galaxy.movies]
  assert(source.length >= 7, 'at least seven movies are required for distinct real fixtures')
  const controlledSource = [...source].sort(compareBy(
    (left, right) => right.genres.length - left.genres.length,
    (left, right) => right.vote_count - left.vote_count,
  ))[0]!
  const controlled = new Map(PHASE41_CONTROLLED_RATINGS.map((rating) => [
    rating,
    fixtureFromMovie(galaxy, controlledSource, sourceSha256, 'controlled-rating', controlledRatingLabel(rating), 'highest genre count, then vote_count, then TMDB id', rating),
  ]))

  const used = new Set<number>()
  const highRatingLowVotes = pickDistinct([...source].filter((movie) => movie.vote_average >= 9).sort(compareBy(
    (left, right) => left.vote_count - right.vote_count,
    (left, right) => right.vote_average - left.vote_average,
  )), used, 'high-rating-low-votes')
  const selections: Array<[string, Phase41Movie, string]> = [
    ['hue-low', pickDistinct([...source].sort(compareBy((left, right) => left.genre_hue - right.genre_hue)), used, 'hue-low'), 'lowest genre_hue'],
    ['hue-high', pickDistinct([...source].sort(compareBy((left, right) => right.genre_hue - left.genre_hue)), used, 'hue-high'), 'highest genre_hue'],
    ['seed-low', pickDistinct([...source].sort(compareBy((left, right) => phase41NoiseSeed(left.id) - phase41NoiseSeed(right.id))), used, 'seed-low'), 'lowest xmur3-derived noise seed'],
    ['seed-high', pickDistinct([...source].sort(compareBy((left, right) => phase41NoiseSeed(right.id) - phase41NoiseSeed(left.id))), used, 'seed-high'), 'highest xmur3-derived noise seed'],
    ['genres-min', pickDistinct([...source].sort(compareBy((left, right) => left.genres.length - right.genres.length)), used, 'genres-min'), 'fewest genre bands'],
    ['genres-max', pickDistinct([...source].sort(compareBy((left, right) => right.genres.length - left.genres.length)), used, 'genres-max'), 'most genre bands'],
    ['high-rating-low-votes', highRatingLowVotes, 'rating >= 9; lowest vote_count, then highest rating'],
  ]
  const real = new Map(selections.map(([label, movie, selection]) => [
    label,
    fixtureFromMovie(galaxy, movie, sourceSha256, 'real', label, selection),
  ]))
  return { controlled, real }
}

/** Additive future-only fixture set; avoids altering P41.1's established fixtures. */
export function createPhase41SemanticFixtures(galaxy: Phase41Galaxy, sourceSha256: string): ReadonlyMap<string, Phase41Fixture> {
  const source = [...galaxy.movies]
  const fixtures = new Map(P41_4_SEMANTIC_FUTURE_ROWS.map((row) => [
    row.fixture,
    fixtureFromMovie(galaxy, pickSemanticFutureFixture(source, row), sourceSha256, 'real', row.fixture, semanticFixtureSelection(row)),
  ]))
  assertPhase41SemanticFixtureCoverage(fixtures)
  return fixtures
}

export function assertPhase41SemanticFixtureCoverage(fixtures: ReadonlyMap<string, Phase41Fixture>): void {
  assert(fixtures.size === P41_4_SEMANTIC_FUTURE_ROWS.length, 'semantic fixture set is incomplete')
  const families = new Set<string>()
  const complexities = new Set<number>()
  const hues: number[] = []
  for (const row of P41_4_SEMANTIC_FUTURE_ROWS) {
    const fixture = fixtures.get(row.fixture)
    assert(fixture, `semantic fixture ${row.fixture} is missing`)
    const movie = fixture.movies[0]!
    const primaryGenres: readonly string[] = row.primaryGenres
    assert(!/hue-(low|high)|seed-(low|high)/.test(row.fixture), `${row.fixture} must not encode hue or seed ordering`)
    assert(primaryGenres.includes(movie.genres[0]!), `${row.fixture} primary genre is outside its palette family`)
    assert(Math.min(movie.genres.length, P41_4_VISIBLE_BAND_CAP) === row.expectedVisibleBandCount, `${row.fixture} visible band count drifted`)
    assert(fixture.phase41_fixture.selection.includes('hue and seed are not selection criteria'), `${row.fixture} selection predicate must reject hue and seed ordering`)
    families.add(row.paletteFamily)
    complexities.add(row.expectedVisibleBandCount)
    hues.push(movie.genre_hue)
  }
  assert(families.size >= 3, 'semantic fixture set must cover three palette families')
  assert(complexities.has(1) && complexities.has(P41_4_VISIBLE_BAND_CAP), 'semantic fixture set must cover single and maximum visible bands')
  for (let index = 0; index < hues.length; index += 1) {
    for (let other = index + 1; other < hues.length; other += 1) {
      const delta = Math.abs(hues[index]! - hues[other]!) % (Math.PI * 2)
      const circularDistance = Math.min(delta, (Math.PI * 2) - delta)
      assert(circularDistance > (Math.PI / 18), 'semantic fixture hues must not duplicate across the circular wrap-around boundary')
    }
  }
}

async function writeJsonAtomically(file: string, value: unknown): Promise<void> {
  const directory = path.dirname(file)
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.tmp`)
  await fs.mkdir(directory, { recursive: true })
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await fs.rename(temporary, file)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

export async function writePhase41Baseline(root: string, inputPath?: string): Promise<{ summary: Phase41BaselineSummary; outputDirectory: string }> {
  const { galaxy, sourceSha256 } = await loadAuthoritativeGalaxy(root, inputPath)
  const summary = summarizePhase41Baseline(galaxy, sourceSha256)
  const fixtures = createPhase41Fixtures(galaxy, sourceSha256)
  const outputDirectory = path.resolve(root, PHASE41_EVIDENCE_RELATIVE_DIRECTORY)
  await writeJsonAtomically(path.join(outputDirectory, 'baseline-summary.json'), summary)
  for (const [rating, fixture] of fixtures.controlled) {
    await writeJsonAtomically(path.join(outputDirectory, 'fixtures', `controlled-rating-${controlledRatingLabel(rating)}.json`), fixture)
  }
  for (const [label, fixture] of fixtures.real) {
    await writeJsonAtomically(path.join(outputDirectory, 'fixtures', `real-${label}.json`), fixture)
  }
  await fs.rm(path.join(outputDirectory, 'fixtures', 'controlled-rating-4.json'), { force: true })
  return { summary, outputDirectory }
}

/** Writes only the additive, semantic rows used by future P41.4 evidence sheets. */
export async function writePhase41SemanticFixtures(root: string): Promise<{ outputDirectory: string }> {
  const { galaxy, sourceSha256 } = await loadAuthoritativeGalaxy(root)
  const fixtures = createPhase41SemanticFixtures(galaxy, sourceSha256)
  const outputDirectory = path.resolve(root, PHASE41_EVIDENCE_RELATIVE_DIRECTORY, 'fixtures', 'semantic')
  for (const [label, fixture] of fixtures) {
    await writeJsonAtomically(path.join(outputDirectory, `real-${label}.json`), fixture)
  }
  return { outputDirectory }
}