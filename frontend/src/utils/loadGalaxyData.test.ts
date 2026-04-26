import { describe, expect, it } from 'vitest'

import type { GalaxyData } from '@/types/galaxy'
import { galaxyMinimalFixture } from '@/types/galaxyMinimalFixture'

import { galaxyRuntimeUrlFromSearch, parseGalaxyJsonPayload } from './loadGalaxyData'

describe('parseGalaxyJsonPayload (P8.1 genre_hue)', () => {
  it('accepts meta.has_genre_hue when every movie has genre_hue in [0, 2π)', () => {
    const data = parseGalaxyJsonPayload(galaxyMinimalFixture)
    expect(data.meta.has_genre_hue).toBe(true)
    expect(data.movies[0]!.genre_hue).toBe(0)
  })

  it('rejects when meta.has_genre_hue is true but a movie omits genre_hue', () => {
    const bad = JSON.parse(JSON.stringify(galaxyMinimalFixture)) as GalaxyData
    delete (bad.movies[0] as { genre_hue?: number }).genre_hue
    expect(() => parseGalaxyJsonPayload(bad)).toThrow(/genre_hue/)
  })

  it('rejects genre_hue outside [0, 2π)', () => {
    const bad = JSON.parse(JSON.stringify(galaxyMinimalFixture)) as GalaxyData
    bad.movies[0].genre_hue = Math.PI * 2
    expect(() => parseGalaxyJsonPayload(bad)).toThrow(/\[0, 2π\)/)
  })
})

describe('galaxyRuntimeUrlFromSearch (P8.2 dataset=)', () => {
  it('maps mindist07 to experiments gzip path', () => {
    const url = galaxyRuntimeUrlFromSearch('?dataset=mindist07')
    expect(url).toContain('data/experiments/galaxy_data.mindist07.json.gz')
  })

  it('falls back to main galaxy_data when dataset missing or unknown', () => {
    expect(galaxyRuntimeUrlFromSearch('')).toContain('data/galaxy_data.json.gz')
    expect(galaxyRuntimeUrlFromSearch('?dataset=unknown')).toContain('data/galaxy_data.json.gz')
  })

  it('maps n300md04 one-off experiment path', () => {
    expect(galaxyRuntimeUrlFromSearch('?dataset=n300md04')).toContain(
      'data/experiments/galaxy_data.n300md04.json.gz',
    )
  })
})
