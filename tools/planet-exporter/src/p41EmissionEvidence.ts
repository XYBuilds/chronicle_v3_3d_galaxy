import { createHash } from 'node:crypto'

import {
  FOCUS_EMISSION_MODEL_VERSION,
  RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT,
  RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
  focusEmissionIntensityFromProfile,
  validateRatingMidrankCdfLutProfile,
  type FocusEmissionCurve,
  type FocusEmissionProfile,
  type RatingMidrankCdfLutProfile,
} from '../../../frontend/src/three/focusEmission.js'
import { PLANET_VISUAL_DEFAULTS } from '../../../frontend/src/three/planetVisualDefaults.js'
import {
  PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT,
  PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
} from '../../../frontend/src/three/productionFocusEmissionProfile.js'

import { PHASE41_CONTROLLED_RATINGS, AUTHORITATIVE_GZIP_RELATIVE_PATH } from './phase41Baseline.js'

export const P41_EMISSION_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/p41.5-emission-curve-bloom-off' as const
export const P41_MIDRANK_CDF_LUT_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/p41.5-midrank-cdf-lut-bloom-off' as const

/** Dense diagnostic-only matrix; historical anchored baseline columns remain unchanged. */
export const P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.2, 9.5] as const

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

export const P41_EMISSION_HISTORICAL_CURVE: FocusEmissionCurve = {
  modelVersion: FOCUS_EMISSION_MODEL_VERSION,
  ratingLowAnchor: 4.5,
  ratingHighAnchor: 8.2,
  intensityMin: 0.005,
  intensityMax: 0.65,
}

/**
 * Historical P41.5 CDF/LUT diagnostic provenance. The marker-bound override used to
 * create this evidence remains isolated from normal startup; the same approved LUT
 * is now the production profile declared by P41_PRODUCTION_EMISSION_PROFILE.
 */
export const P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE = {
  candidateId: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  status: 'historical-evidence-promoted-to-production',
  scope: 'p41.5-diagnostic-provenance',
  productionProfileId: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  diagnosticOverride: {
    requiredMarker: 'phase41-visual-diagnostic-v1',
    productionDefaults: 'isolated',
  },
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

/** P41.8 production profile: frozen approved LUT, embedded for normal website/exporter startup. */
export const P41_PRODUCTION_EMISSION_PROFILE = PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE

export const P41_EMISSION_CURVE: FocusEmissionProfile = {
  ...PLANET_VISUAL_DEFAULTS.focus.emission,
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P41.5 emission evidence] ${message}`)
}

function equal(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right)
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
  assert(equal(P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS, [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.2, 9.5]), 'CDF/LUT controlled rating columns drifted')
  assert(P41_EMISSION_FIXTURE_ROWS.length === new Set(P41_EMISSION_FIXTURE_ROWS).size, 'fixture rows must be unique')
  assert(P41_EMISSION_FIXTURE_ROWS.includes('high-rating-low-votes'), 'fixture rows must include the high-rating/low-votes anomaly')
  assert(P41_EMISSION_AUTHORITATIVE_DATA.relativePath === 'frontend/public/data/galaxy_data.json.gz', 'authoritative gzip path drifted')
  assert(P41_EMISSION_AUTHORITATIVE_DATA.sha256 === 'eb15d597479f4f46792c440ae6478ddade9ba1bd95cc623d0dd135e680c60cad', 'authoritative gzip hash drifted')
  assert(P41_EMISSION_AUTHORITATIVE_DATA.dataVersion === '2026.07.18.daily.113', 'authoritative data version drifted')
  assert(P41_EMISSION_AUTHORITATIVE_DATA.movieCount === 61531, 'authoritative movie count drifted')
  assert(P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE.status === 'candidate-no-go', 'anchored smoothstep must remain the candidate-no-go history')
  assert(P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE.modelVersion === FOCUS_EMISSION_MODEL_VERSION, 'historical baseline model drifted')
  assert(P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE.evidenceDirectory === P41_EMISSION_EVIDENCE_RELATIVE_DIRECTORY, 'historical baseline evidence directory drifted')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.status === 'historical-evidence-promoted-to-production', 'CDF/LUT historical evidence must record its production promotion')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.scope === 'p41.5-diagnostic-provenance', 'CDF/LUT historical provenance scope drifted')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.productionProfileId === RATING_MIDRANK_CDF_LUT_MODEL_VERSION, 'CDF/LUT production profile link drifted')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.diagnosticOverride.requiredMarker === 'phase41-visual-diagnostic-v1', 'historical diagnostic override marker drifted')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.diagnosticOverride.productionDefaults === 'isolated', 'historical diagnostic override must stay isolated from production defaults')
  assert(P41_PRODUCTION_EMISSION_PROFILE.modelVersion === RATING_MIDRANK_CDF_LUT_MODEL_VERSION, 'production profile model drifted')
  assert(equal(P41_PRODUCTION_EMISSION_PROFILE, PLANET_VISUAL_DEFAULTS.focus.emission), 'production SSOT must be shared by website and exporter')
  assert(PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT.authoritativeData.sha256 === P41_EMISSION_AUTHORITATIVE_DATA.sha256, 'production profile source hash drifted')
  assert(PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT.authoritativeData.dataVersion === P41_EMISSION_AUTHORITATIVE_DATA.dataVersion, 'production profile data version drifted')
  assert(PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT.authoritativeData.movieCount === P41_EMISSION_AUTHORITATIVE_DATA.movieCount, 'production profile movie count drifted')
  assert(PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT.interpolation === 'linear', 'production LUT interpolation drifted')
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

/** Machine-only checks for the embedded production LUT; visual review remains explicitly pending. */
export function assertP41EmissionCurveInvariants(curve: FocusEmissionProfile): void {
  assert(curve.modelVersion === RATING_MIDRANK_CDF_LUT_MODEL_VERSION, 'production curve model must be rating-midrank-cdf-lut-v1')
  const validated = validateRatingMidrankCdfLutProfile(curve)
  assert(equal(validated, PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE), 'production LUT samples drifted from the approved profile')
  assert(validated.samples.length === 201, 'production LUT must have 201 samples')
  assert(sha256(validated) === PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT.curveSha256, 'production LUT hash drifted')

  const atLow = focusEmissionIntensityFromProfile(validated.ratingMin, validated)
  const atHigh = focusEmissionIntensityFromProfile(validated.ratingMax, validated)
  assert(atLow === validated.intensityMin, 'low endpoint must map exactly to intensityMin')
  assert(atHigh === validated.intensityMax, 'high endpoint must map exactly to intensityMax')
  assert(focusEmissionIntensityFromProfile(-1, validated) === validated.intensityMin, 'ratings below the LUT domain must clamp')
  assert(focusEmissionIntensityFromProfile(11, validated) === validated.intensityMax, 'ratings above the LUT domain must clamp')

  const sampled = Array.from({ length: 101 }, (_, index) => index * 0.1)
  const emissions = sampled.map((rating) => focusEmissionIntensityFromProfile(rating, validated))
  for (let index = 1; index < emissions.length; index += 1) {
    assert(emissions[index]! >= emissions[index - 1]!, `production LUT is not monotonic at sample ${index}`)
  }
  const dense = [4.5, 5.5, 6.5, 7.5].map((rating) => focusEmissionIntensityFromProfile(rating, validated))
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