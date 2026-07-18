import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/colorMath', () => ({
  lightnessFromVoteAverage: vi.fn(() => {
    throw new Error('focus emission must not call macro lightness mapping')
  }),
}))

import { lightnessFromVoteAverage } from '@/lib/colorMath'

import { focusEmissionIntensityFromVoteAverage } from './planetAppearance'

const min = 0.06
const max = 0.6
const cubic = 3

describe('focusEmissionIntensityFromVoteAverage', () => {
  it('maps 0, 4, 5, and 10 through the explicit cubic curve', () => {
    expect(focusEmissionIntensityFromVoteAverage(0, min, max, cubic)).toBe(min)
    expect(focusEmissionIntensityFromVoteAverage(4, min, max, cubic)).toBeCloseTo(0.09456, 12)
    expect(focusEmissionIntensityFromVoteAverage(5, min, max, cubic)).toBeCloseTo(0.1275, 12)
    expect(focusEmissionIntensityFromVoteAverage(10, min, max, cubic)).toBe(max)
  })

  it('clamps finite out-of-range ratings to exact endpoints', () => {
    expect(focusEmissionIntensityFromVoteAverage(-0.1, min, max, cubic)).toBe(min)
    expect(focusEmissionIntensityFromVoteAverage(10.1, min, max, cubic)).toBe(max)
  })

  it('is strictly monotonic across in-range ratings', () => {
    const values = Array.from({ length: 11 }, (_, rating) =>
      focusEmissionIntensityFromVoteAverage(rating, min, max, cubic),
    )
    values.slice(1).forEach((value, index) => expect(value).toBeGreaterThan(values[index]!))
  })

  it('allows equal endpoints for a fixed-emission diagnostic configuration', () => {
    for (const voteAverage of [-5, 0, 5, 10, 15]) {
      expect(focusEmissionIntensityFromVoteAverage(voteAverage, 0.42, 0.42, cubic)).toBe(0.42)
    }
  })

  it.each([NaN, Infinity, -Infinity])('fails fast for non-finite voteAverage %s', (voteAverage) => {
    expect(() => focusEmissionIntensityFromVoteAverage(voteAverage, min, max, cubic)).toThrow(/voteAverage.*finite/)
  })

  it.each([0, -1, NaN, Infinity, -Infinity])('fails fast for invalid exponent %s', (exponent) => {
    expect(() => focusEmissionIntensityFromVoteAverage(5, min, max, exponent)).toThrow(/exponent must be finite and > 0/)
  })

  it.each([
    ['minIntensity', NaN, 1],
    ['maxIntensity', 0, NaN],
    ['minIntensity', -0.01, 1],
    ['maxIntensity', 0, -0.01],
    ['inverted endpoints', 1, 0.5],
  ] as const)('fails fast for invalid %s configuration', (_name, minimum, maximum) => {
    expect(() => focusEmissionIntensityFromVoteAverage(5, minimum, maximum, cubic)).toThrow()
  })

  it('is a scalar-only emission boundary independent from macro Lightness and Key Light', () => {
    expect(focusEmissionIntensityFromVoteAverage).toHaveLength(4)
    expect(focusEmissionIntensityFromVoteAverage(5, min, max, cubic)).toBeTypeOf('number')
    expect(lightnessFromVoteAverage).not.toHaveBeenCalled()
  })
})