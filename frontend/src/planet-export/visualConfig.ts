import { resolvePlanetVisualState } from '../three/planetVisualState/resolve.js'
import type {
  PlanetVisualProfileSource,
  PlanetVisualState,
  PlanetVisualStateInput,
} from '../three/planetVisualState/types.js'
import type { FocusEmissionProfileProvenance } from '../types/galaxy.js'

export type PlanetEmissionVisualProvenance = FocusEmissionProfileProvenance & {
  source: PlanetVisualProfileSource
}

export type ResolvedPlanetVisualConfigInput = PlanetVisualStateInput
export type ResolvedPlanetVisualConfig = PlanetVisualState

/** Compatibility adapter for existing exporter callers during seam migration. */
export function resolvePlanetVisualConfig(
  input: ResolvedPlanetVisualConfigInput,
): ResolvedPlanetVisualConfig {
  return resolvePlanetVisualState(input)
}

function provenanceIdentity(provenance: FocusEmissionProfileProvenance): string {
  return JSON.stringify([
    provenance.profile_id,
    provenance.period,
    provenance.model_version,
    provenance.curve_sha256,
    provenance.source_data_version,
    provenance.source_movie_count,
  ])
}

function stateIdentity(config: ResolvedPlanetVisualConfig): string {
  return JSON.stringify({
    payload: config.payload,
    geometry: config.geometry,
    size: config.size,
    noise: config.noise,
    bands: config.bands,
    color: config.color,
    focus: config.focus,
    lighting: config.lighting,
    material: config.material,
    curve: config.curve,
    emissionProvenance: config.emissionProvenance,
    emissionSource: config.emissionSource,
    lightness: config.lightness,
    chroma: config.chroma,
    keyLightIntensity: config.keyLightIntensity,
    direction: config.direction,
    flatShadingMix: config.flatShadingMix,
    bloom: config.bloom,
    overrideProvenance: config.overrideProvenance,
  })
}

/** Production exports accept only an intact active canonical state. */
export function requireProductionPlanetVisualConfig(
  config: ResolvedPlanetVisualConfig,
): ResolvedPlanetVisualConfig {
  if (config === null || typeof config !== 'object') {
    throw new Error('[PlanetExport] canonical resolved visual config is required at the production boundary')
  }
  if (config.emissionSource !== 'active') {
    throw new Error('[PlanetExport] production visual config requires an active emission profile')
  }
  if (config.overrideProvenance !== 'none' || config.payload.override_provenance !== 'none') {
    throw new Error('[PlanetExport] production visual config must not contain diagnostic overrides')
  }
  if (config.payload.emission_profile.source !== 'active') {
    throw new Error('[PlanetExport] canonical payload emission source must be active')
  }
  if (provenanceIdentity(config.payload.emission_profile) !== provenanceIdentity(config.emissionProvenance)) {
    throw new Error('[PlanetExport] canonical payload provenance disagrees with the resolved state')
  }
  const canonical = resolvePlanetVisualState({
    curve: config.curve,
    emissionProvenance: config.emissionProvenance,
    emissionSource: config.emissionSource,
    bloomEnabled: config.bloom.enabled,
    geometry: config.geometry,
    size: config.size,
    noise: config.noise,
    bands: config.bands,
    color: config.color,
    lightness: config.lightness,
    chroma: config.chroma,
    emissionTuning: config.focus.emissionTuning,
    keyLightIntensity: config.keyLightIntensity,
    direction: config.direction,
    flatShadingMix: config.flatShadingMix,
    bloom: config.bloom,
    lightingEnabled: config.lighting.enabled,
    material: config.material,
    overrideProvenance: config.overrideProvenance,
  })
  if (canonical.hashInput !== config.hashInput || stateIdentity(canonical) !== stateIdentity(config)) {
    throw new Error('[PlanetExport] canonical visual config identity is inconsistent')
  }
  return config
}

export function planetExportVisualConfigInput(config: ResolvedPlanetVisualConfig): string {
  return config.hashInput
}

/** Backward-compatible name for consumers that only need the stable resolved hash input. */
export function resolvedPlanetVisualHashInput(config: ResolvedPlanetVisualConfig): string {
  return config.hashInput
}