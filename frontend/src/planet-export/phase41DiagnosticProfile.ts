import {
  focusEmissionIntensityFromProfile,
  validateFocusEmissionCurve,
  validateRatingMidrankCdfLutProfile,
  type FocusEmissionProfile,
} from '@/three/focusEmission'
import { validatePerlinBloomParams, type PerlinBloomParams } from '@/three/perlinBloomContract'
import { PLANET_VISUAL_DEFAULTS, planetVisualConfigHashInput, productionPlanetBloomParams } from '@/three/planetVisualDefaults'

export const PHASE41_DIAGNOSTIC_MARKER = 'phase41-visual-diagnostic-v1' as const

export type Phase41EmissionCurve = FocusEmissionProfile

export type Phase41DiagnosticOverride = {
  diagnostic_only: typeof PHASE41_DIAGNOSTIC_MARKER
  emissionCurve?: Phase41EmissionCurve
  lightness?: number
  keyLightIntensity?: number
  direction?: [number, number, number]
  bloom?: PerlinBloomParams
}

export type ResolvedPhase41VisualProfile = {
  curve: Phase41EmissionCurve
  lightness: number
  chroma: number
  keyLightIntensity: number
  direction: [number, number, number]
  flatShadingMix: typeof PLANET_VISUAL_DEFAULTS.lighting.flatShadingMix
  bloom: PerlinBloomParams
  productionSource: 'PLANET_VISUAL_DEFAULTS'
  productionVisualConfigInput: string
  resolvedVisualConfigInput: string
  overrideProvenance: 'none' | 'phase41-diagnostic-override'
}

export type Phase41RenderOverride = Pick<ResolvedPhase41VisualProfile, 'curve' | 'lightness' | 'keyLightIntensity' | 'direction' | 'bloom'>

const overrideKeys = new Set(['diagnostic_only', 'emissionCurve', 'lightness', 'keyLightIntensity', 'direction', 'bloom'])

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error(`[Phase41 diagnostic] ${label} must be an object`)
  return value as Record<string, unknown>
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`[Phase41 diagnostic] ${label} must be a finite number`)
  return value
}

function nonNegative(value: unknown, label: string): number {
  const result = finite(value, label)
  if (result < 0) throw new Error(`[Phase41 diagnostic] ${label} must be >= 0`)
  return result
}

function unit(value: unknown, label: string): number {
  const result = finite(value, label)
  if (result < 0 || result > 1) throw new Error(`[Phase41 diagnostic] ${label} must be in [0, 1]`)
  return result
}

function exactKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`[Phase41 diagnostic] ${label} has unknown field ${key}`)
  }
}

function vector(value: unknown, label: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`[Phase41 diagnostic] ${label} must be a 3-vector`)
  const result: [number, number, number] = [finite(value[0], `${label}[0]`), finite(value[1], `${label}[1]`), finite(value[2], `${label}[2]`)]
  const magnitude = Math.hypot(...result)
  if (magnitude === 0) throw new Error(`[Phase41 diagnostic] ${label} must not be a zero vector`)
  return [result[0] / magnitude, result[1] / magnitude, result[2] / magnitude]
}

