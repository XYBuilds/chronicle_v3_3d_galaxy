import { describe, expect, it } from 'vitest'
import { assertPureBloomCore, BLOOM_CORE_PROOF } from './bloomProof.js'

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

describe('pure Bloom core proof', () => {
  it('allows a measurable weak increment while bounding core mean luminance', () => {
    const stats = assertPureBloomCore(image(100), image(101))
    expect(stats.on_to_off_mean_luma_ratio).toBeCloseTo(1.01, 8)
    expect(stats.positive_luma_fraction).toBe(1)
  })

  it('rejects the doubled-base shape instead of merely checking for an ON/OFF difference', () => {
    expect(() => assertPureBloomCore(image(100), image(200))).toThrow(/probable base re-add/)
  })

  it('rejects a nonzero Bloom path that produces no meaningful positive increment', () => {
    expect(() => assertPureBloomCore(image(100), image(100))).toThrow(/meaningful positive core increment/)
    expect(BLOOM_CORE_PROOF.maxOnToOffMeanLumaRatio).toBeLessThan(2)
  })
})