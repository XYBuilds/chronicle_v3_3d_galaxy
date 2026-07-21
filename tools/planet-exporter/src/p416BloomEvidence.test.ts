import { describe, expect, it } from 'vitest'

import {
  P416_BLOOM_OFF,
  P416_BLOOM_ON,
  assertP416EvidenceContract,
  assertP416PairOnlyBloomVariation,
  measureP416BloomPair,
  validateP416BloomParams,
} from './p416BloomEvidence.js'

function image(rgb: number): { data: Uint8Array; width: number; height: number } {
  const width = 32
  const height = 32
  const data = new Uint8Array(width * height * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgb
    data[index + 1] = rgb
    data[index + 2] = rgb
    data[index + 3] = 255
  }
  return { data, width, height }
}

const shared = {
  authoritative_data: 'gzip-sha', fixture: 'seed-low', movie_id: 1, camera: { left: -1, right: 1 }, seed: 1,
  rotation: [0, 0, 0, 1], lightness: 0.66, key_light: 0.45, direction: [0.7, 0.4, 0.59],
  flat_shading_mix: 0.8, rating: 6.5, emission: 0.2, curve: 'rating-midrank-cdf-lut-v1',
}

describe('P41.6 Bloom evidence contract', () => {
  it('pins the approved diagnostic-only CDF/LUT matrix and explicit candidates', () => {
    expect(() => assertP416EvidenceContract()).not.toThrow()
    expect(validateP416BloomParams(P416_BLOOM_OFF, 'off')).toEqual(P416_BLOOM_OFF)
    expect(validateP416BloomParams(P416_BLOOM_ON, 'on')).toEqual(P416_BLOOM_ON)
  })

  it('rejects non-finite and out-of-range Bloom candidates before rendering', () => {
    expect(() => validateP416BloomParams({ ...P416_BLOOM_ON, threshold: Number.NaN }, 'on')).toThrow(/finite/)
    expect(() => validateP416BloomParams({ ...P416_BLOOM_ON, radius: 1.01 }, 'on')).toThrow(/\[0, 1\]/)
    expect(() => validateP416BloomParams({ ...P416_BLOOM_ON, strength: -1 }, 'on')).toThrow(/>= 0/)
  })

  it('records core, saturation, and halo measurements for a valid pair', () => {
    const stats = measureP416BloomPair(image(100), image(102))
    expect(stats.core.on_to_off_mean_luma_ratio).toBeCloseTo(1.02, 8)
    expect(stats.halo_bounds).toMatchObject({ x_min: 0, y_min: 0, pixels: 1024 })
    expect(stats.on_saturated_ratio).toBeGreaterThanOrEqual(0)
  })

  it('permits only the declared Bloom profile to differ in an OFF/ON pair', () => {
    expect(() => assertP416PairOnlyBloomVariation({ ...shared, bloom: P416_BLOOM_OFF }, { ...shared, bloom: P416_BLOOM_ON })).not.toThrow()
    expect(() => assertP416PairOnlyBloomVariation({ ...shared, bloom: P416_BLOOM_OFF }, { ...shared, bloom: P416_BLOOM_ON, camera: { left: -2, right: 2 } })).toThrow(/camera/)
  })
})