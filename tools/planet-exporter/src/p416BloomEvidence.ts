import { createHash } from 'node:crypto'

import {
  PHASE41_DIAGNOSTIC_MARKER,
  type Phase41DiagnosticOverride,
} from './phase41Diagnostic.js'
import {
  P41_EMISSION_FIXED_PROFILE,
  P41_EMISSION_FIXTURE_ROWS,
  P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE,
  P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS,
} from './p41EmissionEvidence.js'
import { assertPureBloomCore, type CoreBloomStats, type RgbaImage } from './bloomProof.js'

export const P416_BLOOM_V1_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/p41.6-bloom-integration' as const
export const P416_BLOOM_V1_CANDIDATE_ID = 'p41.6-approved-cdf-lut-bloom-candidate-v1' as const
export const P416_BLOOM_V2_THRESHOLD_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/p41.6-bloom-integration-v2-threshold' as const
export const P416_BLOOM_V2_THRESHOLD_CANDIDATE_ID = 'p41.6-cdf-lut-thresholded-bloom-candidate-v2' as const
export const P416_BLOOM_V3_CONTRAST_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/p41.6-bloom-integration-v3-contrast' as const
export const P416_BLOOM_V3_CONTRAST_CANDIDATE_ID = 'p41.6-cdf-lut-highlight-contrast-bloom-candidate-v3' as const
export const P416_BLOOM_V4_SAFE_STRENGTH_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/p41.6-bloom-integration-v4-safe-strength' as const
export const P416_BLOOM_V4_SAFE_STRENGTH_CANDIDATE_ID = 'p41.6-cdf-lut-safe-strength-bloom-candidate-v4' as const
export const P416_BLOOM_V5_HIGH_STRENGTH_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/p41.6-bloom-integration-v5-high-strength' as const
export const P416_BLOOM_V5_HIGH_STRENGTH_CANDIDATE_ID = 'p41.6-cdf-lut-high-strength-bloom-candidate-v5' as const
export const P416_BLOOM_MATRIX_COLUMNS = ['off', 'on'] as const
export type P416BloomMode = typeof P416_BLOOM_MATRIX_COLUMNS[number]
export type P416BloomParams = { enabled: boolean; strength: number; radius: number; threshold: number }

const P416_BLOOM_V1_OFF = {
  enabled: false,
  strength: 0.01,
  radius: 1,
  threshold: 0,
} as const

const P416_BLOOM_V1_ON = {
  enabled: true,
  strength: 0.01,
  radius: 1,
  threshold: 0,
} as const

export type P416BloomCandidate = {
  candidateId: string
  candidateNature: string
  schemaVersion: string
  evidenceDirectory: string
  sourceProfileId: 'rating-midrank-cdf-lut-v1'
  bloomOff: P416BloomParams
  bloomOn: P416BloomParams
}

export const P416_BLOOM_V1_CANDIDATE: P416BloomCandidate = {
  candidateId: P416_BLOOM_V1_CANDIDATE_ID,
  candidateNature: 'diagnostic-bloom-candidate',
  schemaVersion: 'p41.6-bloom-integration-validation-v1',
  evidenceDirectory: P416_BLOOM_V1_EVIDENCE_RELATIVE_DIRECTORY,
  sourceProfileId: 'rating-midrank-cdf-lut-v1',
  bloomOff: P416_BLOOM_V1_OFF,
  bloomOn: P416_BLOOM_V1_ON,
}

export const P416_BLOOM_V2_THRESHOLD_CANDIDATE: P416BloomCandidate = {
  candidateId: P416_BLOOM_V2_THRESHOLD_CANDIDATE_ID,
  candidateNature: 'diagnostic-thresholded-bloom-candidate',
  schemaVersion: 'p41.6-bloom-integration-validation-v2',
  evidenceDirectory: P416_BLOOM_V2_THRESHOLD_EVIDENCE_RELATIVE_DIRECTORY,
  sourceProfileId: 'rating-midrank-cdf-lut-v1',
  bloomOff: P416_BLOOM_V1_OFF,
  bloomOn: { enabled: true, strength: 0.025, radius: 0.35, threshold: 0.2 },
}

