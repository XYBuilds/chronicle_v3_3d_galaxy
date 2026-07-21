import { createHash } from 'node:crypto'

import {
  FOCUS_EMISSION_MODEL_VERSION,
  RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT,
  RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
  focusEmissionIntensityFromVoteAverage,
  validateFocusEmissionCurve,
  validateRatingMidrankCdfLutProfile,
  type FocusEmissionCurve,
  type RatingMidrankCdfLutProfile,
} from '../../../frontend/src/three/focusEmission.js'
import { PLANET_VISUAL_DEFAULTS } from '../../../frontend/src/three/planetVisualDefaults.js'

import { PHASE41_CONTROLLED_RATINGS, AUTHORITATIVE_GZIP_RELATIVE_PATH } from './phase41Baseline.js'

export const P41_EMISSION_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/p41.5-emission-curve-bloom-off' as const

/**
 * Frozen source for both P41.5 candidates. The diagnostic candidate must read movies from
 * this exact gzip only; it is not a production data or schema contract.
 */
export const P41_EMISSION_AUTHORITATIVE_DATA = {
  relativePath: AUTHORITATIVE_GZIP_RELATIVE_PATH,
  sha256: 'eb15d597479f4f46792c440ae6478ddade9ba1bd95cc623d0dd135e680c60cad',
  dataVersion: '2026.07.18.daily.113',
  movieCount: 61531,
} as const

/** The only matrix fields permitted to differ between emission candidates. */
export const P41_EMISSION_ALLOWED_VARIATION_FIELDS = ['rating', 'emission'] as const

/**
 * Preserved, candidate-no-go historical baseline. Its existing evidence directory is read-only:
 * do not regenerate into it while evaluating the CDF/LUT diagnostic candidate.
 */
export const P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE = {
  candidateId: 'anchored-smoothstep-historical-baseline',
  status: 'candidate-no-go',
  modelVersion: FOCUS_EMISSION_MODEL_VERSION,
  evidenceDirectory: P41_EMISSION_EVIDENCE_RELATIVE_DIRECTORY,
  input: P41_EMISSION_AUTHORITATIVE_DATA,
  allowedVariationFields: P41_EMISSION_ALLOWED_VARIATION_FIELDS,
} as const

/**
 * Diagnostic-only candidate metadata. Its LUT contract is validated in 41.5.3;
 * rendering and human evidence remain deferred to 41.5.4 and 41.5.5.
 */
export const P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE = {
  candidateId: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  status: 'contract-ready',
  scope: 'diagnostic-only',
  curveModelVersion: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  input: P41_EMISSION_AUTHORITATIVE_DATA,
  ratingMin: 0,
  ratingMax: 10,
  percentile: {
    method: 'midrank',
    formula: '(count(< rating) + 0.5 * count(= rating)) / N',
    samples: 'authoritative movies only',
  },
  lut: {
    sampleStep: RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
    sampleCount: RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT,
    interpolation: 'linear',
  },
  intensityMin: 0.005,
  intensityMax: 0.65,
  allowedVariationFields: P41_EMISSION_ALLOWED_VARIATION_FIELDS,
  prohibitedUntilLaterPhase: [
    'production PLANET_VISUAL_DEFAULTS change',
    'runtime LUT lookup',
    'frontend Meta schema change',
    'shader change',
    'monthly refit',
    'ordinary website entry point',
  ],
} as const

/** Baseline fixtures selected deterministically from the authoritative gzip in P41.1. */
export const P41_EMISSION_FIXTURE_ROWS = [
  'hue-low',
  'hue-high',
  'seed-low',
  'seed-high',
  'genres-min',
  'genres-max',
  'high-rating-low-votes',
] as const

export type P41EmissionFixtureRow = typeof P41_EMISSION_FIXTURE_ROWS[number]

export const P41_EMISSION_BLOOM_OFF = {
  enabled: false,
  strength: 0.01,
  radius: 1,
  threshold: 0,
} as const

