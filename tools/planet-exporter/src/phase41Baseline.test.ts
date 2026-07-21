import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'

import {
  P41_4_SEMANTIC_FUTURE_ROWS,
  assertP41FixedShapingFixtureSemantics,
  p41FixedShapingSemanticRowLabel,
} from './p41FixedShaping.js'
import {
  AUTHORITATIVE_GZIP_RELATIVE_PATH,
  assertPhase41SemanticFixtureCoverage,
  PHASE41_CONTROLLED_RATINGS,
  createPhase41Fixtures,
  createPhase41SemanticFixtures,
  loadAuthoritativeGalaxy,
  parseAuthoritativeGzip,
  parsePhase41Galaxy,
  phase41NoiseSeed,
  summarizePhase41Baseline,
  writePhase41Baseline,
  writePhase41SemanticFixtures,
} from './phase41Baseline.js'

type MovieInput = Record<string, unknown>

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-p41-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

function movie(id: number, overrides: Partial<MovieInput> = {}): MovieInput {
  return {
    id,
    title: `Movie ${id}`,
    overview: `Overview ${id}`,
    x: id,
    y: -id,
    z: 2000 + id,
    size: id + 1,
    emissive: 0.5,
    genre_color: [0.1, 0.2, 0.3],
    genre_hue: id / 20,
    genres: ['Drama'],
    vote_average: 5 + (id / 10),
    vote_count: id * 10,
    source_only_field: { id, preserved: true },
    ...overrides,
  }
}

function fixtureGalaxy(): unknown {
  return {
    meta: { version: 'fixture-v1', count: 12, untouched_meta: 'preserved' },
    movies: [
      movie(1, { genre_hue: 0.01, genres: ['Drama'], vote_average: 5.0, vote_count: 300 }),
      movie(2, { genre_hue: 6.1, genres: ['Comedy', 'Drama', 'Fantasy'], vote_average: 5.1, vote_count: 400 }),
      movie(3, { genre_hue: 1.2, genres: ['Action', 'Crime'], vote_average: 5.2, vote_count: 500 }),
      movie(4, { genre_hue: 2.2, genres: ['History'], vote_average: 5.3, vote_count: 600 }),
      movie(5, { genre_hue: 3.2, genres: ['Documentary'], vote_average: 5.4, vote_count: 700 }),
      movie(6, { genre_hue: 4.2, genres: ['Drama', 'Romance'], vote_average: 5.5, vote_count: 800 }),
      movie(7, { genre_hue: 5.2, genres: ['Horror'], vote_average: 5.6, vote_count: 900 }),
      movie(8, { genre_hue: 0.8, genres: ['Animation'], vote_average: 9.8, vote_count: 1 }),
      movie(9, { genre_hue: 1.8, genres: ['Music'], vote_average: 9.7, vote_count: 2 }),
      movie(10, { genre_hue: 2.8, genres: ['War'], vote_average: 9.6, vote_count: 3 }),
      movie(11, { genre_hue: 3.8, genres: ['Western'], vote_average: 9.5, vote_count: 4 }),
      movie(12, { genre_hue: 4.8, genres: ['Science Fiction'], vote_average: 9.4, vote_count: 5 }),
    ],
  }
}

