import { PERLIN_BLOOM_COMPOSITION, PERLIN_BLOOM_DEFAULTS, type PerlinBloomParams } from '@/three/perlinBloomContract'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import { parsePlanetExportRequest, type PlanetExportRequest } from './request'
import { renderP3911DiagnosticPlanetImage, type PlanetRenderOptions, type PlanetRenderResult } from './renderPlanetImage'

export const P3911_CHECKPOINT_C_RADIUS = {
  checkpoint: 'C2-radius',
  movieId: 157336,
  ratings: [0, 4, 5, 10] as const,
  radiusCandidates: [0, 0.5, 1] as const,
  bloom: { enabled: true, strength: 0.005, threshold: 0, baselineRadius: 1 },
  production: { keyLightIntensity: 0.45, emissionExponent: 2, intensityMin: 0.06, intensityMax: 0.6 },
  productionBloom: { enabled: true, strength: 0.01, radius: 1, threshold: 0 },
} as const

export type P3911CheckpointCRadiusRequest = PlanetExportRequest & { bloomRadius: number }

function parseRadius(text: string): number {
  if (!/^(?:0|1|0\.\d+)$/.test(text)) throw new Error('[P39.11 diagnostics] p3911BloomRadius must be a finite decimal in [0, 1]')
  const radius = Number(text)
  if (!Number.isFinite(radius) || radius < 0 || radius > 1) throw new Error('[P39.11 diagnostics] p3911BloomRadius must be finite and in [0, 1]')
  if (!P3911_CHECKPOINT_C_RADIUS.radiusCandidates.includes(radius as typeof P3911_CHECKPOINT_C_RADIUS.radiusCandidates[number])) {
    throw new Error(`[P39.11 diagnostics] Bloom radius ${radius} is not a Checkpoint C2 candidate`)
  }
  return radius
}

/** Strict radius-only offline boundary; standard pages and CLI reject this parameter. */
export function parseP3911CheckpointCRadiusRequest(search: string): P3911CheckpointCRadiusRequest {
  const params = new URLSearchParams(search)
  const values = params.getAll('p3911BloomRadius')
  if (values.length !== 1) throw new Error('[P39.11 diagnostics] p3911BloomRadius must appear exactly once')
  const text = values[0]!.trim()
  if (!text || text === 'null') throw new Error('[P39.11 diagnostics] p3911BloomRadius is required')
  const bloomRadius = parseRadius(text)
  params.delete('p3911BloomRadius')
  const allowedKeys = new Set(['movieId', 'dataUrl', 'resolution', 'padding', 'bloom', 'sizeRoot', 'renderMode'])
  for (const [name] of params) if (!allowedKeys.has(name)) throw new Error(`[P39.11 diagnostics] unsupported request parameter ${name}`)
  const request = parsePlanetExportRequest(`?${new URLSearchParams(params).toString()}`)
  if (request.movieId !== P3911_CHECKPOINT_C_RADIUS.movieId || !request.bloom || request.renderMode !== 'shader') {
    throw new Error('[P39.11 diagnostics] Checkpoint C2 requires TMDB 157336, Bloom ON, and shader mode')
  }
  return { ...request, bloomRadius }
}

export function assertP3911CheckpointCRadiusProductionContract(): void {
  const bloom = PERLIN_BLOOM_DEFAULTS
  const expected = P3911_CHECKPOINT_C_RADIUS
  const historicalBloom = p3911CheckpointCRadiusBloomParams(expected.bloom.baselineRadius)
  if (
    historicalBloom.enabled !== expected.bloom.enabled
    || historicalBloom.strength !== expected.bloom.strength
    || historicalBloom.radius !== expected.bloom.baselineRadius
    || historicalBloom.threshold !== expected.bloom.threshold
    || PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity !== expected.production.keyLightIntensity
    || bloom.enabled !== expected.productionBloom.enabled
    || bloom.strength !== expected.productionBloom.strength
    || bloom.radius !== expected.productionBloom.radius
    || bloom.threshold !== expected.productionBloom.threshold
  ) throw new Error('[P39.11 diagnostics] Checkpoint C2 requires its historical fixed Bloom value and the selected production Bloom defaults')
}

export function p3911CheckpointCRadiusBloomParams(radius: number): PerlinBloomParams {
  if (!P3911_CHECKPOINT_C_RADIUS.radiusCandidates.includes(radius as typeof P3911_CHECKPOINT_C_RADIUS.radiusCandidates[number])) {
    throw new Error(`[P39.11 diagnostics] Bloom radius ${radius} is not a Checkpoint C2 candidate`)
  }
  return { enabled: true, strength: P3911_CHECKPOINT_C_RADIUS.bloom.strength, radius, threshold: P3911_CHECKPOINT_C_RADIUS.bloom.threshold }
}

/** C2-only hash inputs: candidates embed radius; OFF stays an explicit reference contract. */
export function p3911CheckpointCRadiusVisualConfigInput(productionVisualConfig: string, radius: number): string {
  return JSON.stringify({ diagnostic: 'p39.11-checkpoint-c2-radius-pure-delta-v1', productionVisualConfig, bloom: p3911CheckpointCRadiusBloomParams(radius) })
}

export function p3911CheckpointCRadiusOffReferenceVisualConfigInput(productionVisualConfig: string): string {
  return JSON.stringify({ diagnostic: 'p39.11-checkpoint-c2-bloom-off-reference-v1', productionVisualConfig, bloom: { enabled: false, composition: PERLIN_BLOOM_COMPOSITION } })
}

/** Uses the shared P39.10 pure-delta renderer; this wrapper only fixes the C2 radius input. */
export function renderP3911CheckpointCRadiusPlanetImage(options: PlanetRenderOptions & { diagnosticsBloomRadius: number }): PlanetRenderResult {
  const params = p3911CheckpointCRadiusBloomParams(options.diagnosticsBloomRadius)
  if (!options.bloom || options.renderMode !== 'shader') throw new Error('[P39.11 diagnostics] Checkpoint C2 requires Bloom ON shader rendering')
  return renderP3911DiagnosticPlanetImage({ ...options, bloom: true, bloomParamsOverride: params })
}