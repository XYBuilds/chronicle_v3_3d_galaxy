import {
  stableFocusEmissionJson,
  type FocusEmissionProfile,
} from '../three/focusEmission.js'
import {
  PLANET_VISUAL_DEFAULTS,
  productionPlanetBloomParams,
} from '../three/planetVisualDefaults.js'
import {
  validatePerlinBloomParams,
  type PerlinBloomParams,
} from '../three/perlinBloomContract.js'
import type { FocusEmissionProfileProvenance } from '../types/galaxy.js'

export type PlanetEmissionVisualProvenance = FocusEmissionProfileProvenance & {
  source: 'active' | 'legacy-fallback' | 'diagnostic-override'
}

export type ResolvedPlanetVisualConfigInput = {
  curve: FocusEmissionProfile
  emissionProvenance: FocusEmissionProfileProvenance
  emissionSource: PlanetEmissionVisualProvenance['source']
  bloomEnabled: boolean
  lightness?: number
  chroma?: number
  keyLightIntensity?: number
  direction?: readonly [number, number, number]
  flatShadingMix?: number
  bloom?: PerlinBloomParams
  overrideProvenance?: 'none' | 'phase41-diagnostic-override'
}

/**
 * The one authoritative, serialisable description of values that reach the planet renderer.
 * It deliberately requires a resolved emission curve: this module never chooses a production
 * or legacy profile on its own.
 */
export type ResolvedPlanetVisualConfig = {
  payload: {
    schema_version: 'resolved-planet-visual-config-v1'
    visual: Record<string, unknown>
    emission_profile: PlanetEmissionVisualProvenance
    override_provenance: 'none' | 'phase41-diagnostic-override'
  }
  hashInput: string
  curve: FocusEmissionProfile
  emissionProvenance: FocusEmissionProfileProvenance
  emissionSource: PlanetEmissionVisualProvenance['source']
  lightness: number
  chroma: number
  keyLightIntensity: number
  direction: [number, number, number]
  flatShadingMix: number
  bloom: PerlinBloomParams
  overrideProvenance: 'none' | 'phase41-diagnostic-override'
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`[PlanetVisualConfig] ${label} must be finite`)
  return value
}

function unit(value: number, label: string): number {
  const result = finite(value, label)
  if (result < 0 || result > 1) throw new Error(`[PlanetVisualConfig] ${label} must be in [0, 1]`)
  return result
}

function nonNegative(value: number, label: string): number {
  const result = finite(value, label)
  if (result < 0) throw new Error(`[PlanetVisualConfig] ${label} must be >= 0`)
  return result
}

function direction(value: readonly [number, number, number]): [number, number, number] {
  const result: [number, number, number] = [finite(value[0], 'direction[0]'), finite(value[1], 'direction[1]'), finite(value[2], 'direction[2]')]
  const magnitude = Math.hypot(...result)
  if (magnitude === 0) throw new Error('[PlanetVisualConfig] direction must not be a zero vector')
  return [result[0] / magnitude, result[1] / magnitude, result[2] / magnitude]
}

/** Builds the payload once, after all request and diagnostic overrides have been resolved. */
export function resolvePlanetVisualConfig(input: ResolvedPlanetVisualConfigInput): ResolvedPlanetVisualConfig {
  if (typeof input.bloomEnabled !== 'boolean') throw new Error('[PlanetVisualConfig] bloomEnabled must be boolean')
  const resolvedBloom = validatePerlinBloomParams(input.bloom ?? productionPlanetBloomParams(input.bloomEnabled))
  if (resolvedBloom.enabled !== input.bloomEnabled) throw new Error('[PlanetVisualConfig] Bloom state must match request')
  const resolvedDirection = direction(input.direction ?? PLANET_VISUAL_DEFAULTS.lighting.direction)
  const lightness = unit(input.lightness ?? PLANET_VISUAL_DEFAULTS.focus.lightness, 'lightness')
  const chroma = nonNegative(input.chroma ?? PLANET_VISUAL_DEFAULTS.focus.chroma, 'chroma')
  const keyLightIntensity = nonNegative(input.keyLightIntensity ?? PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity, 'keyLightIntensity')
  const flatShadingMix = unit(input.flatShadingMix ?? PLANET_VISUAL_DEFAULTS.lighting.flatShadingMix, 'flatShadingMix')
  const emissionProfile: PlanetEmissionVisualProvenance = { ...input.emissionProvenance, source: input.emissionSource }
  const overrideProvenance = input.overrideProvenance ?? 'none'
  const visual = {
    ...PLANET_VISUAL_DEFAULTS,
    focus: {
      ...PLANET_VISUAL_DEFAULTS.focus,
      lightness,
      chroma,
      emission: input.curve,
      bloom: { ...resolvedBloom, composition: PLANET_VISUAL_DEFAULTS.focus.bloom.composition },
    },
    lighting: {
      ...PLANET_VISUAL_DEFAULTS.lighting,
      direction: resolvedDirection,
      keyLightIntensity,
      flatShadingMix,
    },
  } satisfies Record<string, unknown>
  const payload = {
    schema_version: 'resolved-planet-visual-config-v1' as const,
    visual,
    emission_profile: emissionProfile,
    override_provenance: overrideProvenance,
  }
  return {
    payload,
    hashInput: stableFocusEmissionJson(payload as unknown as Parameters<typeof stableFocusEmissionJson>[0]),
    curve: input.curve,
    emissionProvenance: input.emissionProvenance,
    emissionSource: input.emissionSource,
    lightness,
    chroma,
    keyLightIntensity,
    direction: resolvedDirection,
    flatShadingMix,
    bloom: resolvedBloom,
    overrideProvenance,
  }
}

/**
 * Compatibility overload preserves frozen P39 evidence call sites. New renderer paths pass the
 * resolved payload object, rather than composing strings at the caller.
 */
export function planetExportVisualConfigInput(config: ResolvedPlanetVisualConfig): string
export function planetExportVisualConfigInput(legacyVisualInput: string, exportSizeRoot: number): string
export function planetExportVisualConfigInput(config: ResolvedPlanetVisualConfig | string, exportSizeRoot?: number): string {
  if (typeof config === 'string') {
    void exportSizeRoot
    return config
  }
  return config.hashInput
}

/** Backward-compatible name for consumers that only need the stable resolved hash input. */
export function resolvedPlanetVisualHashInput(config: ResolvedPlanetVisualConfig): string {
  return config.hashInput
}