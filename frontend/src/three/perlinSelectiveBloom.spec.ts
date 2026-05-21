import { describe, expect, it } from 'vitest'

import {
  PERLIN_BLOOM_DEFAULTS,
  shouldCompositePerlinBloom,
} from './perlinSelectiveBloom'

describe('perlinSelectiveBloom', () => {
  it('exports conservative shipped defaults', () => {
    expect(PERLIN_BLOOM_DEFAULTS.enabled).toBe(true)
    expect(PERLIN_BLOOM_DEFAULTS.strength).toBeLessThan(0.95)
    expect(PERLIN_BLOOM_DEFAULTS.threshold).toBeGreaterThan(0.5)
  })

  it('shouldCompositePerlinBloom requires visible planet and user enable', () => {
    const base = {
      userEnabled: true,
      globalPostFxBloomEnabled: false,
      planetVisible: true,
      planetAlpha: 1,
    }
    expect(shouldCompositePerlinBloom(base)).toBe(true)
    expect(shouldCompositePerlinBloom({ ...base, userEnabled: false })).toBe(false)
    expect(shouldCompositePerlinBloom({ ...base, globalPostFxBloomEnabled: true })).toBe(false)
    expect(shouldCompositePerlinBloom({ ...base, planetVisible: false })).toBe(false)
    expect(shouldCompositePerlinBloom({ ...base, planetAlpha: 0 })).toBe(false)
    expect(shouldCompositePerlinBloom({ ...base, planetAlpha: 0.0005 })).toBe(false)
  })
})
