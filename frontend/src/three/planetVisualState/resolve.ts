import {
  FOCUS_EMISSION_LEGACY_FALLBACK_PROFILE_ID,
  LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  stableFocusEmissionJson,
  validateFocusEmissionCurve,
  validateRatingMidrankCdfLutProfile,
  type FocusEmissionProfile,
} from '../focusEmission.js'
import { validateFocusEmissionRuntimeTuning } from '../focusEmissionTuning.js'
import {
  PERLIN_BLOOM_COMPOSITION,
  validatePerlinBloomParams,
} from '../perlinBloomContract.js'
import {
  PLANET_MAX_BANDS,
  PLANET_VISUAL_DEFAULTS,
  productionPlanetBloomParams,
} from '../planetVisualDefaults.js'
import type { FocusEmissionProfileProvenance } from '../../types/galaxy.js'

import type {
  PlanetVisualEmissionDerivation,
  PlanetVisualLegacyCompatibility,
  PlanetVisualOverrideProvenance,
  PlanetVisualProfileSource,
  PlanetVisualState,
  PlanetVisualStateInput,
  PlanetVisualStatePayload,
} from './types.js'
import {
  P39_LEGACY_COMPATIBILITY_PROOF,
  PHASE41_DIAGNOSTIC_MARKER,
} from './types.js'

function fail(message: string): never {
  throw new Error(`[PlanetVisualState] ${message}`)
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) fail(`${label} must be finite`)
  return Object.is(value, -0) ? 0 : value
}

function unit(value: number, label: string): number {
  const result = finite(value, label)
  if (result < 0 || result > 1) fail(`${label} must be in [0, 1]`)
  return result
}

function nonNegative(value: number, label: string): number {
  const result = finite(value, label)
  if (result < 0) fail(`${label} must be >= 0`)
  return result
}

function positive(value: number, label: string): number {
  const result = finite(value, label)
  if (result <= 0) fail(`${label} must be > 0`)
  return result
}

function integer(value: number, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${label} must be a safe integer in [${min}, ${max}]`)
  }
  return value
}

function boolean(value: boolean, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be boolean`)
  return value
}

