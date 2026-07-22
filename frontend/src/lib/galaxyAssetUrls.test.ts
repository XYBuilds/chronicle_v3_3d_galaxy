import { describe, expect, it } from 'vitest'

import { focusEmissionProfileResourcePath, parseGalaxyAssetsManifest, resolveFocusEmissionProfileResourceUrl } from './galaxyAssetUrls'

describe('parseGalaxyAssetsManifest (P18.6b)', () => {
  it('parses minimal valid manifest', () => {
    const m = parseGalaxyAssetsManifest({
      galaxy_data_gzip_url: 'https://example.r2.dev/galaxy/galaxy_data.json.gz?v=1',
      galaxy_search_index_gzip_url: 'https://example.r2.dev/galaxy/galaxy_search_index.json.gz?v=1',
      data_version: '2026.05.06.daily.1',
    })
    expect(m).not.toBeNull()
    expect(m!.data_version).toBe('2026.05.06.daily.1')
    expect(m!.galaxy_search_index_gzip_url).toContain('search_index')
  })

  it('rejects when galaxy URL missing', () => {
    expect(parseGalaxyAssetsManifest({ data_version: 'x' })).toBeNull()
  })

  it('rejects when data_version missing', () => {
    expect(
      parseGalaxyAssetsManifest({
        galaxy_data_gzip_url: 'https://x/galaxy_data.json.gz',
      }),
    ).toBeNull()
  })

  it('accepts active provenance only with its matching immutable profile URL', () => {
    const m = parseGalaxyAssetsManifest({
      galaxy_data_gzip_url: 'https://example.r2.dev/galaxy/galaxy_data.json.gz?v=1',
      data_version: '2026.07.22.monthly.1',
      focus_emission_profile_url: 'https://example.r2.dev/galaxy/focus-emission-profiles/rating-emission-2026-07-a.json',
      focus_emission_profile: {
        profile_id: 'rating-emission-2026-07-a',
        period: '2026-07',
        model_version: 'rating-midrank-cdf-lut-v1',
        curve_sha256: 'a'.repeat(64),
        source_data_version: '2026.07.22.monthly.1',
        source_movie_count: 61531,
        status: 'active',
        activated_at: '2026-07-22T00:00:00.000Z',
      },
    })

    expect(m?.focus_emission_profile?.profile_id).toBe('rating-emission-2026-07-a')
    expect(m?.focus_emission_profile_url).toBe('https://example.r2.dev/galaxy/focus-emission-profiles/rating-emission-2026-07-a.json')
  })

  it('rejects invalid active pointer provenance and resolves no arbitrary paths', () => {
    expect(parseGalaxyAssetsManifest({
      galaxy_data_gzip_url: 'https://example.r2.dev/galaxy/galaxy_data.json.gz?v=1',
      data_version: '2026.07.22.monthly.1',
      focus_emission_profile: { profile_id: '../secret', status: 'active' },
    })).toBeNull()
    expect(() => focusEmissionProfileResourcePath('../secret')).toThrow(/profile_id/)
    expect(resolveFocusEmissionProfileResourceUrl({
      profile_id: 'rating-emission-2026-07-a', period: '2026-07', model_version: 'rating-midrank-cdf-lut-v1', curve_sha256: 'a'.repeat(64), source_data_version: 'x', source_movie_count: 1, status: 'active', activated_at: '2026-07-22T00:00:00.000Z',
    })).toContain('data/focus-emission-profiles/rating-emission-2026-07-a.json')
  })
  it('rejects userinfo credentials in every manifest asset URL', () => {
    expect(parseGalaxyAssetsManifest({
      galaxy_data_gzip_url: 'https://token@example.r2.dev/galaxy/galaxy_data.json.gz',
      data_version: '2026.07.22.monthly.1',
    })).toBeNull()
    expect(parseGalaxyAssetsManifest({
      galaxy_data_gzip_url: 'https://example.r2.dev/galaxy/galaxy_data.json.gz',
      galaxy_search_index_gzip_url: 'https://user:pass@example.r2.dev/galaxy/search.json.gz',
      data_version: '2026.07.22.monthly.1',
    })).toBeNull()
  })
})
