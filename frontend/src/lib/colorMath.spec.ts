import { describe, expect, it } from 'vitest'

import type { GalaxyLightnessUniforms } from '@/lib/colorMath'
import { lightnessFromVoteAverage, lightnessFromVoteNorm, normalizedLBlendTFromVoteNorm } from '@/lib/colorMath'

const defaultSnap: GalaxyLightnessUniforms = {
  uLMin: 0.2,
  uLMax: 1.0,
  uHighRatingT: 0.85,
  uHighTierTRangeScale: 0.35,
  uLightnessRatingExponent: 1.15,
}

describe('colorMath P10.1', () => {
  it('L increases with voteNorm', () => {
    const a = lightnessFromVoteNorm(0.1, defaultSnap)
    const b = lightnessFromVoteNorm(0.9, defaultSnap)
    expect(b).toBeGreaterThan(a)
  })

  it('normalizedLBlendT matches L mix factor when uLMin != uLMax', () => {
    const vn = 0.73
    const L = lightnessFromVoteNorm(vn, defaultSnap)
    const t = (L - defaultSnap.uLMin) / (defaultSnap.uLMax - defaultSnap.uLMin)
    const t2 = normalizedLBlendTFromVoteNorm(vn, defaultSnap)
    expect(t2).toBeCloseTo(t, 10)
  })

  it('lightnessFromVoteAverage matches voteNorm path', () => {
    const L1 = lightnessFromVoteAverage(8.2, defaultSnap)
    const L2 = lightnessFromVoteNorm(0.82, defaultSnap)
    expect(L1).toBeCloseTo(L2, 10)
  })
})
