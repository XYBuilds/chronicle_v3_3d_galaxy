import { promises as fs } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

export const CONTROLLED_VOTE_AVERAGES = [0, 4, 5, 10] as const
export const PHASE39_FIXED_MOVIE_ID = 157336

export type JsonRecord = Record<string, unknown>

type GalaxyFixture = JsonRecord & {
  meta: JsonRecord
  movies: JsonRecord[]
}

type RealSample = {
  tier: string
  tmdb_id: number
  title: string
  vote_average: number
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRecord(value: unknown, label: string): asserts value is JsonRecord {
  if (!isRecord(value)) throw new Error(`[P39.7 fixture] ${label} must be an object`)
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[P39.7 fixture] ${label} must be a finite number`)
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`[P39.7 fixture] ${label} must be a non-empty string`)
  }
}

export function parseGalaxyFixture(value: unknown): GalaxyFixture {
  assertRecord(value, 'fixture')
  assertRecord(value.meta, 'fixture.meta')
  if (!Array.isArray(value.movies) || value.movies.length === 0) {
    throw new Error('[P39.7 fixture] fixture.movies must contain at least one movie')
  }
  for (const [index, movie] of value.movies.entries()) assertRecord(movie, `fixture.movies[${index}]`)
  return { ...value, meta: value.meta, movies: value.movies }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function movieId(movie: JsonRecord, label: string): number {
  assertFiniteNumber(movie.id, `${label}.id`)
  if (!Number.isSafeInteger(movie.id) || movie.id <= 0) throw new Error(`[P39.7 fixture] ${label}.id must be a positive safe integer`)
  return movie.id
}

function singleMovieFixture(source: GalaxyFixture, movie: JsonRecord, version: string): GalaxyFixture {
  const fixture = cloneJson(source)
  fixture.movies = [cloneJson(movie)]
  fixture.meta = { ...fixture.meta, version, count: 1 }
  return fixture
}

/**
 * Creates three offline datasets from one canonical movie record. The copied
 * record preserves every visual input; vote_average is the only mutation.
 */
export function createControlledFixtures(source: GalaxyFixture): Map<number, GalaxyFixture> {
  if (source.movies.length !== 1) throw new Error('[P39.7 fixture] controlled source must contain exactly one movie')
  const movie = source.movies[0]!
  if (movieId(movie, 'controlled movie') !== PHASE39_FIXED_MOVIE_ID) {
    throw new Error(`[P39.7 fixture] controlled source movie must be ${PHASE39_FIXED_MOVIE_ID}`)
  }
  assertFiniteNumber(movie.vote_average, 'controlled movie.vote_average')
  const sourceVersion = source.meta.version
  assertNonEmptyString(sourceVersion, 'fixture.meta.version')

  const controlledVersion = `${sourceVersion}-p39.7-controlled`
  return new Map(CONTROLLED_VOTE_AVERAGES.map((voteAverage) => {
    const controlledMovie = { ...cloneJson(movie), vote_average: voteAverage }
    return [voteAverage, singleMovieFixture(source, controlledMovie, controlledVersion)]
  }))
}

/**
 * Extracts P39.1's real samples from an available canonical derived export.
 * IDs are fixed by P39.1; rating drift is preserved and recorded from the
 * supplied snapshot instead of mutating a real movie back to an old rating.
 */
export function createRealSampleFixtures(source: GalaxyFixture, samples: readonly RealSample[]): Map<string, GalaxyFixture> {
  const byId = new Map(source.movies.map((movie) => [movieId(movie, 'source movie'), movie]))
  const sourceVersion = source.meta.version
  assertNonEmptyString(sourceVersion, 'fixture.meta.version')
  const output = new Map<string, GalaxyFixture>()

  for (const sample of samples) {
    const movie = byId.get(sample.tmdb_id)
    if (!movie) throw new Error(`[P39.7 fixture] real ${sample.tier} movie ${sample.tmdb_id} is absent from supplied derived data`)
    assertFiniteNumber(movie.vote_average, `real ${sample.tier} movie.vote_average`)
    const fixture = singleMovieFixture(source, movie, `${sourceVersion}-p39.7-real-${sample.tier}`)
    fixture.phase39_p39_7_real_sample = {
      tier: sample.tier,
      tmdb_id: sample.tmdb_id,
      title: sample.title,
      p39_1_recorded_vote_average: sample.vote_average,
      snapshot_vote_average: movie.vote_average,
    }
    output.set(sample.tier, fixture)
  }
  return output
}

export async function writeFixtureSet(directory: string, fixtures: ReadonlyMap<string | number, GalaxyFixture>, prefix: string): Promise<string[]> {
  await fs.mkdir(directory, { recursive: true })
  const paths: string[] = []
  for (const [label, fixture] of fixtures) {
    const output = path.join(directory, `${prefix}-${label}.json`)
    await fs.writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
    paths.push(output)
  }
  return paths
}

function parseCliArguments(argv: string[]): { baselineFile: string; outputDirectory: string; realDataFile?: string } {
  const values = new Map<string, string>()
  const allowed = new Set(['baseline-file', 'output-dir', 'real-data-file'])
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || !allowed.has(flag.slice(2)) || !value || value.startsWith('--') || values.has(flag.slice(2))) {
      throw new Error('usage: tsx phase39Fixtures.ts --baseline-file FILE --output-dir DIR [--real-data-file FILE]')
    }
    values.set(flag.slice(2), value)
    index += 1
  }
  const baselineFile = values.get('baseline-file')
  const outputDirectory = values.get('output-dir')
  if (!baselineFile || !outputDirectory) throw new Error('usage: tsx phase39Fixtures.ts --baseline-file FILE --output-dir DIR [--real-data-file FILE]')
  return { baselineFile: path.resolve(baselineFile), outputDirectory: path.resolve(outputDirectory), realDataFile: values.get('real-data-file') ? path.resolve(values.get('real-data-file')!) : undefined }
}

function realSamplesFromBaseline(baseline: GalaxyFixture): RealSample[] {
  assertRecord(baseline.phase39_contract_baseline, 'phase39_contract_baseline')
  const value = baseline.phase39_contract_baseline.real_sample_ids
  if (!Array.isArray(value) || value.length !== 3) throw new Error('[P39.7 fixture] baseline real_sample_ids must contain exactly low/mid/high samples')
  return value.map((sample, index) => {
    assertRecord(sample, `real_sample_ids[${index}]`)
    assertNonEmptyString(sample.tier, `real_sample_ids[${index}].tier`)
    assertFiniteNumber(sample.tmdb_id, `real_sample_ids[${index}].tmdb_id`)
    assertNonEmptyString(sample.title, `real_sample_ids[${index}].title`)
    assertFiniteNumber(sample.vote_average, `real_sample_ids[${index}].vote_average`)
    return { tier: sample.tier, tmdb_id: sample.tmdb_id, title: sample.title, vote_average: sample.vote_average }
  })
}

async function readGalaxyFixture(file: string): Promise<GalaxyFixture> {
  const bytes = await fs.readFile(file)
  const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8')
  return parseGalaxyFixture(JSON.parse(text) as unknown)
}

export async function main(argv: string[]): Promise<void> {
  const args = parseCliArguments(argv)
  const baseline = await readGalaxyFixture(args.baselineFile)
  const controlledPaths = await writeFixtureSet(
    args.outputDirectory,
    createControlledFixtures(baseline),
    'controlled-rating',
  )
  const realPaths = args.realDataFile
    ? await writeFixtureSet(
      args.outputDirectory,
      createRealSampleFixtures(
        await readGalaxyFixture(args.realDataFile),
        realSamplesFromBaseline(baseline),
      ),
      'real',
    )
    : []
  console.log(JSON.stringify({ controlledPaths, realPaths }))
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}