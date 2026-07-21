import type { ActiveFocusEmissionProfilePointer, FocusEmissionProfileProvenance } from '@/types/galaxy'

export const FOCUS_EMISSION_MODEL_VERSION = 'vote-average-anchored-smoothstep-v1' as const
export const RATING_MIDRANK_CDF_LUT_MODEL_VERSION = 'rating-midrank-cdf-lut-v1' as const
export const RATING_MIDRANK_CDF_LUT_RATING_MIN = 0 as const
export const RATING_MIDRANK_CDF_LUT_RATING_MAX = 10 as const
export const RATING_MIDRANK_CDF_LUT_SAMPLE_STEP = 0.05 as const
export const RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT = 201 as const
export const RATING_MIDRANK_CDF_LUT_INTENSITY_MIN = 0.005 as const
export const RATING_MIDRANK_CDF_LUT_INTENSITY_MAX = 0.65 as const

export const PRODUCTION_RATING_EMISSION_PROFILE_SCHEMA_VERSION = 'rating-emission-profile-v1' as const
export const PRODUCTION_RATING_EMISSION_PROFILE_METHOD = 'midrank-cdf-linear-lut-v1' as const
export const FOCUS_EMISSION_LEGACY_FALLBACK_PROFILE_ID = 'legacy-phase41-rating-midrank-cdf-lut-v1' as const

export type ProductionRatingEmissionProfile = {
  schema_version: typeof PRODUCTION_RATING_EMISSION_PROFILE_SCHEMA_VERSION
  profile_id: string
  period: string
  model_version: typeof RATING_MIDRANK_CDF_LUT_MODEL_VERSION
  method: typeof PRODUCTION_RATING_EMISSION_PROFILE_METHOD
  rating_domain: {
    min: number
    max: number
  }
  sample_step: number
  samples: readonly number[]
  emission_endpoints: {
    min: number
    max: number
  }
  source_data_version: string
  source_data_sha256: string
  source_movie_count: number
  source_threshold_version: string
  curve_sha256: string
  generated_at: string
  git_commit: string
}

export type FocusEmissionProfilePublicationStatus = 'candidate' | 'active' | 'legacy-fallback'

export type FocusEmissionProfileCandidate = {
  status: 'candidate'
  profile: ProductionRatingEmissionProfile
}

export type FocusEmissionProfileActivation = {
  activated_at: string
  actor: string
  reason: string
  force: boolean
}

export type FocusEmissionActivationResult = {
  activeProfileId: string | null
  activated: boolean
  candidateProfileId: string
  reason: 'initial-activation' | 'same-profile' | 'same-period-frozen' | 'force-activation' | 'older-period-rejected'
}

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

