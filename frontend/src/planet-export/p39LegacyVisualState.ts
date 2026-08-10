import {
  LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  type RatingMidrankCdfLutProfile,
} from '@/three/focusEmission'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '@/three/productionFocusEmissionProfile'
import {
  P39_LEGACY_COMPATIBILITY_PROOF,
  type PlanetVisualAppliedSnapshot,
  type PlanetVisualEmissionDerivation,
  type PlanetVisualLegacyCompatibility,
} from '@/three/planetVisualState'
import type { PerlinBloomParams } from '@/three/perlinBloomContract'
import {
  resolvePlanetVisualConfig,
  type ResolvedPlanetVisualConfig,
} from './visualConfig'

export const P3911_LEGACY_FROZEN_PROFILE_FIXTURE = P39_LEGACY_COMPATIBILITY_PROOF

export const P39_FINAL_POWER_EMISSION: PlanetVisualEmissionDerivation = {
  kind: 'legacy-power',
  modelVersion: 'vote-average-power-clamped-v1',
  exponent: 2,
  intensityMin: 0.06,
  intensityMax: 0.6,
}

export type P39LegacyVisualStateInput = {
  evidenceIdentity: string
  historicalVisualHash: string
  historicalMetadata?: PlanetVisualLegacyCompatibility['historicalMetadata']
  bloom: PerlinBloomParams
  keyLightIntensity?: number
  emissionDerivation?: PlanetVisualEmissionDerivation
  emissionProfile?: RatingMidrankCdfLutProfile
}

/** Resolves one historical P39 evidence identity into the canonical visual-state seam. */
export function resolveP39LegacyPlanetVisualState(
  input: P39LegacyVisualStateInput,
): ResolvedPlanetVisualConfig {
  const legacyCompatibility: PlanetVisualLegacyCompatibility = {
    proof: P3911_LEGACY_FROZEN_PROFILE_FIXTURE,
    evidenceIdentity: input.evidenceIdentity,
    historicalVisualHash: input.historicalVisualHash,
    ...(input.historicalMetadata === undefined
      ? {}
      : { historicalMetadata: input.historicalMetadata }),
  }
  return resolvePlanetVisualConfig({
    curve: input.emissionProfile ?? PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
    emissionProvenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
    emissionSource: 'legacy-fallback',
    bloomEnabled: input.bloom.enabled,
    bloom: input.bloom,
    keyLightIntensity: input.keyLightIntensity ?? 0.35,
    emissionDerivation: input.emissionDerivation ?? P39_FINAL_POWER_EMISSION,
    legacyCompatibility,
  })
}

export function requireP39CanonicalVisualHash(
  config: ResolvedPlanetVisualConfig,
): string {
  if (
    config.emissionSource !== 'legacy-fallback'
    || config.legacyCompatibility?.proof !== P3911_LEGACY_FROZEN_PROFILE_FIXTURE
    || config.diagnosticMarker !== undefined
    || config.hashInput.length === 0
  ) {
    throw new Error('[P39 diagnostics] canonical legacy visual state is invalid')
  }
  return config.hashInput
}

export type P39LegacyRendererEvidence = {
  visual_config_hash_input?: string
  renderer_snapshot?: PlanetVisualAppliedSnapshot
  legacy_compatibility?: PlanetVisualLegacyCompatibility
  emission: number
}

/** Requires P39 page evidence to come from the state actually applied by the renderer. */
export function requireP39RendererEvidence(
  diagnostics: P39LegacyRendererEvidence,
  expectedEvidenceIdentity: string,
): string {
  const hashInput = diagnostics.visual_config_hash_input
  const snapshot = diagnostics.renderer_snapshot
  const compatibility = diagnostics.legacy_compatibility
  if (
    typeof hashInput !== 'string'
    || hashInput.length === 0
    || snapshot?.canonicalHashInput !== hashInput
    || snapshot.profileSource !== 'legacy-fallback'
    || snapshot.legacyCompatibility?.proof !== P3911_LEGACY_FROZEN_PROFILE_FIXTURE
    || snapshot.legacyCompatibility.evidenceIdentity !== expectedEvidenceIdentity
    || compatibility?.proof !== P3911_LEGACY_FROZEN_PROFILE_FIXTURE
    || compatibility.evidenceIdentity !== expectedEvidenceIdentity
    || snapshot.emission !== diagnostics.emission
  ) {
    throw new Error('[P39 diagnostics] renderer evidence does not match the canonical legacy state')
  }
  return hashInput
}

export function p39LegacyBloomOff(): PerlinBloomParams {
  return {
    enabled: false,
    strength: PLANET_VISUAL_DEFAULTS.focus.bloom.strength,
    radius: PLANET_VISUAL_DEFAULTS.focus.bloom.radius,
    threshold: PLANET_VISUAL_DEFAULTS.focus.bloom.threshold,
  }
}