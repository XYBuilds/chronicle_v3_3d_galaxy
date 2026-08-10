import type { Meta, Movie, FocusEmissionProfileProvenance } from '../../types/galaxy.js'
import type { FocusEmissionProfile } from '../focusEmission.js'
import type { FocusEmissionRuntimeTuning } from '../focusEmissionTuning.js'
import type { PerlinBloomParams } from '../perlinBloomContract.js'

export type PlanetVisualProfileSource = 'active' | 'legacy-fallback' | 'diagnostic-override'
export type PlanetVisualOverrideProvenance = 'none' | 'phase41-diagnostic-override'
export const PHASE41_DIAGNOSTIC_MARKER = 'phase41-visual-diagnostic-v1' as const
export const P39_LEGACY_COMPATIBILITY_PROOF = 'p39.11-frozen-profile-fixture' as const
export type PlanetVisualDiagnosticMarker = typeof PHASE41_DIAGNOSTIC_MARKER

export type PlanetVisualLegacyCompatibility = Readonly<{
  proof: typeof P39_LEGACY_COMPATIBILITY_PROOF
  evidenceIdentity: string
  historicalVisualHash: string
  historicalMetadata?: Readonly<Record<string, string | number | boolean>>
}>

export type PlanetVisualEmissionDerivation = Readonly<{
  kind: 'legacy-power'
  modelVersion: 'vote-average-power-clamped-v1' | 'p39.11-checkpoint-b-emission-exponent-v1'
  exponent: number
  intensityMin: number
  intensityMax: number
}>

export type PlanetVisualStateInput = {
  curve: FocusEmissionProfile
  emissionProvenance: FocusEmissionProfileProvenance
  emissionSource: PlanetVisualProfileSource
  bloomEnabled: boolean
  geometry?: { detail: number }
  size?: { sizeScale: number; activeSizeMultiplier: number }
  noise?: { scale: number; octaves: number; persistence: number }
  bands?: {
    max: number
    areaRatio: number
    stepHeight: number
    stepSmoothness: number
  }
  color?: {
    pipelineVersion: string
    lMax: number
    huntGamma: number
    huntApplyMask: number
  }
  lightness?: number
  chroma?: number
  emissionTuning?: FocusEmissionRuntimeTuning
  keyLightIntensity?: number
  direction?: readonly [number, number, number]
  flatShadingMix?: number
  bloom?: PerlinBloomParams
  lightingEnabled?: boolean
  material?: {
    alphaTest: number
    transparent: boolean
    depthWrite: boolean
    depthTest: boolean
  }
  overrideProvenance?: PlanetVisualOverrideProvenance
  diagnosticMarker?: PlanetVisualDiagnosticMarker
  legacyCompatibility?: PlanetVisualLegacyCompatibility
  emissionDerivation?: PlanetVisualEmissionDerivation
}

export type PlanetVisualStatePayload = Readonly<{
  schema_version: 'canonical-planet-visual-state-v1'
  visual: Readonly<{
    geometry: Readonly<{ detail: number }>
    size: Readonly<{ sizeScale: number; activeSizeMultiplier: number }>
    noise: Readonly<{ scale: number; octaves: number; persistence: number }>
    bands: Readonly<{
      max: number
      areaRatio: number
      stepHeight: number
      stepSmoothness: number
    }>
    color: Readonly<{
      pipelineVersion: string
      lMax: number
      huntGamma: number
      huntApplyMask: number
    }>
    focus: Readonly<{
      lightness: number
      chroma: number
      emission: FocusEmissionProfile
      emissionTuning: FocusEmissionRuntimeTuning
      bloom: Readonly<PerlinBloomParams & { composition: 'pure-bloom-delta-v1' }>
    }>
    lighting: Readonly<{
      enabled: boolean
      direction: [number, number, number]
      keyLightIntensity: number
      flatShadingMix: number
    }>
    material: Readonly<{
      alphaTest: number
      transparent: boolean
      depthWrite: boolean
      depthTest: boolean
    }>
  }>
  emission_profile: Readonly<FocusEmissionProfileProvenance & { source: PlanetVisualProfileSource }>
  override_provenance: PlanetVisualOverrideProvenance
  diagnostic_marker?: PlanetVisualDiagnosticMarker
  legacy_compatibility?: PlanetVisualLegacyCompatibility
  emission_derivation?: PlanetVisualEmissionDerivation
}>

