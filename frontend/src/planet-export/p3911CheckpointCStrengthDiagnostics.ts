import { PERLIN_BLOOM_COMPOSITION, PERLIN_BLOOM_DEFAULTS, type PerlinBloomParams } from '@/three/perlinBloomContract'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import { parsePlanetExportRequest, type PlanetExportRequest } from './request'
import { renderP3911DiagnosticPlanetImage, type PlanetRenderOptions, type PlanetRenderResult } from './renderPlanetImage'

export const P3911_CHECKPOINT_C_STRENGTH = {
  checkpoint: 'C3-strength',
  movieId: 157336,
  ratings: [0, 4, 5, 10] as const,
  strengthCandidates: [0.0025, 0.005, 0.01] as const,
  bloom: { enabled: true, baselineStrength: 0.005, threshold: 0, radius: 1 },
  production: { keyLightIntensity: 0.45, emissionExponent: 2, intensityMin: 0.06, intensityMax: 0.6 },
  productionBloom: { enabled: true, strength: 0.01, radius: 1, threshold: 0 },
} as const

export type P3911CheckpointCStrengthRequest = PlanetExportRequest & { bloomStrength: number }

function parseStrength(text: string): number {
  if (!/^(?:0\.\d+|1(?:\.0+)?)$/.test(text)) throw new Error('[P39.11 diagnostics] p3911BloomStrength must be a finite decimal in (0, 1]')
  const strength = Number(text)
  if (!Number.isFinite(strength) || strength <= 0 || strength > 1) throw new Error('[P39.11 diagnostics] p3911BloomStrength must be finite and in (0, 1]')
  if (!P3911_CHECKPOINT_C_STRENGTH.strengthCandidates.includes(strength as typeof P3911_CHECKPOINT_C_STRENGTH.strengthCandidates[number])) {
    throw new Error(`[P39.11 diagnostics] Bloom strength ${strength} is not a Checkpoint C3 candidate`)
  }
  return strength
}

/** Strict strength-only offline boundary; standard pages and CLI reject this parameter. */
export function parseP3911CheckpointCStrengthRequest(search: string): P3911CheckpointCStrengthRequest {
  const params = new URLSearchParams(search)
  const values = params.getAll('p3911BloomStrength')
  if (values.length !== 1) throw new Error('[P39.11 diagnostics] p3911BloomStrength must appear exactly once')
  const text = values[0]!.trim()
  if (!text || text === 'null') throw new Error('[P39.11 diagnostics] p3911BloomStrength is required')
  const bloomStrength = parseStrength(text)
  params.delete('p3911BloomStrength')
  const allowedKeys = new Set(['movieId', 'dataUrl', 'resolution', 'padding', 'bloom', 'sizeRoot', 'renderMode'])
  for (const [name] of params) if (!allowedKeys.has(name)) throw new Error(`[P39.11 diagnostics] unsupported request parameter ${name}`)
  const request = parsePlanetExportRequest(`?${new URLSearchParams(params).toString()}`)
  if (request.movieId !== P3911_CHECKPOINT_C_STRENGTH.movieId || !request.bloom || request.renderMode !== 'shader') {
    throw new Error('[P39.11 diagnostics] Checkpoint C3 requires TMDB 157336, Bloom ON, and shader mode')
  }
  return { ...request, bloomStrength }
}

export function assertP3911CheckpointCStrengthProductionContract(): void {
  const emission = PLANET_VISUAL_DEFAULTS.focus.emission
  const bloom = PERLIN_BLOOM_DEFAULTS
  const expected = P3911_CHECKPOINT_C_STRENGTH
  const historicalBloom = p3911CheckpointCStrengthBloomParams(expected.bloom.baselineStrength)
  if (
    historicalBloom.enabled !== expected.bloom.enabled
    || historicalBloom.strength !== expected.bloom.baselineStrength
    || historicalBloom.radius !== expected.bloom.radius
    || historicalBloom.threshold !== expected.bloom.threshold
    || PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity !== expected.production.keyLightIntensity
    || emission.exponent !== expected.production.emissionExponent
    || emission.intensityMin !== expected.production.intensityMin
    || emission.intensityMax !== expected.production.intensityMax
    || bloom.enabled !== expected.productionBloom.enabled
    || bloom.strength !== expected.productionBloom.strength
    || bloom.radius !== expected.productionBloom.radius
    || bloom.threshold !== expected.productionBloom.threshold
  ) throw new Error('[P39.11 diagnostics] Checkpoint C3 requires its historical candidate matrix and the selected production Bloom defaults')
}

export function p3911CheckpointCStrengthBloomParams(strength: number): PerlinBloomParams {
  if (!P3911_CHECKPOINT_C_STRENGTH.strengthCandidates.includes(strength as typeof P3911_CHECKPOINT_C_STRENGTH.strengthCandidates[number])) {
    throw new Error(`[P39.11 diagnostics] Bloom strength ${strength} is not a Checkpoint C3 candidate`)
  }
  return { enabled: true, strength, radius: P3911_CHECKPOINT_C_STRENGTH.bloom.radius, threshold: P3911_CHECKPOINT_C_STRENGTH.bloom.threshold }
}

/** C3-only hash inputs: candidates embed strength; OFF stays an explicit reference contract. */
export function p3911CheckpointCStrengthVisualConfigInput(productionVisualConfig: string, strength: number): string {
  return JSON.stringify({ diagnostic: 'p39.11-checkpoint-c3-strength-pure-delta-v1', productionVisualConfig, bloom: p3911CheckpointCStrengthBloomParams(strength) })
}

export function p3911CheckpointCStrengthOffReferenceVisualConfigInput(productionVisualConfig: string): string {
  return JSON.stringify({ diagnostic: 'p39.11-checkpoint-c3-bloom-off-reference-v1', productionVisualConfig, bloom: { enabled: false, composition: PERLIN_BLOOM_COMPOSITION } })
}

/** Uses the shared P39.10 pure-delta renderer; this wrapper only fixes the C3 strength input. */
export function renderP3911CheckpointCStrengthPlanetImage(options: PlanetRenderOptions & { diagnosticsBloomStrength: number }): PlanetRenderResult {
  const params = p3911CheckpointCStrengthBloomParams(options.diagnosticsBloomStrength)
  if (!options.bloom || options.renderMode !== 'shader') throw new Error('[P39.11 diagnostics] Checkpoint C3 requires Bloom ON shader rendering')
  return renderP3911DiagnosticPlanetImage({ ...options, bloom: true, bloomParamsOverride: params })
}