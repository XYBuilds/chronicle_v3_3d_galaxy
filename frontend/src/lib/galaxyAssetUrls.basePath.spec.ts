import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveTodayJsonUrl } from './galaxyAssetUrls'

vi.mock('@/utils/loadGalaxyData', () => ({
  experimentDatasetGalaxyUrl: vi.fn(() => null),
}))

describe('galaxyAssetUrls base path (T7)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolveTodayJsonUrl prefixes bundled path with BASE_URL', async () => {
    vi.stubEnv('BASE_URL', '/chronicle/')
    const url = await resolveTodayJsonUrl('data/today.json')
    expect(url).toBe('/chronicle/data/today.json')
  })
})