type StableJsonValue = null | boolean | number | string | readonly StableJsonValue[] | { readonly [key: string]: StableJsonValue }

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} must be an object`)
  return value as Record<string, unknown>
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  assert(typeof value === 'string' && value.trim().length > 0, `${key} must be a non-empty string`)
  return value
}

function validIsoTimestamp(value: string, label: string): void {
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), `${label} must be a UTC ISO-8601 timestamp`)
  assert(Number.isFinite(Date.parse(value)), `${label} must be a valid timestamp`)
}

function validSha256(value: string, label: string): void {
  assert(/^[a-f0-9]{64}$/.test(value), `${label} must be a lowercase SHA-256 hexadecimal digest`)
}

/** Stable JSON for profile artifacts and their hash inputs; object keys are lexical and numbers must be finite. */
export function stableFocusEmissionJson(value: StableJsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return JSON.stringify(finite(value, 'stable JSON number'))
  if (Array.isArray(value)) return `[${value.map(stableFocusEmissionJson).join(',')}]`
  assert(typeof value === 'object', 'stable JSON values must be JSON-compatible')
  const record = value as { readonly [key: string]: StableJsonValue }
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableFocusEmissionJson(record[key]!)}`).join(',')}}`
}

export function profileCurveHashInput(profile: ProductionRatingEmissionProfile): string {
  return stableFocusEmissionJson({
    emission_endpoints: profile.emission_endpoints,
    model_version: profile.model_version,
    rating_domain: profile.rating_domain,
    sample_step: profile.sample_step,
    samples: profile.samples,
  })
}

/** Parses and validates a serialized production profile without performing I/O or hashing. */
export function parseProductionRatingEmissionProfile(raw: unknown): ProductionRatingEmissionProfile {
  const record = assertRecord(raw, 'production profile')
  const ratingDomain = assertRecord(record.rating_domain, 'rating_domain')
  const emissionEndpoints = assertRecord(record.emission_endpoints, 'emission_endpoints')
  assert(Array.isArray(record.samples), 'samples must be an array')

  return validateProductionRatingEmissionProfile({
    schema_version: requiredString(record, 'schema_version') as typeof PRODUCTION_RATING_EMISSION_PROFILE_SCHEMA_VERSION,
    profile_id: requiredString(record, 'profile_id'),
    period: requiredString(record, 'period'),
    model_version: requiredString(record, 'model_version') as typeof RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
    method: requiredString(record, 'method') as typeof PRODUCTION_RATING_EMISSION_PROFILE_METHOD,
    rating_domain: { min: ratingDomain.min as number, max: ratingDomain.max as number },
    sample_step: record.sample_step as number,
    samples: record.samples as number[],
    emission_endpoints: { min: emissionEndpoints.min as number, max: emissionEndpoints.max as number },
    source_data_version: requiredString(record, 'source_data_version'),
    source_data_sha256: requiredString(record, 'source_data_sha256'),
    source_movie_count: record.source_movie_count as number,
    source_threshold_version: requiredString(record, 'source_threshold_version'),
    curve_sha256: requiredString(record, 'curve_sha256'),
    generated_at: requiredString(record, 'generated_at'),
    git_commit: requiredString(record, 'git_commit'),
  })
}

/** Validates all artifact fields except digest computation, which stays in the platform-specific generator/consumer. */
export function validateProductionRatingEmissionProfile(
  profile: ProductionRatingEmissionProfile,
): ProductionRatingEmissionProfile {
  assert(profile.schema_version === PRODUCTION_RATING_EMISSION_PROFILE_SCHEMA_VERSION, `schema_version must equal ${PRODUCTION_RATING_EMISSION_PROFILE_SCHEMA_VERSION}`)
  assert(/^[a-z0-9][a-z0-9-]{2,127}$/.test(profile.profile_id), 'profile_id must be a lowercase immutable identifier')
  assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(profile.period), 'period must be YYYY-MM')
  assert(profile.model_version === RATING_MIDRANK_CDF_LUT_MODEL_VERSION, `model_version must equal ${RATING_MIDRANK_CDF_LUT_MODEL_VERSION}`)
  assert(profile.method === PRODUCTION_RATING_EMISSION_PROFILE_METHOD, `method must equal ${PRODUCTION_RATING_EMISSION_PROFILE_METHOD}`)
  assert(profile.rating_domain.min === RATING_MIDRANK_CDF_LUT_RATING_MIN && profile.rating_domain.max === RATING_MIDRANK_CDF_LUT_RATING_MAX, 'rating_domain must equal [0, 10]')
  assert(profile.sample_step === RATING_MIDRANK_CDF_LUT_SAMPLE_STEP, 'sample_step must equal 0.05')
  assert(profile.emission_endpoints.min === RATING_MIDRANK_CDF_LUT_INTENSITY_MIN && profile.emission_endpoints.max === RATING_MIDRANK_CDF_LUT_INTENSITY_MAX, 'emission_endpoints must equal [0.005, 0.65]')
  assert(Number.isSafeInteger(profile.source_movie_count) && profile.source_movie_count > 0, 'source_movie_count must be a positive safe integer')
  assert(profile.source_data_version.trim().length > 0, 'source_data_version must be a non-empty string')
  assert(profile.source_threshold_version.trim().length > 0, 'source_threshold_version must be a non-empty string')
  validSha256(profile.source_data_sha256, 'source_data_sha256')
  validSha256(profile.curve_sha256, 'curve_sha256')
  validIsoTimestamp(profile.generated_at, 'generated_at')
  assert(/^[a-f0-9]{7,40}$/.test(profile.git_commit), 'git_commit must be a 7..40 character lowercase hexadecimal revision')

  const curve = validateRatingMidrankCdfLutProfile({
    modelVersion: profile.model_version,
    ratingMin: profile.rating_domain.min,
    ratingMax: profile.rating_domain.max,
    sampleStep: profile.sample_step,
    samples: profile.samples,
    intensityMin: profile.emission_endpoints.min,
    intensityMax: profile.emission_endpoints.max,
  })

  return {
    ...profile,
    rating_domain: { min: curve.ratingMin, max: curve.ratingMax },
    sample_step: curve.sampleStep,
    samples: curve.samples,
    emission_endpoints: { min: curve.intensityMin, max: curve.intensityMax },
  }
}

/** A candidate is validated and immutable but has no active-pointer authority. */
export function createFocusEmissionProfileCandidate(profile: ProductionRatingEmissionProfile): FocusEmissionProfileCandidate {
  return { status: 'candidate', profile: validateProductionRatingEmissionProfile(profile) }
}

/** Connects deterministic hash implementations to the pure profile contract. */
export function validateProductionRatingEmissionProfileHash(
  profile: ProductionRatingEmissionProfile,
  hashCurve: (input: string) => string,
): ProductionRatingEmissionProfile {
  const validated = validateProductionRatingEmissionProfile(profile)
  const actual = hashCurve(profileCurveHashInput(validated))
  validSha256(actual, 'computed curve SHA-256')
  assert(actual === validated.curve_sha256, 'curve_sha256 does not match the canonical curve input')
  return validated
}

export function serializeProductionRatingEmissionProfile(profile: ProductionRatingEmissionProfile): string {
  return `${stableFocusEmissionJson(validateProductionRatingEmissionProfile(profile))}\n`
}

export function productionProfileToLutProfile(profile: ProductionRatingEmissionProfile): RatingMidrankCdfLutProfile {
  const validated = validateProductionRatingEmissionProfile(profile)
  return validateRatingMidrankCdfLutProfile({
    modelVersion: validated.model_version,
    ratingMin: validated.rating_domain.min,
    ratingMax: validated.rating_domain.max,
    sampleStep: validated.sample_step,
    samples: validated.samples,
    intensityMin: validated.emission_endpoints.min,
    intensityMax: validated.emission_endpoints.max,
  })
}

/**
 * Selects the next active profile without persistence. Same-month non-forced candidates stay candidates;
 * an invalid candidate never reaches this boundary because it is validated first.
 */
export function focusEmissionProfileProvenance(profile: ProductionRatingEmissionProfile): FocusEmissionProfileProvenance {
  const validated = validateProductionRatingEmissionProfile(profile)
  return {
    profile_id: validated.profile_id,
    period: validated.period,
    model_version: validated.model_version,
    curve_sha256: validated.curve_sha256,
    source_data_version: validated.source_data_version,
    source_movie_count: validated.source_movie_count,
  }
}

/** Creates a minimal active pointer only after curve digest validation has succeeded. */
export function createActiveFocusEmissionProfilePointer(
  profile: ProductionRatingEmissionProfile,
  activatedAt: string,
  hashCurve: (input: string) => string,
): ActiveFocusEmissionProfilePointer {
  const validated = validateProductionRatingEmissionProfileHash(profile, hashCurve)
  validIsoTimestamp(activatedAt, 'activated_at')
  return {
    ...focusEmissionProfileProvenance(validated),
    status: 'active',
    activated_at: activatedAt,
  }
}

/** Rejects pointers whose minimal provenance does not exactly match a validated profile artifact. */
export function assertActiveFocusEmissionProfilePointer(
  pointer: ActiveFocusEmissionProfilePointer,
  profile: ProductionRatingEmissionProfile,
  hashCurve: (input: string) => string,
): void {
  const verified = createActiveFocusEmissionProfilePointer(profile, pointer.activated_at, hashCurve)
  assert(pointer.status === 'active', 'active pointer status must be active')
  assert(stableFocusEmissionJson({ ...pointer }) === stableFocusEmissionJson({ ...verified }), 'active pointer must exactly match a validated profile provenance')
}

export const LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE: FocusEmissionProfileProvenance = {
  profile_id: FOCUS_EMISSION_LEGACY_FALLBACK_PROFILE_ID,
  period: '2026-07',
  model_version: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  curve_sha256: 'd3c434c9ccb4e2e520edc4d5a8e1cb7a2d7842d42800cd225ab6482fbaa91d6d',
  source_data_version: '2026.07.18.daily.113',
  source_movie_count: 61531,
}

/** Legacy is an explicit compatibility source, not a silently fabricated monthly active pointer. */
export function legacyFocusEmissionFallbackPointer(activatedAt: string): ActiveFocusEmissionProfilePointer {
  validIsoTimestamp(activatedAt, 'activated_at')
  return { ...LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE, status: 'legacy-fallback', activated_at: activatedAt }
}

export function decideFocusEmissionActivation(
  active: Pick<ProductionRatingEmissionProfile, 'profile_id' | 'period'> | null,
  candidate: ProductionRatingEmissionProfile,
  force = false,
): FocusEmissionActivationResult {
  const validatedCandidate = validateProductionRatingEmissionProfile(candidate)
  if (active === null) return { activeProfileId: validatedCandidate.profile_id, activated: true, candidateProfileId: validatedCandidate.profile_id, reason: 'initial-activation' }
  assert(/^[a-z0-9][a-z0-9-]{2,127}$/.test(active.profile_id), 'active profile_id must be a lowercase immutable identifier')
  assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(active.period), 'active period must be YYYY-MM')
  if (active.profile_id === validatedCandidate.profile_id) return { activeProfileId: active.profile_id, activated: false, candidateProfileId: validatedCandidate.profile_id, reason: 'same-profile' }
  if (force) return { activeProfileId: validatedCandidate.profile_id, activated: true, candidateProfileId: validatedCandidate.profile_id, reason: 'force-activation' }
  if (active.period === validatedCandidate.period) return { activeProfileId: active.profile_id, activated: false, candidateProfileId: validatedCandidate.profile_id, reason: 'same-period-frozen' }
  if (active.period > validatedCandidate.period) return { activeProfileId: active.profile_id, activated: false, candidateProfileId: validatedCandidate.profile_id, reason: 'older-period-rejected' }
  return { activeProfileId: validatedCandidate.profile_id, activated: true, candidateProfileId: validatedCandidate.profile_id, reason: 'initial-activation' }
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