function nonEmptyString(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`)
  return value
}

function normalizeDirection(value: readonly [number, number, number]): [number, number, number] {
  const direction: [number, number, number] = [
    finite(value[0], 'lighting.direction[0]'),
    finite(value[1], 'lighting.direction[1]'),
    finite(value[2], 'lighting.direction[2]'),
  ]
  const magnitude = Math.hypot(...direction)
  if (magnitude === 0) fail('lighting.direction must not be a zero vector')
  return direction.map((component) => component / magnitude) as [number, number, number]
}

function resolveProfile(curve: FocusEmissionProfile): FocusEmissionProfile {
  if (curve === null || typeof curve !== 'object') fail('emission curve must be an object')
  if (curve.modelVersion === RATING_MIDRANK_CDF_LUT_MODEL_VERSION) {
    return validateRatingMidrankCdfLutProfile(curve)
  }
  return validateFocusEmissionCurve(curve)
}

function resolveProvenance(
  provenance: FocusEmissionProfileProvenance,
  profile: FocusEmissionProfile,
  source: PlanetVisualProfileSource,
  overrideProvenance: PlanetVisualOverrideProvenance,
): FocusEmissionProfileProvenance {
  if (provenance === null || typeof provenance !== 'object') fail('profile provenance must be an object')
  const resolved = {
    profile_id: nonEmptyString(provenance.profile_id, 'profile provenance profile_id'),
    period: nonEmptyString(provenance.period, 'profile provenance period'),
    model_version: nonEmptyString(provenance.model_version, 'profile provenance model_version'),
    curve_sha256: nonEmptyString(provenance.curve_sha256, 'profile provenance curve_sha256'),
    source_data_version: nonEmptyString(provenance.source_data_version, 'profile provenance source_data_version'),
    source_movie_count: integer(provenance.source_movie_count, 'profile provenance source_movie_count', 1, Number.MAX_SAFE_INTEGER),
  }
  if (!/^[a-z0-9][a-z0-9-]{2,127}$/.test(resolved.profile_id)) {
    fail('profile provenance profile_id must be a lowercase immutable identifier')
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(resolved.period)) {
    fail('profile provenance period must be YYYY-MM')
  }
  if (!/^[a-f0-9]{64}$/.test(resolved.curve_sha256)) {
    fail('profile provenance curve_sha256 must be a lowercase SHA-256 digest')
  }
  if (source !== 'diagnostic-override' && resolved.model_version !== profile.modelVersion) {
    fail('emission profile and provenance model versions must match')
  }
  if (!['active', 'legacy-fallback', 'diagnostic-override'].includes(source)) {
    fail('emission profile source is unsupported')
  }
  if (source === 'active' && resolved.profile_id === FOCUS_EMISSION_LEGACY_FALLBACK_PROFILE_ID) {
    fail('active source must not use legacy fallback provenance')
  }
  if (
    source === 'legacy-fallback'
    && stableFocusEmissionJson(resolved) !== stableFocusEmissionJson({
      profile_id: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE.profile_id,
      period: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE.period,
      model_version: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE.model_version,
      curve_sha256: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE.curve_sha256,
      source_data_version: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE.source_data_version,
      source_movie_count: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE.source_movie_count,
    })
  ) {
    fail('legacy fallback source must use the frozen legacy provenance')
  }
  if (source === 'diagnostic-override' && overrideProvenance !== 'phase41-diagnostic-override') {
    fail('diagnostic emission source requires explicit diagnostic override provenance')
  }
  return resolved
}

function resolveDiagnosticMarker(
  source: PlanetVisualProfileSource,
  overrideProvenance: PlanetVisualOverrideProvenance,
  marker: PlanetVisualStateInput['diagnosticMarker'],
): typeof PHASE41_DIAGNOSTIC_MARKER | undefined {
  const requiresMarker = source === 'diagnostic-override'
    || overrideProvenance === 'phase41-diagnostic-override'
  if (marker === undefined) {
    if (requiresMarker) fail('diagnostic marker is required for Phase 41 diagnostic state')
    return undefined
  }
  if (marker !== PHASE41_DIAGNOSTIC_MARKER) {
    fail(`diagnostic marker must equal ${PHASE41_DIAGNOSTIC_MARKER}`)
  }
  return marker
}

function resolveLegacyCompatibility(
  source: PlanetVisualProfileSource,
  marker: typeof PHASE41_DIAGNOSTIC_MARKER | undefined,
  compatibility: PlanetVisualStateInput['legacyCompatibility'],
  derivation: PlanetVisualStateInput['emissionDerivation'],
): Readonly<{
  compatibility?: PlanetVisualLegacyCompatibility
  derivation?: PlanetVisualEmissionDerivation
}> {
  if (compatibility === undefined) {
    if (derivation !== undefined) fail('legacy emission derivation requires legacy compatibility proof')
    if (source === 'legacy-fallback' && marker === undefined) {
      fail('legacy compatibility proof is required for historical P39 state')
    }
    return {}
  }
  if (source !== 'legacy-fallback') fail('legacy compatibility proof requires the legacy fallback source')
  if (marker !== undefined) fail('P39 legacy compatibility must not be disguised as a Phase 41 diagnostic')
  if (compatibility.proof !== P39_LEGACY_COMPATIBILITY_PROOF) {
    fail(`legacy compatibility proof must equal ${P39_LEGACY_COMPATIBILITY_PROOF}`)
  }
  const resolvedCompatibility: PlanetVisualLegacyCompatibility = {
    proof: compatibility.proof,
    evidenceIdentity: nonEmptyString(
      compatibility.evidenceIdentity,
      'legacy compatibility evidence identity',
    ),
    historicalVisualHash: nonEmptyString(
      compatibility.historicalVisualHash,
      'legacy compatibility historical visual hash',
    ),
    ...(compatibility.historicalMetadata === undefined
      ? {}
      : {
          historicalMetadata: Object.fromEntries(
            Object.entries(compatibility.historicalMetadata).map(([key, value]) => {
              nonEmptyString(key, 'legacy compatibility metadata key')
              if (
                typeof value !== 'string'
                && typeof value !== 'boolean'
                && (typeof value !== 'number' || !Number.isFinite(value))
              ) {
                fail(`legacy compatibility metadata ${key} must be finite JSON scalar`)
              }
              return [key, Object.is(value, -0) ? 0 : value]
            }),
          ),
        }),
  }
  if (derivation === undefined) fail('legacy compatibility proof requires a legacy emission derivation')
  if (derivation.kind !== 'legacy-power') fail('legacy emission derivation kind is unsupported')
  const intensityMin = nonNegative(derivation.intensityMin, 'legacy emission intensityMin')
  const intensityMax = nonNegative(derivation.intensityMax, 'legacy emission intensityMax')
  if (intensityMin > intensityMax) fail('legacy emission intensity endpoints are inverted')
  const modelVersion = nonEmptyString(derivation.modelVersion, 'legacy emission modelVersion')
  if (
    modelVersion !== 'vote-average-power-clamped-v1'
    && modelVersion !== 'p39.11-checkpoint-b-emission-exponent-v1'
  ) {
    fail('legacy emission modelVersion is unsupported')
  }
  const resolvedDerivation: PlanetVisualEmissionDerivation = {
    kind: 'legacy-power',
    modelVersion,
    exponent: positive(derivation.exponent, 'legacy emission exponent'),
    intensityMin,
    intensityMax,
  }
  return { compatibility: resolvedCompatibility, derivation: resolvedDerivation }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

export function resolvePlanetVisualState(input: PlanetVisualStateInput): PlanetVisualState {
  if (input === null || typeof input !== 'object') fail('input must be an object')
  const defaults = PLANET_VISUAL_DEFAULTS
  const overrideProvenance = input.overrideProvenance ?? 'none'
  if (overrideProvenance !== 'none' && overrideProvenance !== 'phase41-diagnostic-override') {
    fail('override provenance is unsupported')
  }

  const diagnosticMarker = resolveDiagnosticMarker(
    input.emissionSource,
    overrideProvenance,
    input.diagnosticMarker,
  )
  const legacy = resolveLegacyCompatibility(
    input.emissionSource,
    diagnosticMarker,
    input.legacyCompatibility,
    input.emissionDerivation,
  )
  const profile = resolveProfile(input.curve)
  const provenance = resolveProvenance(
    input.emissionProvenance,
    profile,
    input.emissionSource,
    overrideProvenance,
  )
  const bloomEnabled = boolean(input.bloomEnabled, 'bloomEnabled')
  const bloom = validatePerlinBloomParams(input.bloom ?? productionPlanetBloomParams(bloomEnabled))
  if (bloom.enabled !== bloomEnabled) fail('Bloom enabled state must match the requested state')
  const emissionTuning = validateFocusEmissionRuntimeTuning(
    input.emissionTuning ?? defaults.focus.emissionTuning,
  )

  const geometryInput = input.geometry ?? defaults.geometry
  const sizeInput = input.size ?? {
    sizeScale: defaults.activeShell.sizeScale,
    activeSizeMultiplier: defaults.activeShell.activeSizeMultiplier,
  }
  const noiseInput = input.noise ?? defaults.noise
  const bandsInput = input.bands ?? defaults.bands
  const colorInput = input.color ?? defaults.color
  const materialInput = input.material ?? defaults.material

  const visual: PlanetVisualStatePayload['visual'] = {
    geometry: {
      detail: integer(geometryInput.detail, 'geometry.detail', 0, 10),
    },
    size: {
      sizeScale: positive(sizeInput.sizeScale, 'size.sizeScale'),
      activeSizeMultiplier: positive(sizeInput.activeSizeMultiplier, 'size.activeSizeMultiplier'),
    },
    noise: {
      scale: positive(noiseInput.scale, 'noise.scale'),
      octaves: integer(noiseInput.octaves, 'noise.octaves', 1, 8),
      persistence: unit(noiseInput.persistence, 'noise.persistence'),
    },
    bands: {
      max: integer(bandsInput.max, 'bands.max', 1, PLANET_MAX_BANDS),
      areaRatio: positive(bandsInput.areaRatio, 'bands.areaRatio'),
      stepHeight: nonNegative(bandsInput.stepHeight, 'bands.stepHeight'),
      stepSmoothness: nonNegative(bandsInput.stepSmoothness, 'bands.stepSmoothness'),
    },
    color: {
      pipelineVersion: nonEmptyString(colorInput.pipelineVersion, 'color.pipelineVersion'),
      lMax: unit(colorInput.lMax, 'color.lMax'),
      huntGamma: positive(colorInput.huntGamma, 'color.huntGamma'),
      huntApplyMask: integer(colorInput.huntApplyMask, 'color.huntApplyMask', 0, 7),
    },
    focus: {
      lightness: unit(input.lightness ?? defaults.focus.lightness, 'focus.lightness'),
      chroma: nonNegative(input.chroma ?? defaults.focus.chroma, 'focus.chroma'),
      emission: profile,
      emissionTuning,
      bloom: {
        composition: PERLIN_BLOOM_COMPOSITION,
        ...bloom,
      },
    },
    lighting: {
      enabled: boolean(input.lightingEnabled ?? defaults.lighting.enabled, 'lighting.enabled'),
      direction: normalizeDirection(input.direction ?? defaults.lighting.direction),
      keyLightIntensity: nonNegative(
        input.keyLightIntensity ?? defaults.lighting.keyLightIntensity,
        'lighting.keyLightIntensity',
      ),
      flatShadingMix: unit(
        input.flatShadingMix ?? defaults.lighting.flatShadingMix,
        'lighting.flatShadingMix',
      ),
    },
    material: {
      alphaTest: unit(materialInput.alphaTest, 'material.alphaTest'),
      transparent: boolean(materialInput.transparent, 'material.transparent'),
      depthWrite: boolean(materialInput.depthWrite, 'material.depthWrite'),
      depthTest: boolean(materialInput.depthTest, 'material.depthTest'),
    },
  }
  const payload: PlanetVisualStatePayload = {
    schema_version: 'canonical-planet-visual-state-v1',
    visual,
    emission_profile: { ...provenance, source: input.emissionSource },
    override_provenance: overrideProvenance,
    ...(diagnosticMarker === undefined ? {} : { diagnostic_marker: diagnosticMarker }),
    ...(legacy.compatibility === undefined
      ? {}
      : { legacy_compatibility: legacy.compatibility }),
    ...(legacy.derivation === undefined ? {} : { emission_derivation: legacy.derivation }),
  }
  const frozenPayload = deepFreeze(payload)
  const hashInput = stableFocusEmissionJson(frozenPayload)
  const state: PlanetVisualState = {
    payload: frozenPayload,
    hashInput,
    geometry: frozenPayload.visual.geometry,
    size: frozenPayload.visual.size,
    noise: frozenPayload.visual.noise,
    bands: frozenPayload.visual.bands,
    color: frozenPayload.visual.color,
    focus: frozenPayload.visual.focus,
    lighting: frozenPayload.visual.lighting,
    material: frozenPayload.visual.material,
    curve: frozenPayload.visual.focus.emission,
    emissionProvenance: deepFreeze({ ...provenance }),
    emissionSource: input.emissionSource,
    lightness: frozenPayload.visual.focus.lightness,
    chroma: frozenPayload.visual.focus.chroma,
    keyLightIntensity: frozenPayload.visual.lighting.keyLightIntensity,
    direction: frozenPayload.visual.lighting.direction,
    flatShadingMix: frozenPayload.visual.lighting.flatShadingMix,
    bloom: deepFreeze({ ...bloom }),
    overrideProvenance,
    ...(diagnosticMarker === undefined ? {} : { diagnosticMarker }),
    ...(legacy.compatibility === undefined
      ? {}
      : { legacyCompatibility: frozenPayload.legacy_compatibility! }),
    ...(legacy.derivation === undefined
      ? {}
      : { emissionDerivation: frozenPayload.emission_derivation! }),
  }
  return deepFreeze(state)
}