function curve(value: unknown, label: string): Phase41EmissionCurve {
  const record = object(value, label)
  if (record.modelVersion === 'rating-midrank-cdf-lut-v1') {
    exactKeys(record, new Set(['modelVersion', 'ratingMin', 'ratingMax', 'sampleStep', 'samples', 'intensityMin', 'intensityMax']), label)
    if (!Array.isArray(record.samples)) throw new Error(`[Phase41 diagnostic] ${label}.samples must be an array`)
    try {
      return validateRatingMidrankCdfLutProfile({
        modelVersion: record.modelVersion,
        ratingMin: finite(record.ratingMin, `${label}.ratingMin`),
        ratingMax: finite(record.ratingMax, `${label}.ratingMax`),
        sampleStep: finite(record.sampleStep, `${label}.sampleStep`),
        samples: record.samples.map((sample, index) => finite(sample, `${label}.samples[${index}]`)),
        intensityMin: nonNegative(record.intensityMin, `${label}.intensityMin`),
        intensityMax: nonNegative(record.intensityMax, `${label}.intensityMax`),
      })
    } catch (error) {
      throw new Error(`[Phase41 diagnostic] ${label} is invalid: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  exactKeys(record, new Set(['modelVersion', 'ratingLowAnchor', 'ratingHighAnchor', 'intensityMin', 'intensityMax']), label)
  if (record.modelVersion !== 'vote-average-anchored-smoothstep-v1') {
    throw new Error(`[Phase41 diagnostic] ${label}.modelVersion is unsupported`)
  }
  try {
    return validateFocusEmissionCurve({
      modelVersion: record.modelVersion,
      ratingLowAnchor: finite(record.ratingLowAnchor, `${label}.ratingLowAnchor`),
      ratingHighAnchor: finite(record.ratingHighAnchor, `${label}.ratingHighAnchor`),
      intensityMin: nonNegative(record.intensityMin, `${label}.intensityMin`),
      intensityMax: nonNegative(record.intensityMax, `${label}.intensityMax`),
    })
  } catch (error) {
    throw new Error(`[Phase41 diagnostic] ${label} is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function bloom(value: unknown): PerlinBloomParams {
  const record = object(value, 'bloom')
  exactKeys(record, new Set(['enabled', 'strength', 'radius', 'threshold']), 'bloom')
  if (typeof record.enabled !== 'boolean') throw new Error('[Phase41 diagnostic] bloom.enabled must be boolean')
  return validatePerlinBloomParams({
    enabled: record.enabled,
    strength: nonNegative(record.strength, 'bloom.strength'),
    radius: unit(record.radius, 'bloom.radius'),
    threshold: nonNegative(record.threshold, 'bloom.threshold'),
  })
}

function productionCurve(): Phase41EmissionCurve {
  return curve(PLANET_VISUAL_DEFAULTS.focus.emission, 'PLANET_VISUAL_DEFAULTS.focus.emission')
}

export function parsePhase41DiagnosticOverride(value: unknown): Phase41DiagnosticOverride {
  const record = object(value, 'override')
  exactKeys(record, overrideKeys, 'override')
  if (record.diagnostic_only !== PHASE41_DIAGNOSTIC_MARKER) {
    throw new Error(`[Phase41 diagnostic] diagnostic_only must equal ${PHASE41_DIAGNOSTIC_MARKER}`)
  }
  if (Object.keys(record).length === 1) {
    throw new Error('[Phase41 diagnostic] override must declare at least one visual field')
  }
  const result: Phase41DiagnosticOverride = { diagnostic_only: PHASE41_DIAGNOSTIC_MARKER }
  if ('emissionCurve' in record) result.emissionCurve = curve(record.emissionCurve, 'override.emissionCurve')
  if ('lightness' in record) result.lightness = unit(record.lightness, 'override.lightness')
  if ('keyLightIntensity' in record) result.keyLightIntensity = nonNegative(record.keyLightIntensity, 'override.keyLightIntensity')
  if ('direction' in record) result.direction = vector(record.direction, 'override.direction')
  if ('bloom' in record) result.bloom = bloom(record.bloom)
  return result
}

export function resolvePhase41VisualProfile(
  override?: Phase41DiagnosticOverride,
  bloomEnabled: boolean = PLANET_VISUAL_DEFAULTS.focus.bloom.enabled,
): ResolvedPhase41VisualProfile {
  if (typeof bloomEnabled !== 'boolean') throw new Error('[Phase41 diagnostic] Bloom state must be boolean')
  const parsed = override === undefined ? undefined : parsePhase41DiagnosticOverride(override)
  if (parsed?.bloom !== undefined && parsed.bloom.enabled !== bloomEnabled) {
    throw new Error('[Phase41 diagnostic] override Bloom state must match the request')
  }
  const bloom = parsed?.bloom ?? validatePerlinBloomParams(productionPlanetBloomParams(bloomEnabled))
  const productionVisualConfigInput = planetVisualConfigHashInput(bloom.enabled)
  const profile = {
    curve: parsed?.emissionCurve ?? productionCurve(),
    lightness: parsed?.lightness ?? PLANET_VISUAL_DEFAULTS.focus.lightness,
    chroma: PLANET_VISUAL_DEFAULTS.focus.chroma,
    keyLightIntensity: parsed?.keyLightIntensity ?? PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity,
    direction: vector(parsed?.direction ?? PLANET_VISUAL_DEFAULTS.lighting.direction, 'resolved direction'),
    flatShadingMix: PLANET_VISUAL_DEFAULTS.lighting.flatShadingMix,
    bloom,
    productionSource: 'PLANET_VISUAL_DEFAULTS' as const,
    productionVisualConfigInput,
    overrideProvenance: parsed === undefined ? 'none' as const : 'phase41-diagnostic-override' as const,
  }
  const resolvedVisualConfigInput = parsed === undefined
    ? productionVisualConfigInput
    : JSON.stringify({ phase41Diagnostic: PHASE41_DIAGNOSTIC_MARKER, profile })
  return { ...profile, resolvedVisualConfigInput }
}

export function phase41EmissionForRating(rating: number, emission: Phase41EmissionCurve): number {
  try {
    return focusEmissionIntensityFromProfile(rating, emission)
  } catch (error) {
    throw new Error(`[Phase41 diagnostic] ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function toPhase41RenderOverride(profile: ResolvedPhase41VisualProfile): Phase41RenderOverride {
  return { curve: profile.curve, lightness: profile.lightness, keyLightIntensity: profile.keyLightIntensity, direction: profile.direction, bloom: profile.bloom }
}

export type Phase41MatrixVariable = 'rating' | 'emission' | 'curve' | 'lightness' | 'keyLightIntensity' | 'direction' | 'bloom' | 'camera' | 'seed' | 'rotation'

export type Phase41MatrixSnapshot = {
  rating: number
  emission: number
  profile: ResolvedPhase41VisualProfile
  camera: unknown
  seed: unknown
  rotation: unknown
}

function stable(value: unknown): string {
  return JSON.stringify(value)
}

export function assertPhase41MatrixTransition(
  baseline: Phase41MatrixSnapshot,
  candidate: Phase41MatrixSnapshot,
  allowedVariables: readonly Phase41MatrixVariable[],
): void {
  const known = new Set<Phase41MatrixVariable>(['rating', 'emission', 'curve', 'lightness', 'keyLightIntensity', 'direction', 'bloom', 'camera', 'seed', 'rotation'])
  const allowed = new Set(allowedVariables)
  if (allowed.size !== allowedVariables.length || allowed.size === 0) {
    throw new Error('[Phase41 diagnostic] matrix must declare one or more unique allowed variables')
  }
  for (const field of allowed) {
    if (!known.has(field)) throw new Error(`[Phase41 diagnostic] matrix declares unknown variable ${field}`)
  }
  if (
    baseline.profile.chroma !== candidate.profile.chroma
    || baseline.profile.flatShadingMix !== candidate.profile.flatShadingMix
    || baseline.profile.productionSource !== candidate.profile.productionSource
    || baseline.profile.productionVisualConfigInput !== candidate.profile.productionVisualConfigInput
  ) {
    throw new Error('[Phase41 diagnostic] matrix changed a fixed production field')
  }
  const changed: Phase41MatrixVariable[] = []
  if (baseline.rating !== candidate.rating) changed.push('rating')
  if (baseline.emission !== candidate.emission) changed.push('emission')
  if (stable(baseline.profile.curve) !== stable(candidate.profile.curve)) changed.push('curve')
  if (baseline.profile.lightness !== candidate.profile.lightness) changed.push('lightness')
  if (baseline.profile.keyLightIntensity !== candidate.profile.keyLightIntensity) changed.push('keyLightIntensity')
  if (stable(baseline.profile.direction) !== stable(candidate.profile.direction)) changed.push('direction')
  if (stable(baseline.profile.bloom) !== stable(candidate.profile.bloom)) changed.push('bloom')
  if (stable(baseline.camera) !== stable(candidate.camera)) changed.push('camera')
  if (stable(baseline.seed) !== stable(candidate.seed)) changed.push('seed')
  if (stable(baseline.rotation) !== stable(candidate.rotation)) changed.push('rotation')
  for (const field of changed) {
    if (!allowed.has(field)) throw new Error(`[Phase41 diagnostic] matrix changed undeclared variable ${field}`)
  }
}

export function assertPhase41RatingRow(baseline: Phase41MatrixSnapshot, candidate: Phase41MatrixSnapshot): void {
  assertPhase41MatrixTransition(baseline, candidate, ['rating', 'emission'])
  if (baseline.rating === candidate.rating || baseline.emission === candidate.emission) {
    throw new Error('[Phase41 diagnostic] rating rows must change both rating and resolved emission')
  }
}