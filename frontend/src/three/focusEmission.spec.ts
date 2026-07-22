import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  RATING_MIDRANK_CDF_LUT_INTENSITY_MAX,
  RATING_MIDRANK_CDF_LUT_INTENSITY_MIN,
  RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT,
  RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
  createActiveFocusEmissionProfilePointer,
  decideFocusEmissionActivation,
  parseProductionRatingEmissionProfile,
  profileCurveHashInput,
  serializeProductionRatingEmissionProfile,
  validateProductionRatingEmissionProfileHash,
  emissionIntensityFromValidatedRatingMidrankCdfLut,
  generateRatingMidrankCdfLutProfile,
  midrankCdfForSortedFinalRenderRatings,
  validateRatingMidrankCdfLutProfile,
  type RatingMidrankCdfLutProfile,
  type ProductionRatingEmissionProfile,
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

  it('is byte-stable for the same sorted ratings and preserves monotonic finite samples', () => {
    const ratings = [4, 5.5, 6, 6, 6.5, 7, 8.5]
    const first = generateRatingMidrankCdfLutProfile(ratings)
    const second = generateRatingMidrankCdfLutProfile(ratings)

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first.samples.every(Number.isFinite)).toBe(true)
    first.samples.slice(1).forEach((sample, index) => expect(sample).toBeGreaterThanOrEqual(first.samples[index]!))
  })

  it('keeps duplicate-rating midranks below the raw cumulative jump', () => {
    const ratings = [4, 6, 6, 6, 8]

    expect(midrankCdfForSortedFinalRenderRatings(6, ratings)).toBe(0.5)
    expect(midrankCdfForSortedFinalRenderRatings(6, ratings)).not.toBe(4 / ratings.length)
  })

  it('rejects non-finite profile fields as well as non-finite samples', () => {
    const profile = linearProfile()

    expect(() => validateRatingMidrankCdfLutProfile({ ...profile, ratingMin: NaN })).toThrow()
    expect(() => validateRatingMidrankCdfLutProfile({ ...profile, intensityMax: Infinity })).toThrow()
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

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function productionProfile(overrides: Partial<ProductionRatingEmissionProfile> = {}): ProductionRatingEmissionProfile {
  const base = {
    schema_version: 'rating-emission-profile-v1',
    profile_id: 'rating-emission-2026-07-a',
    period: '2026-07',
    model_version: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
    method: 'midrank-cdf-linear-lut-v1',
    rating_domain: { min: 0, max: 10 },
    sample_step: RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
    samples: linearProfile().samples,
    emission_endpoints: { min: RATING_MIDRANK_CDF_LUT_INTENSITY_MIN, max: RATING_MIDRANK_CDF_LUT_INTENSITY_MAX },
    source_data_version: '2026.07.22.monthly.1',
    source_data_sha256: 'a'.repeat(64),
    source_movie_count: 61531,
    source_threshold_version: 'dynamic-vote-count-v1',
    curve_sha256: '0'.repeat(64),
    generated_at: '2026-07-22T00:00:00.000Z',
    git_commit: '0123456789abcdef',
  } as ProductionRatingEmissionProfile
  const candidate = { ...base, ...overrides }
  return { ...candidate, curve_sha256: sha256(profileCurveHashInput(candidate)) }
}

describe('production rating-emission profile contract', () => {
  it('parses, validates its curve hash, and serializes canonically', () => {
    const profile = productionProfile()
    const parsed = parseProductionRatingEmissionProfile(JSON.parse(JSON.stringify(profile)))

    expect(validateProductionRatingEmissionProfileHash(parsed, sha256)).toEqual(parsed)
    expect(serializeProductionRatingEmissionProfile(parsed)).toBe(serializeProductionRatingEmissionProfile({ ...parsed, samples: [...parsed.samples] }))
    expect(serializeProductionRatingEmissionProfile(parsed)).toContain('"samples"')
    expect(parsed.samples).toHaveLength(201)
  })

  it.each([
    { samples: productionProfile().samples.slice(1) },
    { rating_domain: { min: 0, max: 9 } },
    { emission_endpoints: { min: 0, max: 0.65 } },
    { samples: productionProfile().samples.map((sample, index) => index === 100 ? Number.NaN : sample) },
    { samples: productionProfile().samples.map((sample, index) => index === 100 ? 0.1 : sample) },
  ])('fails closed for malformed production profile %#', (overrides) => {
    expect(() => parseProductionRatingEmissionProfile({ ...productionProfile(), ...overrides })).toThrow()
  })

  it('rejects a curve hash mismatch before a profile can become active', () => {
    const profile = productionProfile()
    expect(() => validateProductionRatingEmissionProfileHash({ ...profile, curve_sha256: 'b'.repeat(64) }, sha256)).toThrow(/curve_sha256/)
    expect(() => createActiveFocusEmissionProfilePointer({ ...profile, curve_sha256: 'b'.repeat(64) }, '2026-07-22T01:00:00.000Z', sha256)).toThrow(/curve_sha256/)
  })

  it('freezes same-month ordinary candidates but allows explicit force activation', () => {
    const active = productionProfile()
    const candidate = productionProfile({ profile_id: 'rating-emission-2026-07-b' })

    expect(decideFocusEmissionActivation(active, candidate)).toMatchObject({ activeProfileId: active.profile_id, activated: false, reason: 'same-period-frozen' })
    expect(decideFocusEmissionActivation(active, candidate, true)).toMatchObject({ activeProfileId: candidate.profile_id, activated: true, reason: 'force-activation' })
  })

  it('matches the Python monthly generator canonical curve hash fixture', () => {
    const lut = generateRatingMidrankCdfLutProfile([4, 6, 6, 8])
    const hashInput = profileCurveHashInput({
      schema_version: 'rating-emission-profile-v1',
      profile_id: 'rating-emission-2026-07-8d238cdd5788',
      period: '2026-07',
      model_version: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
      method: 'midrank-cdf-linear-lut-v1',
      rating_domain: { min: 0, max: 10 },
      sample_step: lut.sampleStep,
      samples: lut.samples,
      emission_endpoints: { min: lut.intensityMin, max: lut.intensityMax },
      source_data_version: '2026.07.22.monthly.42',
      source_data_sha256: '8d238cdd57887bfec3d280c9bb861ef2e331220645a29a5ea9376769ab5892cd',
      source_movie_count: 4,
      source_threshold_version: 'dynamic-vote-count-v42',
      curve_sha256: '0'.repeat(64),
      generated_at: '2026-07-22T01:02:03.000Z',
      git_commit: '0123456789abcdef',
    })

    expect(sha256(hashInput)).toBe('79bb84a97d49bdc8c1fe4260706eca27fbbcca1ac0e46757c13a68d0a89f5dc8')
  })

  it('matches the shared monthly fixture at exact grid nodes and interpolation midpoints', () => {
    const profile = validateRatingMidrankCdfLutProfile(generateRatingMidrankCdfLutProfile([4, 6, 6, 8]))

    expect(profile.samples[80]).toBe(0.085625)
    expect(profile.samples[81]).toBe(0.16625)
    expect(profile.samples[120]).toBe(0.3275)
    expect(profile.samples[121]).toBe(0.48875)
    expect(profile.samples[160]).toBeCloseTo(0.569375, 14)
    expect(profile.samples[161]).toBe(0.65)
    expect(emissionIntensityFromValidatedRatingMidrankCdfLut(4.025, profile)).toBe(0.1259375)
    expect(emissionIntensityFromValidatedRatingMidrankCdfLut(6.025, profile)).toBe(0.408125)
  })
})
