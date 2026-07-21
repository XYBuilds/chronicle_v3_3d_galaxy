import { describe, expect, it } from 'vitest'
import { assertPureBloomCore } from './bloomProof.js'

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

  it('records a doubled-base-sized core ratio as a diagnostic rather than rejecting it', () => {
    expect(assertPureBloomCore(image(100), image(200)).on_to_off_mean_luma_ratio).toBeCloseTo(2, 8)
  })

  it('rejects a nonzero Bloom path that produces no meaningful positive increment', () => {
    expect(() => assertPureBloomCore(image(100), image(100))).toThrow(/meaningful positive core increment/)
  })
})