/** P41.4-approved shaping as frozen in the current production visual SSOT. */
export const P41_EMISSION_FIXED_PROFILE = {
  lightness: PLANET_VISUAL_DEFAULTS.focus.lightness,
  chroma: PLANET_VISUAL_DEFAULTS.focus.chroma,
  keyLightIntensity: PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity,
  direction: [...PLANET_VISUAL_DEFAULTS.lighting.direction] as [number, number, number],
  flatShadingMix: PLANET_VISUAL_DEFAULTS.lighting.flatShadingMix,
  bloom: P41_EMISSION_BLOOM_OFF,
  p41_4_approved_inputs: {
    direction_candidate: 'backlight-east-v1',
    lightness_candidate: 'lightness-0.66',
    key_candidate: 'key-0.45',
    evidence_directory: 'data/runs/phase41/p41.4-fixed-shaping-key-v5-backlight-lightness-066-semantic-fixtures',
  },
} as const

export const P41_EMISSION_CURVE: FocusEmissionCurve = {
  ...PLANET_VISUAL_DEFAULTS.focus.emission,
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P41.5 emission evidence] ${message}`)
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

type StableJson = null | boolean | number | string | readonly StableJson[] | { readonly [key: string]: StableJson }

function stableJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'manifest values must be finite')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  assert(typeof value === 'object', 'manifest values must be JSON-compatible')
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}

function sha256(value: StableJson): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

export type P41MidrankCdfLutEvidenceManifest = {
  schemaVersion: 'p41.5-midrank-cdf-lut-evidence-v1'
  candidateId: typeof RATING_MIDRANK_CDF_LUT_MODEL_VERSION
  authoritativeData: typeof P41_EMISSION_AUTHORITATIVE_DATA
  movieCount: number
  gitCommit: string
  curve: RatingMidrankCdfLutProfile
  fixedProfile: typeof P41_EMISSION_FIXED_PROFILE
  allowedVariationFields: typeof P41_EMISSION_ALLOWED_VARIATION_FIELDS
  hashes: {
    authoritativeDataSha256: string
    curveSha256: string
    fixedProfileSha256: string
  }
}

export function createP41MidrankCdfLutEvidenceManifest(
  profile: RatingMidrankCdfLutProfile,
  gitCommit: string,
): P41MidrankCdfLutEvidenceManifest {
  assert(/^[a-f0-9]{7,40}$/i.test(gitCommit), 'Git commit must be a 7..40 character hexadecimal revision')
  const curve = validateRatingMidrankCdfLutProfile(profile)
  const fixedProfile = JSON.parse(JSON.stringify(P41_EMISSION_FIXED_PROFILE)) as typeof P41_EMISSION_FIXED_PROFILE
  const authoritativeData = { ...P41_EMISSION_AUTHORITATIVE_DATA }
  return {
    schemaVersion: 'p41.5-midrank-cdf-lut-evidence-v1',
    candidateId: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
    authoritativeData,
    movieCount: authoritativeData.movieCount,
    gitCommit,
    curve,
    fixedProfile,
    allowedVariationFields: [...P41_EMISSION_ALLOWED_VARIATION_FIELDS],
    hashes: {
      authoritativeDataSha256: sha256(authoritativeData),
      curveSha256: sha256(curve),
      fixedProfileSha256: sha256(fixedProfile),
    },
  }
}

export function serializeP41MidrankCdfLutEvidenceManifest(
  manifest: P41MidrankCdfLutEvidenceManifest,
): string {
  assertP41MidrankCdfLutEvidenceManifest(manifest)
  return `${stableJson(manifest)}\n`
}

export function assertP41MidrankCdfLutEvidenceManifest(manifest: P41MidrankCdfLutEvidenceManifest): void {
  assert(manifest.schemaVersion === 'p41.5-midrank-cdf-lut-evidence-v1', 'manifest schema version drifted')
  assert(manifest.candidateId === RATING_MIDRANK_CDF_LUT_MODEL_VERSION, 'manifest candidate model drifted')
  assert(equal(manifest.authoritativeData, P41_EMISSION_AUTHORITATIVE_DATA), 'manifest authoritative data drifted')
  assert(manifest.movieCount === P41_EMISSION_AUTHORITATIVE_DATA.movieCount, 'manifest movie count drifted')
  assert(/^[a-f0-9]{7,40}$/i.test(manifest.gitCommit), 'manifest Git commit must be a 7..40 character hexadecimal revision')
  assert(equal(manifest.allowedVariationFields, P41_EMISSION_ALLOWED_VARIATION_FIELDS), 'manifest allowed variations drifted')
  assertP41EmissionFixedProfile(manifest.fixedProfile)
  const curve = validateRatingMidrankCdfLutProfile(manifest.curve)
  assert(curve.modelVersion === RATING_MIDRANK_CDF_LUT_MODEL_VERSION, 'manifest curve model drifted')
  assert(curve.sampleStep === RATING_MIDRANK_CDF_LUT_SAMPLE_STEP, 'manifest LUT step drifted')
  assert(manifest.hashes.authoritativeDataSha256 === sha256(manifest.authoritativeData), 'manifest authoritative data hash drifted')
  assert(manifest.hashes.curveSha256 === sha256(curve), 'manifest curve hash drifted')
  assert(manifest.hashes.fixedProfileSha256 === sha256(manifest.fixedProfile), 'manifest fixed profile hash drifted')
}

export function assertP41EmissionFixedProfile(profile: typeof P41_EMISSION_FIXED_PROFILE): void {
  assert(equal(profile, P41_EMISSION_FIXED_PROFILE), 'fixed visual profile drifted')
  assert(profile.bloom.enabled === false, 'P41.5 evidence must render with Bloom OFF')
}

export function assertP41EmissionRatingOnlyVariation(
  baseline: Record<string, unknown>,
  candidate: Record<string, unknown>,
): void {
  assert('rating' in baseline && 'emission' in baseline, 'baseline row must declare rating and emission')
  assert('rating' in candidate && 'emission' in candidate, 'candidate row must declare rating and emission')
  const fields = new Set([...Object.keys(baseline), ...Object.keys(candidate)])
  for (const field of fields) {
    if ((P41_EMISSION_ALLOWED_VARIATION_FIELDS as readonly string[]).includes(field)) continue
    assert(equal(baseline[field], candidate[field]), `undeclared variation in ${field}`)
  }
}

export function assertP41EmissionEvidenceContract(): void {
  assert(equal(PHASE41_CONTROLLED_RATINGS, [4.0, 4.5, 5.5, 6.5, 7.5, 8.2, 9.5]), 'controlled rating columns drifted')
  assert(P41_EMISSION_FIXTURE_ROWS.length === new Set(P41_EMISSION_FIXTURE_ROWS).size, 'fixture rows must be unique')
  assert(P41_EMISSION_FIXTURE_ROWS.includes('high-rating-low-votes'), 'fixture rows must include the high-rating/low-votes anomaly')
  assert(P41_EMISSION_AUTHORITATIVE_DATA.relativePath === 'frontend/public/data/galaxy_data.json.gz', 'authoritative gzip path drifted')
  assert(P41_EMISSION_AUTHORITATIVE_DATA.sha256 === 'eb15d597479f4f46792c440ae6478ddade9ba1bd95cc623d0dd135e680c60cad', 'authoritative gzip hash drifted')
  assert(P41_EMISSION_AUTHORITATIVE_DATA.dataVersion === '2026.07.18.daily.113', 'authoritative data version drifted')
  assert(P41_EMISSION_AUTHORITATIVE_DATA.movieCount === 61531, 'authoritative movie count drifted')
  assert(P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE.status === 'candidate-no-go', 'anchored smoothstep must remain the candidate-no-go history')
  assert(P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE.modelVersion === FOCUS_EMISSION_MODEL_VERSION, 'historical baseline model drifted')
  assert(P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE.evidenceDirectory === P41_EMISSION_EVIDENCE_RELATIVE_DIRECTORY, 'historical baseline evidence directory drifted')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.status === 'contract-ready', 'CDF/LUT candidate contract must be ready')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.scope === 'diagnostic-only', 'CDF/LUT candidate must remain diagnostic-only')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.curveModelVersion === RATING_MIDRANK_CDF_LUT_MODEL_VERSION, 'CDF/LUT candidate model drifted')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.ratingMin === 0 && P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.ratingMax === 10, 'CDF/LUT rating domain must remain 0..10')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.lut.sampleStep === 0.05 && P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.lut.sampleCount === 201, 'CDF/LUT grid must remain 201 samples at 0.05')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.intensityMin === 0.005 && P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.intensityMax === 0.65, 'CDF/LUT intensity range must remain 0.005/0.65')
  assert(equal(P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE.allowedVariationFields, P41_EMISSION_ALLOWED_VARIATION_FIELDS), 'historical allowed variations drifted')
  assert(equal(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.allowedVariationFields, P41_EMISSION_ALLOWED_VARIATION_FIELDS), 'CDF/LUT allowed variations drifted')
  assert(equal(P41_EMISSION_ALLOWED_VARIATION_FIELDS, ['rating', 'emission']), 'only rating and emission may vary between candidates')
  assert(P41_EMISSION_FIXED_PROFILE.lightness === 0.66, 'P41.4-approved Lightness must remain 0.66')
  assert(P41_EMISSION_FIXED_PROFILE.keyLightIntensity === 0.45, 'P41.4-approved Key must remain 0.45')
  assert(P41_EMISSION_FIXED_PROFILE.flatShadingMix === 0.8, 'P41.4-approved flatShadingMix must remain 0.8')
  assert(P41_EMISSION_FIXED_PROFILE.bloom.enabled === false, 'P41.5 evidence must render with Bloom OFF')
  assert(equal(P41_EMISSION_FIXED_PROFILE.direction, [0.700665949127905, 0.4003805423588029, 0.5905612999792342]), 'P41.4-approved direction drifted')
  assertP41EmissionCurveInvariants(P41_EMISSION_CURVE)
}

/** Machine-only curve checks; visual review remains explicitly pending. */
export function assertP41EmissionCurveInvariants(curve: FocusEmissionCurve): void {
  const validated = validateFocusEmissionCurve(curve)
  assert(validated.modelVersion === FOCUS_EMISSION_MODEL_VERSION, 'production curve model must be anchored smoothstep v1')
  assert(validated.ratingLowAnchor === 4.5 && validated.ratingHighAnchor === 8.2, 'production curve anchors must be 4.5/8.2')
  assert(validated.intensityMin === 0.005 && validated.intensityMax === 0.65, 'production curve intensity range must be 0.005/0.65')

  const atLow = focusEmissionIntensityFromVoteAverage(validated.ratingLowAnchor, validated)
  const atHigh = focusEmissionIntensityFromVoteAverage(validated.ratingHighAnchor, validated)
  assert(atLow === validated.intensityMin, 'low anchor must map exactly to intensityMin')
  assert(atHigh === validated.intensityMax, 'high anchor must map exactly to intensityMax')
  assert(focusEmissionIntensityFromVoteAverage(-1, validated) === validated.intensityMin, 'ratings below the low anchor must clamp')
  assert(focusEmissionIntensityFromVoteAverage(11, validated) === validated.intensityMax, 'ratings above the high anchor must clamp')

  const sampled = Array.from({ length: 101 }, (_, index) => 4 + index * 0.06)
  const emissions = sampled.map((rating) => focusEmissionIntensityFromVoteAverage(rating, validated))
  for (let index = 1; index < emissions.length; index += 1) {
    assert(emissions[index]! >= emissions[index - 1]!, `curve is not monotonic at sample ${index}`)
  }
  const dense = [4.5, 5.5, 6.5, 7.5].map((rating) => focusEmissionIntensityFromVoteAverage(rating, validated))
  for (let index = 1; index < dense.length; index += 1) {
    assert(dense[index]! > dense[index - 1]!, `dense rating range is not distinguishable at ${index}`)
  }
}

/** Removes the two declared varying fields before a same-row profile comparison. */
export function profileWithoutRatingAndEmission(profile: Record<string, unknown>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>
  delete copy.rating
  delete copy.emission
  return copy
}