import { describe, expect, it } from 'vitest'

import { parseGalaxyAssetsManifest } from './galaxyAssetUrls'

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
})
