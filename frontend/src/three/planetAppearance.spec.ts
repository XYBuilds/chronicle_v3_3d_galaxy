import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/colorMath', () => ({
  lightnessFromVoteAverage: vi.fn(() => {
    throw new Error('focus emission must not call macro lightness mapping')
  }),
}))

import { lightnessFromVoteAverage } from '@/lib/colorMath'

import {
  FOCUS_EMISSION_MODEL_VERSION,
  RATING_MIDRANK_CDF_LUT_INTENSITY_MAX,
  RATING_MIDRANK_CDF_LUT_INTENSITY_MIN,
  RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT,
  RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
  focusEmissionIntensityFromVoteAverage,
  validateFocusEmissionCurve,
  type FocusEmissionCurve,
  type RatingMidrankCdfLutProfile,
} from './focusEmission'
import { resolvePlanetAppearance } from './planetAppearance'
import type { Movie } from '@/types/galaxy'

const curve: FocusEmissionCurve = {
  modelVersion: FOCUS_EMISSION_MODEL_VERSION,
  ratingLowAnchor: 4.5,
  ratingHighAnchor: 8.2,
  intensityMin: 0.005,
  intensityMax: 0.65,
}

const appearanceMovie = {
  id: 1,
  genres: ['Drama'],
  genre_color: [0.2, 0.4, 0.6],
  vote_average: 5,
} as Movie

const diagnosticProfile: RatingMidrankCdfLutProfile = {
  modelVersion: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  ratingMin: 0,
  ratingMax: 10,
  sampleStep: RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
  samples: Array.from({ length: RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT }, (_, index) => index / 200 * 0.645 + 0.005),
  intensityMin: RATING_MIDRANK_CDF_LUT_INTENSITY_MIN,
  intensityMax: RATING_MIDRANK_CDF_LUT_INTENSITY_MAX,
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

describe('planet appearance emission profiles', () => {
  it('requires an explicit active profile at the production resolver boundary', () => {
    expect(resolvePlanetAppearance).toHaveLength(3)
    expect(resolvePlanetAppearance(appearanceMovie, { Drama: '#336699' }, diagnosticProfile).emissionCurve).toBe(diagnosticProfile)

    expect(() => {
      // @ts-expect-error Production appearance resolution cannot omit the verified profile.
      resolvePlanetAppearance(appearanceMovie, { Drama: '#336699' })
    }).toBeTypeOf('function')
  })

  it('changes only emission intensity across diagnostic ratings', () => {
    const low = resolvePlanetAppearance(
      { ...appearanceMovie, vote_average: 4.5 },
      { Drama: '#336699' },
      diagnosticProfile,
    )
    const high = resolvePlanetAppearance(
      { ...appearanceMovie, vote_average: 7.5 },
      { Drama: '#336699' },
      diagnosticProfile,
    )
    const { emissionIntensity: lowEmission, ...lowStatic } = low
    const { emissionIntensity: highEmission, ...highStatic } = high

    expect(highEmission).toBeGreaterThan(lowEmission)
    expect(highStatic).toEqual(lowStatic)
  })

  it('uses a supplied diagnostic profile without calculating distribution statistics', () => {
    const appearance = resolvePlanetAppearance(
      appearanceMovie,
      { Drama: '#336699' },
      diagnosticProfile,
    )

    expect(appearance.emissionProfile).toBe(diagnosticProfile)
    expect(appearance.emissionIntensity).toBe(diagnosticProfile.samples[100])
  })

  it('keeps the verified profile identity at the appearance boundary while only rating changes the intensity', () => {
    const activeProfile: RatingMidrankCdfLutProfile = {
      ...diagnosticProfile,
      samples: diagnosticProfile.samples.map((sample, index) => index < 100 ? sample : Math.min(0.65, sample + 0.01)),
    }
    const low = resolvePlanetAppearance({ ...appearanceMovie, vote_average: 4.5 }, { Drama: '#336699' }, activeProfile)
    const high = resolvePlanetAppearance({ ...appearanceMovie, vote_average: 7.5 }, { Drama: '#336699' }, activeProfile)

    expect(low.emissionProfile).toBe(activeProfile)
    expect(high.emissionCurve).toBe(activeProfile)
    expect(high.emissionIntensity).toBeGreaterThan(low.emissionIntensity)
    expect({ ...high, emissionIntensity: low.emissionIntensity }).toEqual(low)
  })
})