/** Raised threshold and tighter radius keep bloom highlight-selective. */
export const P416_BLOOM_V3_CONTRAST_CANDIDATE: P416BloomCandidate = {
  candidateId: P416_BLOOM_V3_CONTRAST_CANDIDATE_ID,
  candidateNature: 'diagnostic-highlight-contrast-bloom-candidate',
  schemaVersion: 'p41.6-bloom-integration-validation-v3',
  evidenceDirectory: P416_BLOOM_V3_CONTRAST_EVIDENCE_RELATIVE_DIRECTORY,
  sourceProfileId: 'rating-midrank-cdf-lut-v1',
  bloomOff: P416_BLOOM_V1_OFF,
  bloomOn: { enabled: true, strength: 0.03, radius: 0.2, threshold: 0.3 },
}

/** Controlled v2-strength increase for human comparison; it makes no non-overexposure ceiling claim. */
export const P416_BLOOM_V4_SAFE_STRENGTH_CANDIDATE: P416BloomCandidate = {
  candidateId: P416_BLOOM_V4_SAFE_STRENGTH_CANDIDATE_ID,
  candidateNature: 'diagnostic-strength-comparison-pending-human-review',
  schemaVersion: 'p41.6-bloom-integration-validation-v4-safe-strength',
  evidenceDirectory: P416_BLOOM_V4_SAFE_STRENGTH_EVIDENCE_RELATIVE_DIRECTORY,
  sourceProfileId: 'rating-midrank-cdf-lut-v1',
  bloomOff: P416_BLOOM_V1_OFF,
  bloomOn: { enabled: true, strength: 0.05, radius: 0.35, threshold: 0.2 },
}

/** Diagnostic high-strength control: overexposure is permitted and requires human confirmation. */
export const P416_BLOOM_V5_HIGH_STRENGTH_CANDIDATE: P416BloomCandidate = {
  candidateId: P416_BLOOM_V5_HIGH_STRENGTH_CANDIDATE_ID,
  candidateNature: 'diagnostic-high-strength-overexposure-permitted-pending-human-review',
  schemaVersion: 'p41.6-bloom-integration-validation-v5-high-strength',
  evidenceDirectory: P416_BLOOM_V5_HIGH_STRENGTH_EVIDENCE_RELATIVE_DIRECTORY,
  sourceProfileId: 'rating-midrank-cdf-lut-v1',
  bloomOff: P416_BLOOM_V1_OFF,
  bloomOn: { enabled: true, strength: 0.12, radius: 0.35, threshold: 0.2 },
}

export const P416_BLOOM_CANDIDATES = {
  v1: P416_BLOOM_V1_CANDIDATE,
  'v2-threshold': P416_BLOOM_V2_THRESHOLD_CANDIDATE,
  'v3-contrast': P416_BLOOM_V3_CONTRAST_CANDIDATE,
  'v4-safe-strength': P416_BLOOM_V4_SAFE_STRENGTH_CANDIDATE,
  'v5-high-strength': P416_BLOOM_V5_HIGH_STRENGTH_CANDIDATE,
} as const

/** Backward-compatible defaults for the historical v1 reproduction command. */
export const P416_BLOOM_CANDIDATE = P416_BLOOM_V1_CANDIDATE
export const P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY = P416_BLOOM_V1_EVIDENCE_RELATIVE_DIRECTORY
export const P416_BLOOM_CANDIDATE_ID = P416_BLOOM_V1_CANDIDATE_ID
export const P416_BLOOM_OFF = P416_BLOOM_V1_CANDIDATE.bloomOff
export const P416_BLOOM_ON = P416_BLOOM_V1_CANDIDATE.bloomOn

export type P416BloomPixelStats = {
  width: number
  height: number
  off_saturated_pixels: number
  off_saturated_ratio: number
  on_saturated_pixels: number
  on_saturated_ratio: number
  halo_bounds: { x_min: number; x_max: number; y_min: number; y_max: number; pixels: number; ratio: number } | null
  core: CoreBloomStats
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P41.6 Bloom evidence] ${message}`)
}

function stable(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'hash inputs must be finite')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  assert(typeof value === 'object', 'hash inputs must be JSON-compatible')
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`
}

export function p416Sha256(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex')
}

