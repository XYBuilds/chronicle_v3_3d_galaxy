import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/colorMath', () => ({
  lightnessFromVoteAverage: vi.fn(() => {
    throw new Error('focus emission must not call macro lightness mapping')
  }),
}))

import { lightnessFromVoteAverage } from '@/lib/colorMath'

import { focusEmissionIntensityFromVoteAverage } from './planetAppearance'

describe('focusEmissionIntensityFromVoteAverage', () => {
  it('maps 0, 5, and 10 to the expected linear emission values', () => {
    expect(focusEmissionIntensityFromVoteAverage(0, 0.06, 0.6)).toBe(0.06)
    expect(focusEmissionIntensityFromVoteAverage(5, 0.06, 0.6)).toBeCloseTo(0.33, 12)
    expect(focusEmissionIntensityFromVoteAverage(10, 0.06, 0.6)).toBe(0.6)
  })

  it('clamps only finite out-of-range ratings to exact endpoints', () => {
    expect(focusEmissionIntensityFromVoteAverage(-0.1, 0.2, 1.2)).toBe(0.2)
    expect(focusEmissionIntensityFromVoteAverage(10.1, 0.2, 1.2)).toBe(1.2)
  })

  it('is strictly linear between endpoints and monotonic non-decreasing', () => {
    const min = 0.2
    const max = 1.2
    const values = [0, 2.5, 5, 7.5, 10].map((voteAverage) =>
      focusEmissionIntensityFromVoteAverage(voteAverage, min, max),
    )

    expect(values).toHaveLength(5)
    expect(values[0]).toBe(min)
    expect(values[4]).toBe(max)
    expect(values[1]).toBeCloseTo(0.45, 12)
    expect(values[2]).toBeCloseTo(0.7, 12)
    expect(values[3]).toBeCloseTo(0.95, 12)
    const steps = values.slice(1).map((value, index) => value - values[index]!)
    expect(steps.every((step) => Math.abs(step - steps[0]!) < 1e-12)).toBe(true)
    expect(values.slice(1).every((value, index) => value >= values[index]!)).toBe(true)
  })

  it('allows equal endpoints for a fixed-emission diagnostic configuration', () => {
    for (const voteAverage of [-5, 0, 5, 10, 15]) {
      expect(focusEmissionIntensityFromVoteAverage(voteAverage, 0.42, 0.42)).toBe(0.42)
    }
  })

  it.each([NaN, Infinity, -Infinity])('fails fast for non-finite voteAverage %s', (voteAverage) => {
    expect(() => focusEmissionIntensityFromVoteAverage(voteAverage, 0, 1)).toThrow(/voteAverage.*finite/)
  })

  it.each([
    ['minIntensity', NaN, 1],
    ['minIntensity', Infinity, 1],
    ['minIntensity', -Infinity, 1],
    ['maxIntensity', 0, NaN],
    ['maxIntensity', 0, Infinity],
    ['maxIntensity', 0, -Infinity],
  ] as const)('fails fast for a non-finite %s endpoint', (name, min, max) => {
    expect(() => focusEmissionIntensityFromVoteAverage(5, min, max)).toThrow(new RegExp(`${name}.*finite`))
  })

  it.each([
    ['minIntensity', -0.01, 1],
    ['maxIntensity', 0, -0.01],
  ] as const)('fails fast for a negative %s endpoint', (name, min, max) => {
    expect(() => focusEmissionIntensityFromVoteAverage(5, min, max)).toThrow(new RegExp(`${name}.*non-negative`))
  })

  it('fails fast for inverted endpoints', () => {
    expect(() => focusEmissionIntensityFromVoteAverage(5, 1, 0.5)).toThrow(
      /maxIntensity.*greater than or equal to minIntensity/,
    )
  })

  it('is a scalar-only emission boundary independent from macro Lightness and Key Light', () => {
    const emission = focusEmissionIntensityFromVoteAverage(5, 0.2, 1.2)

    expect(focusEmissionIntensityFromVoteAverage).toHaveLength(3)
    expect(emission).toBeTypeOf('number')
    expect(lightnessFromVoteAverage).not.toHaveBeenCalled()
  })
})