function semanticFixtureGalaxy(): unknown {
  const value = fixtureGalaxy() as { meta: { count: number }; movies: MovieInput[] }
  value.movies.push(
    movie(13, { genres: ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Fantasy'] }),
    movie(14, { genre_hue: 4.2, genres: ['Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction'] }),
  )
  value.meta.count = value.movies.length
  return value
}

function serializedFixtures(value: ReturnType<typeof createPhase41Fixtures>): string {
  return JSON.stringify({ controlled: [...value.controlled], real: [...value.real] })
}

describe('P41.1 authoritative baseline and fixture generator', () => {
  it('rejects stale uncompressed JSON before parsing it', () => {
    expect(() => parseAuthoritativeGzip(Buffer.from(JSON.stringify(fixtureGalaxy())), 'stale.json')).toThrow('gzip stream; uncompressed JSON is forbidden')
  })

  it('computes a stable, complete baseline summary', () => {
    const galaxy = parsePhase41Galaxy(fixtureGalaxy())
    const summary = summarizePhase41Baseline(galaxy, 'a'.repeat(64))

    expect(summary).toMatchObject({
      movie_count: 12,
      source: { relative_path: AUTHORITATIVE_GZIP_RELATIVE_PATH, data_version: 'fixture-v1', sha256: 'a'.repeat(64) },
      rating: { min: 5, max: 9.8, count_4_5_to_7_5: 7, count_gte_9: 5, p99: 9.8 },
      vote_count: { min: 1, max: 900, p99: 900 },
    })
  })

  it('creates byte-stable controlled and real full-movie fixtures by documented selection rules', () => {
    const galaxy = parsePhase41Galaxy(fixtureGalaxy())
    const first = createPhase41Fixtures(galaxy, 'b'.repeat(64))
    const second = createPhase41Fixtures(galaxy, 'b'.repeat(64))

    expect(serializedFixtures(first)).toBe(serializedFixtures(second))
    expect([...first.controlled.keys()]).toEqual(PHASE41_CONTROLLED_RATINGS)
    expect([...first.real.keys()]).toEqual(['hue-low', 'hue-high', 'seed-low', 'seed-high', 'genres-min', 'genres-max', 'high-rating-low-votes'])
    expect(new Set([...first.real.values()].map((fixture) => fixture.movies[0]!.id)).size).toBe(7)

    const controlledSource = galaxy.movies.find((entry) => entry.id === first.controlled.get(4)!.phase41_fixture.source_movie_id)!
    for (const rating of PHASE41_CONTROLLED_RATINGS) {
      const fixture = first.controlled.get(rating)!
      expect(fixture.movies).toHaveLength(1)
      expect(fixture.movies[0]!.vote_average).toBe(rating)
      const restored = { ...fixture.movies[0]!, vote_average: controlledSource.vote_average }
      expect(restored).toEqual(controlledSource)
    }
    for (const fixture of first.real.values()) {
      expect(fixture.movies).toHaveLength(1)
      expect(fixture.movies[0]).toEqual(galaxy.movies.find((entry) => entry.id === fixture.phase41_fixture.source_movie_id))
    }
    const anomaly = first.real.get('high-rating-low-votes')!.movies[0]!
    expect(anomaly.vote_average).toBeGreaterThanOrEqual(9)
    expect(anomaly.vote_count).toBe(1)
    expect(phase41NoiseSeed(157336)).toBe(1006856808)
  })

  it('creates additive semantic rows from categorical palette families and visible terrain complexity', () => {
    const galaxy = parsePhase41Galaxy(semanticFixtureGalaxy())
    const fixtures = createPhase41SemanticFixtures(galaxy, 'c'.repeat(64))

    expect([...fixtures.keys()]).toEqual(P41_4_SEMANTIC_FUTURE_ROWS.map((row) => row.fixture))
    expect(() => assertPhase41SemanticFixtureCoverage(fixtures)).not.toThrow()
    const duplicateHue = new Map(fixtures)
    const firstFixture = duplicateHue.get(P41_4_SEMANTIC_FUTURE_ROWS[0]!.fixture)!
    const secondRow = P41_4_SEMANTIC_FUTURE_ROWS[1]!
    const secondFixture = duplicateHue.get(secondRow.fixture)!
    duplicateHue.set(secondRow.fixture, { ...secondFixture, movies: [{ ...secondFixture.movies[0]!, genre_hue: firstFixture.movies[0]!.genre_hue }] })
    expect(() => assertPhase41SemanticFixtureCoverage(duplicateHue)).toThrow(/circular wrap-around boundary/)
    for (const row of P41_4_SEMANTIC_FUTURE_ROWS) {
      const fixture = fixtures.get(row.fixture)!
      const movie = fixture.movies[0]!
      const semantics = {
        movieId: movie.id,
        title: movie.title,
        hue: movie.genre_hue,
        seed: phase41NoiseSeed(movie.id),
        primaryGenre: movie.genres[0]!,
        paletteHex: '#F486AA',
        genres: movie.genres,
        visibleBandCount: Math.min(movie.genres.length, 8),
        selectionPredicate: fixture.phase41_fixture.selection,
      }
      expect(() => assertP41FixedShapingFixtureSemantics(row, semantics)).not.toThrow()
      const label = p41FixedShapingSemanticRowLabel(row, semantics)
      expect(label).toContain(`visible bands=${row.expectedVisibleBandCount}`)
      expect(label).not.toMatch(/hue|seed|id|high|low/i)
      expect(fixture.phase41_fixture.selection).toContain('hue and seed are not selection criteria')
      expect(row.fixture).not.toMatch(/hue-(low|high)|seed-(low|high)/)
    }
  })

  it('writes semantic fixtures separately without rewriting the established baseline fixture set', async () => {
    const root = await temporaryDirectory()
    const gzipPath = path.join(root, AUTHORITATIVE_GZIP_RELATIVE_PATH)
    await fs.mkdir(path.dirname(gzipPath), { recursive: true })
    await fs.writeFile(gzipPath, gzipSync(JSON.stringify(semanticFixtureGalaxy())))

    await writePhase41Baseline(root)
    const semantic = await writePhase41SemanticFixtures(root)
    await expect(fs.readdir(semantic.outputDirectory)).resolves.toEqual(P41_4_SEMANTIC_FUTURE_ROWS.map((row) => `real-${row.fixture}.json`).sort())
    const baselineEntries = await fs.readdir(path.join(root, 'data/runs/phase41/baseline/fixtures'))
    expect(baselineEntries.filter((entry) => entry !== 'semantic')).toHaveLength(14)
  })

  it('only reads the canonical gzip location and writes reproducible Phase 41 evidence', async () => {
    const root = await temporaryDirectory()
    const gzipPath = path.join(root, AUTHORITATIVE_GZIP_RELATIVE_PATH)
    await fs.mkdir(path.dirname(gzipPath), { recursive: true })
    await fs.writeFile(gzipPath, gzipSync(JSON.stringify(fixtureGalaxy())))

    await expect(loadAuthoritativeGalaxy(root, path.join(root, 'stale.json'))).rejects.toThrow('authoritative input must be')
    const first = await writePhase41Baseline(root)
    const summaryPath = path.join(first.outputDirectory, 'baseline-summary.json')
    const saved = await fs.readFile(summaryPath, 'utf8')
    const second = await writePhase41Baseline(root)

    expect(second.summary).toEqual(first.summary)
    expect(await fs.readFile(summaryPath, 'utf8')).toBe(saved)
    await expect(fs.readdir(path.join(first.outputDirectory, 'fixtures'))).resolves.toEqual(expect.arrayContaining([
      'controlled-rating-4.0.json',
      'controlled-rating-9.5.json',
      'real-high-rating-low-votes.json',
    ]))
    await expect(fs.readdir(path.join(first.outputDirectory, 'fixtures'))).resolves.toHaveLength(14)
  })
})