export function validateP416BloomParams(params: unknown, label: string): P416BloomParams {
  assert(params !== null && typeof params === 'object' && !Array.isArray(params), `${label} must be an object`)
  const value = params as Record<string, unknown>
  assert(Object.keys(value).length === 4 && ['enabled', 'strength', 'radius', 'threshold'].every((key) => key in value), `${label} must declare exactly enabled/strength/radius/threshold`)
  assert(typeof value.enabled === 'boolean', `${label}.enabled must be boolean`)
  const strength = value.strength
  const radius = value.radius
  const threshold = value.threshold
  const finiteNumber = (entry: unknown, key: string): number => {
    assert(typeof entry === 'number' && Number.isFinite(entry), `${label}.${key} must be finite`)
    return entry as number
  }
  const numericStrength = finiteNumber(strength, 'strength')
  const numericRadius = finiteNumber(radius, 'radius')
  const numericThreshold = finiteNumber(threshold, 'threshold')
  assert(numericStrength >= 0, `${label}.strength must be >= 0`)
  assert(numericRadius >= 0 && numericRadius <= 1, `${label}.radius must be in [0, 1]`)
  assert(numericThreshold >= 0, `${label}.threshold must be >= 0`)
  return { enabled: value.enabled, strength: numericStrength, radius: numericRadius, threshold: numericThreshold }
}

export function createP416BloomOverride(
  bloom: P416BloomParams,
  emissionCurve: Phase41DiagnosticOverride['emissionCurve'],
): Phase41DiagnosticOverride {
  const validated = validateP416BloomParams(bloom, 'bloom candidate')
  assert(emissionCurve !== undefined, 'P41.6 requires an explicit approved CDF/LUT curve')
  return {
    diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
    emissionCurve,
    lightness: P41_EMISSION_FIXED_PROFILE.lightness,
    keyLightIntensity: P41_EMISSION_FIXED_PROFILE.keyLightIntensity,
    direction: [...P41_EMISSION_FIXED_PROFILE.direction],
    bloom: validated,
  }
}

function saturatedPixels(image: RgbaImage): number {
  let total = 0
  for (let index = 0; index < image.data.length; index += 4) {
    if (image.data[index + 3]! > 0 && (image.data[index]! >= 250 || image.data[index + 1]! >= 250 || image.data[index + 2]! >= 250)) total += 1
  }
  return total
}

function luma(image: RgbaImage, index: number): number {
  return 0.2126 * image.data[index]! + 0.7152 * image.data[index + 1]! + 0.0722 * image.data[index + 2]!
}

function haloBounds(off: RgbaImage, on: RgbaImage): P416BloomPixelStats['halo_bounds'] {
  let xMin = off.width
  let xMax = -1
  let yMin = off.height
  let yMax = -1
  let pixels = 0
  for (let y = 0; y < off.height; y += 1) {
    for (let x = 0; x < off.width; x += 1) {
      const index = (y * off.width + x) * 4
      if (luma(on, index) - luma(off, index) <= 1) continue
      pixels += 1
      xMin = Math.min(xMin, x)
      xMax = Math.max(xMax, x)
      yMin = Math.min(yMin, y)
      yMax = Math.max(yMax, y)
    }
  }
  return pixels === 0 ? null : { x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax, pixels, ratio: pixels / (off.width * off.height) }
}

export function measureP416BloomPair(
  off: RgbaImage,
  on: RgbaImage,
): P416BloomPixelStats {
  assert(off.width === on.width && off.height === on.height && off.data.length === on.data.length, 'OFF/ON images must share dimensions and channels')
  assert(off.width > 0 && off.height > 0 && off.data.length === off.width * off.height * 4, 'image matrix is invalid')
  const offSaturated = saturatedPixels(off)
  const onSaturated = saturatedPixels(on)
  const total = off.width * off.height
  const core = assertPureBloomCore(off, on)
  const halo = haloBounds(off, on)
  assert(halo !== null && halo.pixels > 0, 'Bloom ON must produce a measurable halo delta')
  return {
    width: off.width,
    height: off.height,
    off_saturated_pixels: offSaturated,
    off_saturated_ratio: offSaturated / total,
    on_saturated_pixels: onSaturated,
    on_saturated_ratio: onSaturated / total,
    halo_bounds: halo,
    core,
  }
}

export function assertP416PairOnlyBloomVariation(off: Record<string, unknown>, on: Record<string, unknown>): void {
  const required = ['authoritative_data', 'fixture', 'movie_id', 'camera', 'seed', 'rotation', 'lightness', 'key_light', 'direction', 'flat_shading_mix', 'rating', 'emission', 'curve']
  for (const key of required) assert(key in off && key in on, `paired profiles must declare ${key}`)
  for (const key of required) assert(stable(off[key]) === stable(on[key]), `OFF/ON pair changed undeclared ${key}`)
  assert(stable(off.bloom) !== stable(on.bloom), 'OFF/ON pair must differ by declared bloom')
}

