export const FOCUS_EMISSION_MODEL_VERSION = 'vote-average-anchored-smoothstep-v1' as const
export const RATING_MIDRANK_CDF_LUT_MODEL_VERSION = 'rating-midrank-cdf-lut-v1' as const
export const RATING_MIDRANK_CDF_LUT_RATING_MIN = 0 as const
export const RATING_MIDRANK_CDF_LUT_RATING_MAX = 10 as const
export const RATING_MIDRANK_CDF_LUT_SAMPLE_STEP = 0.05 as const
export const RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT = 201 as const
export const RATING_MIDRANK_CDF_LUT_INTENSITY_MIN = 0.005 as const
export const RATING_MIDRANK_CDF_LUT_INTENSITY_MAX = 0.65 as const

export type FocusEmissionCurve = {
  modelVersion: typeof FOCUS_EMISSION_MODEL_VERSION
  ratingLowAnchor: number
  ratingHighAnchor: number
  intensityMin: number
  intensityMax: number
}

export type RatingMidrankCdfLutProfile = {
  modelVersion: typeof RATING_MIDRANK_CDF_LUT_MODEL_VERSION
  ratingMin: number
  ratingMax: number
  sampleStep: number
  samples: readonly number[]
  intensityMin: number
  intensityMax: number
}

