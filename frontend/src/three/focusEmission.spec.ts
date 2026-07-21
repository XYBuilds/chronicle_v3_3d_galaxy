import { describe, expect, it } from 'vitest'

import {
  RATING_MIDRANK_CDF_LUT_INTENSITY_MAX,
  RATING_MIDRANK_CDF_LUT_INTENSITY_MIN,
  RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT,
  RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
  emissionIntensityFromValidatedRatingMidrankCdfLut,
  generateRatingMidrankCdfLutProfile,
  midrankCdfForSortedFinalRenderRatings,
  validateRatingMidrankCdfLutProfile,
  type RatingMidrankCdfLutProfile,
} from './focusEmission'

function linearProfile(): RatingMidrankCdfLutProfile {
  return {
    modelVersion: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
    ratingMin: 0,
    ratingMax: 10,
    sampleStep: RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
    samples: Array.from({ length: RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT }, (_, index) => index / 200 * 0.645 + 0.005),
    intensityMin: RATING_MIDRANK_CDF_LUT_INTENSITY_MIN,
    intensityMax: RATING_MIDRANK_CDF_LUT_INTENSITY_MAX,
  }
}

describe('rating midrank CDF LUT', () => {
  it('uses midrank for duplicate final-render rating values', () => {
    const ratings = [4, 6, 6, 6, 8]

    expect(midrankCdfForSortedFinalRenderRatings(6, ratings)).toBe(0.5)
    expect(midrankCdfForSortedFinalRenderRatings(4, ratings)).toBe(0.1)
    expect(midrankCdfForSortedFinalRenderRatings(8, ratings)).toBe(0.9)
  })

  it('generates the fixed 0..10 grid and exact emission endpoints', () => {
    const profile = generateRatingMidrankCdfLutProfile([4, 6, 6, 8])

    expect(profile.samples).toHaveLength(RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT)
    expect(profile.sampleStep).toBe(0.05)
    expect(profile.samples[0]).toBe(RATING_MIDRANK_CDF_LUT_INTENSITY_MIN)
    expect(profile.samples.at(-1)).toBe(RATING_MIDRANK_CDF_LUT_INTENSITY_MAX)
    expect(profile.samples.every(Number.isFinite)).toBe(true)
    profile.samples.slice(1).forEach((sample, index) => expect(sample).toBeGreaterThanOrEqual(profile.samples[index]!))
  })

  it('returns deterministic exact sample values for grid-node ratings', () => {
    const profile = validateRatingMidrankCdfLutProfile(linearProfile())

    expect(emissionIntensityFromValidatedRatingMidrankCdfLut(5, profile)).toBe(profile.samples[100])
    expect(emissionIntensityFromValidatedRatingMidrankCdfLut(10, profile)).toBe(profile.samples[200])
  })

  it('linearly interpolates between adjacent grid nodes', () => {
    const profile = validateRatingMidrankCdfLutProfile(linearProfile())
    const lower = profile.samples[100]!
    const upper = profile.samples[101]!

    expect(emissionIntensityFromValidatedRatingMidrankCdfLut(5.025, profile)).toBe((lower + upper) / 2)
  })

  it('clamps ratings outside the LUT domain to exact endpoints', () => {
    const profile = validateRatingMidrankCdfLutProfile(linearProfile())

    expect(emissionIntensityFromValidatedRatingMidrankCdfLut(-1, profile)).toBe(profile.samples[0])
    expect(emissionIntensityFromValidatedRatingMidrankCdfLut(11, profile)).toBe(profile.samples.at(-1))
  })

  it.each([NaN, Infinity, -Infinity])('rejects non-finite samples and ratings: %s', (invalidNumber) => {
    expect(() => generateRatingMidrankCdfLutProfile([4, invalidNumber, 6])).toThrow(/finite/)
    expect(() => midrankCdfForSortedFinalRenderRatings(invalidNumber, [4, 6])).toThrow(/finite/)
    expect(() => emissionIntensityFromValidatedRatingMidrankCdfLut(invalidNumber, validateRatingMidrankCdfLutProfile(linearProfile()))).toThrow(/finite/)
  })

  it.each([
    { ...linearProfile(), samples: linearProfile().samples.slice(1) },
    { ...linearProfile(), samples: linearProfile().samples.map((sample, index) => index === 101 ? 0.1 : sample) },
    { ...linearProfile(), samples: linearProfile().samples.map((sample, index) => index === 100 ? Infinity : sample) },
  ])('fails fast when validation or the public evaluator receives a malformed LUT profile', (profile) => {
    expect(() => validateRatingMidrankCdfLutProfile(profile)).toThrow()
    expect(() => emissionIntensityFromValidatedRatingMidrankCdfLut(5, profile)).toThrow()
  })

  it('rejects empty, unsorted, and out-of-domain final-render rating samples', () => {
    expect(() => generateRatingMidrankCdfLutProfile([])).toThrow(/must not be empty/)
    expect(() => generateRatingMidrankCdfLutProfile([6, 4])).toThrow(/must be sorted/)
    expect(() => generateRatingMidrankCdfLutProfile([4, 10.1])).toThrow(/within \[0, 10\]/)
  })
})