export function assertP416EvidenceContract(): void {
  assert(P416_BLOOM_CANDIDATE === P416_BLOOM_V1_CANDIDATE, 'unqualified candidate must preserve v1 reproduction')
  assert(P416_BLOOM_CANDIDATE_ID === P416_BLOOM_V1_CANDIDATE_ID, 'v1 candidate id drifted')
  assert(P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY === P416_BLOOM_V1_EVIDENCE_RELATIVE_DIRECTORY, 'v1 evidence directory drifted')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.candidateId === 'rating-midrank-cdf-lut-v1', 'P41.6 must start from approved CDF/LUT profile')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.status === 'historical-evidence-promoted-to-production', 'P41.6 must retain the P41.5 CDF/LUT promotion record')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.scope === 'p41.5-diagnostic-provenance', 'P41.6 must keep P41.5 diagnostic provenance separate from the production profile')
  assert(P41_EMISSION_FIXTURE_ROWS.length * P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS.length === 77, 'P41.6 matrix shape drifted')
  const candidates = Object.values(P416_BLOOM_CANDIDATES)
  assert(candidates.length === 5, 'candidate registry must retain v1, v2, v3, v4, and v5')
  assert(new Set(candidates.map((candidate) => candidate.candidateId)).size === candidates.length, 'candidate ids must be unique')
  assert(new Set(candidates.map((candidate) => candidate.evidenceDirectory)).size === candidates.length, 'candidate evidence directories must be unique')
  assert(new Set(candidates.map((candidate) => candidate.schemaVersion)).size === candidates.length, 'candidate schemas must be unique')
  assert(candidates.every((candidate) => candidate.candidateNature.startsWith('diagnostic-')), 'candidates must remain diagnostic-only')
  for (const candidate of candidates) {
    assert(candidate.sourceProfileId === 'rating-midrank-cdf-lut-v1', `${candidate.candidateId} source profile drifted`)
    assert(validateP416BloomParams(candidate.bloomOff, `${candidate.candidateId} Bloom OFF`).enabled === false, `${candidate.candidateId} OFF candidate must be disabled`)
    assert(validateP416BloomParams(candidate.bloomOn, `${candidate.candidateId} Bloom ON`).enabled === true, `${candidate.candidateId} ON candidate must be enabled`)
  }
  const v2 = validateP416BloomParams(P416_BLOOM_V2_THRESHOLD_CANDIDATE.bloomOn, 'v2 threshold Bloom ON')
  const v3 = validateP416BloomParams(P416_BLOOM_V3_CONTRAST_CANDIDATE.bloomOn, 'v3 contrast Bloom ON')
  const v4 = validateP416BloomParams(P416_BLOOM_V4_SAFE_STRENGTH_CANDIDATE.bloomOn, 'v4 safe-strength Bloom ON')
  const v5 = validateP416BloomParams(P416_BLOOM_V5_HIGH_STRENGTH_CANDIDATE.bloomOn, 'v5 high-strength Bloom ON')
  assert(v2.enabled && v2.threshold === 0.2, 'v2 candidate threshold drifted')
  assert(v3.enabled && v3.threshold > v2.threshold, 'v3 threshold must exceed v2')
  assert(v3.strength > v2.strength && v3.radius < v2.radius, 'v3 must use stronger, tighter highlight bloom')
  for (const [label, bloom] of [['v4', v4], ['v5', v5]] as const) {
    assert(bloom.enabled === v2.enabled && bloom.radius === v2.radius && bloom.threshold === v2.threshold, `${label} must change only strength from v2`)
  }
  assert(v4.strength === 0.05 && v4.strength > v2.strength, 'v4 safe-strength must be the specified human-reviewed comparison')
  assert(v5.strength === 0.12 && v5.strength > v4.strength, 'v5 high-strength must be the specified overexposure-permitted comparison')
  assert(P416_BLOOM_V4_SAFE_STRENGTH_CANDIDATE.candidateNature === 'diagnostic-strength-comparison-pending-human-review', 'v4 must remain a human-reviewed diagnostic comparison')
  assert(P416_BLOOM_V5_HIGH_STRENGTH_CANDIDATE.candidateNature === 'diagnostic-high-strength-overexposure-permitted-pending-human-review', 'v5 must remain an overexposure-permitted human-reviewed diagnostic control')
}