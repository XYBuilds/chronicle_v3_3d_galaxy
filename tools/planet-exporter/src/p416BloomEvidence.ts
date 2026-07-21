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

export const P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/p41.6-bloom-integration' as const
export const P416_BLOOM_CANDIDATE_ID = 'p41.6-approved-cdf-lut-bloom-candidate-v1' as const
export const P416_BLOOM_V2_THRESHOLD_EVIDENCE_RELATIVE_DIRECTORY = 'data/runs/phase41/p41.6-bloom-integration-v2-threshold' as const
export const P416_BLOOM_V2_THRESHOLD_CANDIDATE_ID = 'p41.6-cdf-lut-thresholded-bloom-candidate-v2' as const
export const P416_BLOOM_MATRIX_COLUMNS = ['off', 'on'] as const
export type P416BloomMode = typeof P416_BLOOM_MATRIX_COLUMNS[number]

export const P416_BLOOM_OFF = {
  enabled: false,
  strength: 0.01,
  radius: 1,
  threshold: 0,
} as const

export const P416_BLOOM_ON = {
  enabled: true,
  strength: 0.01,
  radius: 1,
  threshold: 0,
} as const

export type P416BloomCandidate = {
  candidateId: string
  schemaVersion: string
  evidenceDirectory: string
  bloomOff: P416BloomParams
  bloomOn: P416BloomParams
}

export const P416_BLOOM_V1_CANDIDATE: P416BloomCandidate = {
  candidateId: P416_BLOOM_CANDIDATE_ID,
  schemaVersion: 'p41.6-bloom-integration-validation-v1',
  evidenceDirectory: P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY,
  bloomOff: P416_BLOOM_OFF,
  bloomOn: P416_BLOOM_ON,
}

export const P416_BLOOM_V2_THRESHOLD_CANDIDATE: P416BloomCandidate = {
  candidateId: P416_BLOOM_V2_THRESHOLD_CANDIDATE_ID,
  schemaVersion: 'p41.6-bloom-integration-validation-v2',
  evidenceDirectory: P416_BLOOM_V2_THRESHOLD_EVIDENCE_RELATIVE_DIRECTORY,
  bloomOff: P416_BLOOM_OFF,
  bloomOn: { enabled: true, strength: 0.025, radius: 0.35, threshold: 0.2 },
}

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

export type P416BloomParams = { enabled: boolean; strength: number; radius: number; threshold: number }

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

export function measureP416BloomPair(off: RgbaImage, on: RgbaImage): P416BloomPixelStats {
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
  assert(P416_BLOOM_CANDIDATE_ID === 'p41.6-approved-cdf-lut-bloom-candidate-v1', 'candidate id drifted')
  assert(P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY === 'data/runs/phase41/p41.6-bloom-integration', 'evidence directory drifted')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.candidateId === 'rating-midrank-cdf-lut-v1', 'P41.6 must start from approved CDF/LUT profile')
  assert(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.scope === 'diagnostic-only', 'CDF/LUT profile must remain diagnostic-only')
  assert(P41_EMISSION_FIXTURE_ROWS.length * P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS.length === 77, 'P41.6 matrix shape drifted')
  assert(validateP416BloomParams(P416_BLOOM_OFF, 'Bloom OFF').enabled === false, 'OFF candidate must be disabled')
  assert(validateP416BloomParams(P416_BLOOM_ON, 'Bloom ON').enabled === true, 'ON candidate must be enabled')
  assert(P416_BLOOM_V1_CANDIDATE.evidenceDirectory === P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY, 'v1 evidence directory drifted')
  assert(P416_BLOOM_V2_THRESHOLD_CANDIDATE.evidenceDirectory === P416_BLOOM_V2_THRESHOLD_EVIDENCE_RELATIVE_DIRECTORY, 'v2 evidence directory drifted')
  assert(P416_BLOOM_V1_CANDIDATE.candidateId !== P416_BLOOM_V2_THRESHOLD_CANDIDATE.candidateId, 'v1 and v2 candidates must not share an id')
  const v2 = validateP416BloomParams(P416_BLOOM_V2_THRESHOLD_CANDIDATE.bloomOn, 'v2 threshold Bloom ON')
  assert(v2.enabled && v2.threshold > 0, 'v2 candidate must use a positive threshold')
}