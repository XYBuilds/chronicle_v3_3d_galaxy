import { describe, expect, it } from 'vitest'

import type { GalaxyLightnessUniforms } from '@/lib/colorMath'
import {
  applyHuntChroma,
  lightnessFromVoteAverage,
  lightnessFromVoteNorm,
  normalizedLBlendTFromVoteNorm,
  srgb01FromHueAndVoteNorm,
} from '@/lib/colorMath'

const defaultSnap: GalaxyLightnessUniforms = {
  uLMin: 0.3,
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

  it('locks representative non-focus rating-to-Lightness outputs', () => {
    expect(lightnessFromVoteAverage(0, defaultSnap)).toBeCloseTo(0.3, 12)
    expect(lightnessFromVoteAverage(5, defaultSnap)).toBeCloseTo(0.615437661913791, 12)
    expect(lightnessFromVoteAverage(8.5, defaultSnap)).toBeCloseTo(0.88067055562305, 12)
    expect(lightnessFromVoteAverage(10, defaultSnap)).toBeCloseTo(0.922103052298253, 12)
  })

  it('lightnessFromVoteAverage matches voteNorm path', () => {
    const L1 = lightnessFromVoteAverage(8.2, defaultSnap)
    const L2 = lightnessFromVoteNorm(0.82, defaultSnap)
    expect(L1).toBeCloseTo(L2, 10)
  })
})

describe('colorMath P17.2 Hunt (HUD ↔ active.vert)', () => {
  const base: GalaxyLightnessUniforms & {
    uChroma: number
    uHuntGamma: number
    uHuntApplyMask: number
  } = {
    ...defaultSnap,
    uChroma: 0.18,
    uHuntGamma: 0.3,
    uHuntApplyMask: 7,
  }

  it('applyHuntChroma increases with L_actual at fixed L_ref', () => {
    const cLo = applyHuntChroma(0.3, 1.0, 0.18, 0.3)
    const cHi = applyHuntChroma(0.9, 1.0, 0.18, 0.3)
    expect(cHi).toBeGreaterThan(cLo)
  })

  it('srgb01FromHueAndVoteNorm: higher voteNorm → higher chroma when Hunt on (bit 1)', () => {
    const hue = 1.2
    const low = srgb01FromHueAndVoteNorm(hue, 0.15, base)
    const high = srgb01FromHueAndVoteNorm(hue, 0.95, base)
    const satLow = Math.max(low[0], low[1], low[2]) - Math.min(low[0], low[1], low[2])
    const satHigh = Math.max(high[0], high[1], high[2]) - Math.min(high[0], high[1], high[2])
    expect(satHigh).toBeGreaterThan(satLow)
  })

  it('mask bit1 off → OKLab chroma magnitude stays uChroma (Hunt bypass)', () => {
    const noHunt = { ...base, uHuntApplyMask: 5 }
    const huntOn =
      noHunt.uHuntGamma !== undefined &&
      noHunt.uHuntApplyMask !== undefined &&
      (noHunt.uHuntApplyMask & 2) !== 0
    expect(huntOn).toBe(false)
    for (const vn of [0.2, 0.85]) {
      const L = lightnessFromVoteNorm(vn, noHunt)
      const C = huntOn
        ? applyHuntChroma(L, noHunt.uLMax, noHunt.uChroma, noHunt.uHuntGamma!)
        : noHunt.uChroma
      expect(C).toBeCloseTo(0.18, 10)
    }
  })
})