export type PlanetVisualState = Readonly<{
  payload: PlanetVisualStatePayload
  hashInput: string
  geometry: PlanetVisualStatePayload['visual']['geometry']
  size: PlanetVisualStatePayload['visual']['size']
  noise: PlanetVisualStatePayload['visual']['noise']
  bands: PlanetVisualStatePayload['visual']['bands']
  color: PlanetVisualStatePayload['visual']['color']
  focus: PlanetVisualStatePayload['visual']['focus']
  lighting: PlanetVisualStatePayload['visual']['lighting']
  material: PlanetVisualStatePayload['visual']['material']
  curve: FocusEmissionProfile
  emissionProvenance: FocusEmissionProfileProvenance
  emissionSource: PlanetVisualProfileSource
  lightness: number
  chroma: number
  keyLightIntensity: number
  direction: [number, number, number]
  flatShadingMix: number
  bloom: Readonly<PerlinBloomParams>
  overrideProvenance: PlanetVisualOverrideProvenance
  diagnosticMarker?: PlanetVisualDiagnosticMarker
  legacyCompatibility?: PlanetVisualLegacyCompatibility
  emissionDerivation?: PlanetVisualEmissionDerivation
}>

export type PlanetVisualMovieState = Readonly<{
  genres: readonly string[]
  hues: readonly number[]
  bandCount: number
  cutCount: number
  outerRadius: number
  baseQuaternion: readonly [number, number, number, number]
}>

export type PlanetVisualRenderContext = Readonly<{
  movie: Movie
  palette: Meta['genre_palette']
  worldRadius: number
}>

export type PlanetVisualEmission = Readonly<{
  profileIntensity: number
  finalIntensity: number
}>

export type PlanetVisualApplication = Readonly<{
  state: PlanetVisualState
  movie: Movie
  palette: Meta['genre_palette']
  worldRadius: number
  appearance: PlanetVisualMovieState
  emission: PlanetVisualEmission
}>

export type PlanetVisualAppliedSnapshot = Readonly<{
  canonicalHashInput: string
  profileProvenance: FocusEmissionProfileProvenance
  profileSource: PlanetVisualProfileSource
  overrideProvenance: PlanetVisualOverrideProvenance
  diagnosticMarker?: PlanetVisualDiagnosticMarker
  legacyCompatibility?: PlanetVisualLegacyCompatibility
  emissionDerivation?: PlanetVisualEmissionDerivation
  movieId: number
  worldRadius: number
  outerRadius: number
  emission: number
  profileEmission: number
  focus: Readonly<{ lightness: number; chroma: number }>
  lighting: Readonly<{
    enabled: boolean
    direction: readonly [number, number, number]
    keyLightIntensity: number
    flatShadingMix: number
  }>
  geometryDetail: number
  size: PlanetVisualState['size']
  noise: PlanetVisualState['noise']
  bands: Readonly<PlanetVisualState['bands'] & {
    bandCount: number
    cutCount: number
  }>
  hues: readonly number[]
  color: Readonly<{
    pipelineVersion: string
    lMax: number
    huntGamma: number
    huntApplyMask: number
  }>
  material: Readonly<PlanetVisualState['material'] & { alpha: number }>
  bloom: PlanetVisualState['bloom']
}>

export type PlanetVisualBloomHandle = {
  applyParams(params: PerlinBloomParams): void
  readonly params: PerlinBloomParams
}

export type PlanetVisualRendererHandle = {
  apply(application: PlanetVisualApplication): void
  readAppliedState(): PlanetVisualAppliedSnapshot
}

export type PlanetVisualRenderResult = Readonly<{
  application: PlanetVisualApplication
  appliedSnapshot: PlanetVisualAppliedSnapshot
}>