export type FocusEmissionProfile = FocusEmissionCurve | RatingMidrankCdfLutProfile

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[FocusEmission] ${message}`)
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`[FocusEmission] ${label} must be finite; received ${value}`)
  }
  return value
}

function validateSortedFinalRenderRatings(sortedRatings: readonly number[]): void {
  assert(sortedRatings.length > 0, 'final rendered rating samples must not be empty')

  let previous = -Infinity
  for (let index = 0; index < sortedRatings.length; index += 1) {
    const rating = finite(sortedRatings[index]!, `final rendered rating sample ${index}`)
    assert(
      rating >= RATING_MIDRANK_CDF_LUT_RATING_MIN && rating <= RATING_MIDRANK_CDF_LUT_RATING_MAX,
      `final rendered rating sample ${index} must be within [0, 10]; received ${rating}`,
    )
    assert(rating >= previous, `final rendered rating samples must be sorted at index ${index}`)
    previous = rating
  }
}

function midrankCdfFromValidatedSortedRatings(rating: number, sortedRatings: readonly number[]): number {
  let lowerCount = 0
  while (lowerCount < sortedRatings.length && sortedRatings[lowerCount]! < rating) lowerCount += 1

  let equalEnd = lowerCount
  while (equalEnd < sortedRatings.length && sortedRatings[equalEnd] === rating) equalEnd += 1

  const percentile = (lowerCount + 0.5 * (equalEnd - lowerCount)) / sortedRatings.length
  assert(Number.isFinite(percentile) && percentile >= 0 && percentile <= 1, `midrank CDF must be finite within [0, 1]; received ${percentile}`)
  return percentile
}

function gridRatingAt(index: number): number {
  assert(index >= 0 && index < RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT, `LUT grid index must be within 0..200; received ${index}`)
  return index === RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT - 1
    ? RATING_MIDRANK_CDF_LUT_RATING_MAX
    : RATING_MIDRANK_CDF_LUT_RATING_MIN + index * RATING_MIDRANK_CDF_LUT_SAMPLE_STEP
}

/** Validates the versioned Focus rating-to-emission production contract. */
export function validateFocusEmissionCurve(curve: FocusEmissionCurve): FocusEmissionCurve {
  if (curve.modelVersion !== FOCUS_EMISSION_MODEL_VERSION) {
    throw new Error(`[FocusEmission] modelVersion must equal ${FOCUS_EMISSION_MODEL_VERSION}; received ${String(curve.modelVersion)}`)
  }
  const ratingLowAnchor = finite(curve.ratingLowAnchor, 'ratingLowAnchor')
  const ratingHighAnchor = finite(curve.ratingHighAnchor, 'ratingHighAnchor')
  const intensityMin = finite(curve.intensityMin, 'intensityMin')
  const intensityMax = finite(curve.intensityMax, 'intensityMax')

  if (ratingLowAnchor < 0 || ratingHighAnchor > 10 || ratingLowAnchor >= ratingHighAnchor) {
    throw new Error('[FocusEmission] rating anchors must satisfy 0 <= ratingLowAnchor < ratingHighAnchor <= 10')
  }
  if (intensityMin < 0 || intensityMax < 0 || intensityMin > intensityMax) {
    throw new Error('[FocusEmission] intensity endpoints must be non-negative with intensityMin <= intensityMax')
  }

  return { modelVersion: FOCUS_EMISSION_MODEL_VERSION, ratingLowAnchor, ratingHighAnchor, intensityMin, intensityMax }
}

export function validateRatingMidrankCdfLutProfile(profile: RatingMidrankCdfLutProfile): RatingMidrankCdfLutProfile {
  assert(
    profile.modelVersion === RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
    `modelVersion must equal ${RATING_MIDRANK_CDF_LUT_MODEL_VERSION}; received ${String(profile.modelVersion)}`,
  )
  assert(profile.ratingMin === RATING_MIDRANK_CDF_LUT_RATING_MIN, 'ratingMin must equal 0')
  assert(profile.ratingMax === RATING_MIDRANK_CDF_LUT_RATING_MAX, 'ratingMax must equal 10')
  assert(profile.sampleStep === RATING_MIDRANK_CDF_LUT_SAMPLE_STEP, 'sampleStep must equal 0.05')
  assert(profile.samples.length === RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT, 'samples length must equal 201')
  assert(profile.intensityMin === RATING_MIDRANK_CDF_LUT_INTENSITY_MIN, 'intensityMin must equal 0.005')
  assert(profile.intensityMax === RATING_MIDRANK_CDF_LUT_INTENSITY_MAX, 'intensityMax must equal 0.65')

  finite(profile.ratingMin, 'ratingMin')
  finite(profile.ratingMax, 'ratingMax')
  finite(profile.sampleStep, 'sampleStep')
  finite(profile.intensityMin, 'intensityMin')
  finite(profile.intensityMax, 'intensityMax')

  let previous = -Infinity
  for (let index = 0; index < profile.samples.length; index += 1) {
    const emission = finite(profile.samples[index]!, `samples[${index}]`)
    assert(emission >= previous, `samples must be monotonic at index ${index}`)
    assert(
      emission >= profile.intensityMin && emission <= profile.intensityMax,
      `samples[${index}] must be within the declared intensity range`,
    )
    previous = emission
  }

  assert(profile.samples[0] === profile.intensityMin, 'samples[0] must equal intensityMin exactly')
  assert(
    profile.samples[profile.samples.length - 1] === profile.intensityMax,
    'last sample must equal intensityMax exactly',
  )

  return {
    modelVersion: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
    ratingMin: RATING_MIDRANK_CDF_LUT_RATING_MIN,
    ratingMax: RATING_MIDRANK_CDF_LUT_RATING_MAX,
    sampleStep: RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
    samples: [...profile.samples],
    intensityMin: RATING_MIDRANK_CDF_LUT_INTENSITY_MIN,
    intensityMax: RATING_MIDRANK_CDF_LUT_INTENSITY_MAX,
  }
}

export function midrankCdfForSortedFinalRenderRatings(rating: number, sortedRatings: readonly number[]): number {
  const validatedRating = finite(rating, 'rating')
  assert(
    validatedRating >= RATING_MIDRANK_CDF_LUT_RATING_MIN && validatedRating <= RATING_MIDRANK_CDF_LUT_RATING_MAX,
    `rating must be within [0, 10]; received ${validatedRating}`,
  )
  validateSortedFinalRenderRatings(sortedRatings)
  return midrankCdfFromValidatedSortedRatings(validatedRating, sortedRatings)
}

export function generateRatingMidrankCdfLutProfile(
  sortedFinalRenderRatings: readonly number[],
): RatingMidrankCdfLutProfile {
  validateSortedFinalRenderRatings(sortedFinalRenderRatings)

  const samples = Array.from({ length: RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT }, (_, index) => {
    if (index === 0) return RATING_MIDRANK_CDF_LUT_INTENSITY_MIN
    if (index === RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT - 1) return RATING_MIDRANK_CDF_LUT_INTENSITY_MAX

    const percentile = midrankCdfFromValidatedSortedRatings(gridRatingAt(index), sortedFinalRenderRatings)
    return RATING_MIDRANK_CDF_LUT_INTENSITY_MIN + percentile * (RATING_MIDRANK_CDF_LUT_INTENSITY_MAX - RATING_MIDRANK_CDF_LUT_INTENSITY_MIN)
  })

  return validateRatingMidrankCdfLutProfile({
    modelVersion: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
    ratingMin: RATING_MIDRANK_CDF_LUT_RATING_MIN,
    ratingMax: RATING_MIDRANK_CDF_LUT_RATING_MAX,
    sampleStep: RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
    samples,
    intensityMin: RATING_MIDRANK_CDF_LUT_INTENSITY_MIN,
    intensityMax: RATING_MIDRANK_CDF_LUT_INTENSITY_MAX,
  })
}

function emissionIntensityFromValidatedRatingMidrankCdfLutInternal(
  voteAverage: number,
  profile: RatingMidrankCdfLutProfile,
): number {
  const rating = finite(voteAverage, 'voteAverage')
  const clampedRating = Math.min(profile.ratingMax, Math.max(profile.ratingMin, rating))
  const position = (clampedRating - profile.ratingMin) / profile.sampleStep
  const nearestIndex = Math.round(position)

  if (Math.abs(position - nearestIndex) <= 1e-12) {
    return profile.samples[nearestIndex]!
  }

  const lowerIndex = Math.floor(position)
  const upperIndex = lowerIndex + 1
  const fraction = position - lowerIndex
  return profile.samples[lowerIndex]! + fraction * (profile.samples[upperIndex]! - profile.samples[lowerIndex]!)
}

export function emissionIntensityFromValidatedRatingMidrankCdfLut(
  voteAverage: number,
  profile: RatingMidrankCdfLutProfile,
): number {
  return emissionIntensityFromValidatedRatingMidrankCdfLutInternal(
    voteAverage,
    validateRatingMidrankCdfLutProfile(profile),
  )
}

export function focusEmissionIntensityFromProfile(voteAverage: number, profile: FocusEmissionProfile): number {
  if (profile.modelVersion === FOCUS_EMISSION_MODEL_VERSION) {
    return focusEmissionIntensityFromVoteAverage(voteAverage, profile)
  }
  if (profile.modelVersion === RATING_MIDRANK_CDF_LUT_MODEL_VERSION) {
    return emissionIntensityFromValidatedRatingMidrankCdfLut(voteAverage, profile)
  }
  throw new Error('[FocusEmission] unsupported modelVersion')
}

/**
 * Maps a finite TMDB vote average to the fixed Focus emission interval.
 * Ratings are clamped to curve anchors before the smoothstep transfer.
 */
export function focusEmissionIntensityFromVoteAverage(voteAverage: number, curve: FocusEmissionCurve): number {
  const rating = finite(voteAverage, 'voteAverage')
  const validated = validateFocusEmissionCurve(curve)
  const t = Math.min(
    1,
    Math.max(0, (rating - validated.ratingLowAnchor) / (validated.ratingHighAnchor - validated.ratingLowAnchor)),
  )
  const smoothstep = t * t * (3 - 2 * t)
  return validated.intensityMin + smoothstep * (validated.intensityMax - validated.intensityMin)
}