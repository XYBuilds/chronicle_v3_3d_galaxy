import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/colorMath', () => ({
  lightnessFromVoteAverage: vi.fn(() => {
    throw new Error('focus emission must not call macro lightness mapping')
  }),
}))

import { lightnessFromVoteAverage } from '@/lib/colorMath'

import {
  FOCUS_EMISSION_MODEL_VERSION,
  focusEmissionIntensityFromVoteAverage,
  validateFocusEmissionCurve,
  type FocusEmissionCurve,
} from './focusEmission'

const curve: FocusEmissionCurve = {
  modelVersion: FOCUS_EMISSION_MODEL_VERSION,
  ratingLowAnchor: 4.5,
  ratingHighAnchor: 8.2,
  intensityMin: 0.005,
  intensityMax: 0.65,
}

describe('Focus anchored smoothstep emission', () => {
  it('maps anchors to exact endpoints and clamps outside them', () => {
    expect(focusEmissionIntensityFromVoteAverage(4.5, curve)).toBe(0.005)
    expect(focusEmissionIntensityFromVoteAverage(8.2, curve)).toBe(0.65)
    expect(focusEmissionIntensityFromVoteAverage(-1, curve)).toBe(0.005)
    expect(focusEmissionIntensityFromVoteAverage(10, curve)).toBe(0.65)
  })

  it('uses t²(3−2t) between the anchors', () => {
    const t = (6.5 - curve.ratingLowAnchor) / (curve.ratingHighAnchor - curve.ratingLowAnchor)
    expect(focusEmissionIntensityFromVoteAverage(6.5, curve)).toBeCloseTo(
      curve.intensityMin + t * t * (3 - 2 * t) * (curve.intensityMax - curve.intensityMin),
      12,
    )
  })

  it('is strictly monotonic and distinguishable throughout the dense 4.5–7.5 range', () => {
    const ratings = Array.from({ length: 31 }, (_, index) => 4.5 + index * 0.1)
    const emissions = ratings.map((rating) => focusEmissionIntensityFromVoteAverage(rating, curve))
    emissions.slice(1).forEach((value, index) => expect(value).toBeGreaterThan(emissions[index]!))
    expect(new Set(emissions.map((value) => value.toPrecision(12))).size).toBe(emissions.length)
  })

  it.each([NaN, Infinity, -Infinity])('fails fast for non-finite voteAverage %s', (voteAverage) => {
    expect(() => focusEmissionIntensityFromVoteAverage(voteAverage, curve)).toThrow(/voteAverage.*finite/)
  })

  it.each([
    { ...curve, modelVersion: 'vote-average-power-clamped-v1' } as unknown as FocusEmissionCurve,
    { ...curve, ratingLowAnchor: NaN },
    { ...curve, ratingLowAnchor: 8.2, ratingHighAnchor: 4.5 },
    { ...curve, intensityMin: -0.01 },
    { ...curve, intensityMin: 0.7, intensityMax: 0.65 },
  ])('fails fast for invalid curve %#', (invalidCurve) => {
    expect(() => validateFocusEmissionCurve(invalidCurve)).toThrow()
  })

  it('is a scalar-only emission boundary independent from macro Lightness and Key Light', () => {
    expect(focusEmissionIntensityFromVoteAverage).toHaveLength(2)
    expect(focusEmissionIntensityFromVoteAverage(6.5, curve)).toBeTypeOf('number')
    expect(lightnessFromVoteAverage).not.toHaveBeenCalled()
  })
})