import { describe, expect, it } from 'vitest'

import {
  buildHomePath,
  buildMoviePath,
  buildTodayPath,
  parseLogicalPath,
  parseMovieIdSegment,
  parseRoute,
  stripAppBasePath,
  withAppBasePath,
} from './routes'

const REPO_BASE = '/chronicle/'

describe('parseMovieIdSegment', () => {
  it('accepts positive integer strings', () => {
    expect(parseMovieIdSegment('550')).toBe(550)
    expect(parseMovieIdSegment('1')).toBe(1)
  })

  it('rejects non-integers, zero, negative, and unsafe integers', () => {
    expect(parseMovieIdSegment('abc')).toBeNull()
    expect(parseMovieIdSegment('12.5')).toBeNull()
    expect(parseMovieIdSegment('0')).toBeNull()
    expect(parseMovieIdSegment('-1')).toBeNull()
    expect(parseMovieIdSegment('01')).toBe(1)
    expect(parseMovieIdSegment(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull()
  })
})

describe('parseLogicalPath', () => {
  it('maps root and /today', () => {
    expect(parseLogicalPath('/')).toEqual({ kind: 'home' })
    expect(parseLogicalPath('/today')).toEqual({ kind: 'today' })
    expect(parseLogicalPath('/today/')).toEqual({ kind: 'today' })
  })

  it('maps valid /movie/:id', () => {
    expect(parseLogicalPath('/movie/550')).toEqual({ kind: 'movie', movieId: 550 })
  })

  it('returns unknown for invalid movie ids and extra segments', () => {
    expect(parseLogicalPath('/movie/abc')).toEqual({ kind: 'unknown' })
    expect(parseLogicalPath('/movie/0')).toEqual({ kind: 'unknown' })
    expect(parseLogicalPath('/movie/550/extra')).toEqual({ kind: 'unknown' })
    expect(parseLogicalPath('/movie/')).toEqual({ kind: 'unknown' })
    expect(parseLogicalPath('/unknown')).toEqual({ kind: 'unknown' })
  })
})

describe('parseRoute with BASE_URL subpath', () => {
  it('strips deploy base before classification', () => {
    expect(
      parseRoute({ pathname: '/chronicle/movie/42', search: '' }, { basePath: REPO_BASE }),
    ).toEqual({ kind: 'movie', movieId: 42 })
    expect(parseRoute({ pathname: '/chronicle/today', search: '' }, { basePath: REPO_BASE })).toEqual({
      kind: 'today',
    })
    expect(parseRoute({ pathname: '/chronicle/', search: '' }, { basePath: REPO_BASE })).toEqual({
      kind: 'home',
    })
    expect(parseRoute({ pathname: '/chronicle', search: '' }, { basePath: REPO_BASE })).toEqual({
      kind: 'home',
    })
  })
})

describe('build*Path query preservation (R5)', () => {
  const search = '?lang=zh&theme=light&timeline=vertical&utm=share'

  it('buildMoviePath keeps full search', () => {
    expect(buildMoviePath(550, search)).toBe(`/movie/550${search}`)
    expect(buildMoviePath(550, search, { basePath: REPO_BASE })).toBe(
      `/chronicle/movie/550${search}`,
    )
  })

  it('buildTodayPath and buildHomePath keep full search', () => {
    expect(buildTodayPath(search)).toBe(`/today${search}`)
    expect(buildHomePath(search)).toBe(`/${search}`)
    expect(buildTodayPath(search, { basePath: REPO_BASE })).toBe(`/chronicle/today${search}`)
    expect(buildHomePath(search, { basePath: REPO_BASE })).toBe(`/chronicle${search}`)
  })

  it('rejects invalid ids when building movie path', () => {
    expect(() => buildMoviePath(0, '')).toThrow(RangeError)
    expect(() => buildMoviePath(1.5, '')).toThrow(RangeError)
  })
})

describe('withAppBasePath / stripAppBasePath round-trip', () => {
  it('round-trips logical paths at site root', () => {
    expect(stripAppBasePath('/movie/1', '/')).toBe('/movie/1')
    expect(withAppBasePath('/movie/1', '/')).toBe('/movie/1')
  })

  it('round-trips logical paths under subpath base', () => {
    const built = withAppBasePath('/movie/99', REPO_BASE)
    expect(built).toBe('/chronicle/movie/99')
    expect(stripAppBasePath(built, REPO_BASE)).toBe('/movie/99')
  })
})
