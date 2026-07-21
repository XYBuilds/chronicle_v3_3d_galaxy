import { PERLIN_BLOOM_COMPOSITION, PERLIN_BLOOM_DEFAULTS, type PerlinBloomParams } from '@/three/perlinBloomContract'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import { parsePlanetExportRequest, type PlanetExportRequest } from './request'
import { renderP3911DiagnosticPlanetImage, type PlanetRenderOptions, type PlanetRenderResult } from './renderPlanetImage'

export const P3911_CHECKPOINT_C_THRESHOLD = {
  checkpoint: 'C1-threshold',
  movieId: 157336,
  ratings: [0, 4, 5, 10] as const,
  thresholdCandidates: [0, 0.05, 0.1] as const,
  bloom: { enabled: true, strength: 0.005, radius: 1 },
} as const

export type P3911CheckpointCThresholdRequest = PlanetExportRequest & { bloomThreshold: number }

function parseThreshold(text: string): number {
  if (!/^(?:0|0\.\d+)$/.test(text)) throw new Error('[P39.11 diagnostics] p3911BloomThreshold must be a finite non-negative decimal')
  const threshold = Number(text)
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('[P39.11 diagnostics] p3911BloomThreshold must be finite and non-negative')
  if (!P3911_CHECKPOINT_C_THRESHOLD.thresholdCandidates.includes(threshold as typeof P3911_CHECKPOINT_C_THRESHOLD.thresholdCandidates[number])) {
    throw new Error(`[P39.11 diagnostics] Bloom threshold ${threshold} is not a Checkpoint C1 candidate`)
  }
  return threshold
}

/** Strict threshold-only offline boundary; standard pages and CLI reject this parameter. */
export function parseP3911CheckpointCThresholdRequest(search: string): P3911CheckpointCThresholdRequest {
  const params = new URLSearchParams(search)
  const values = params.getAll('p3911BloomThreshold')
  if (values.length !== 1) throw new Error('[P39.11 diagnostics] p3911BloomThreshold must appear exactly once')
  const text = values[0]!.trim()
  if (!text || text === 'null') throw new Error('[P39.11 diagnostics] p3911BloomThreshold is required')
  const bloomThreshold = parseThreshold(text)
  params.delete('p3911BloomThreshold')
  const allowedKeys = new Set(['movieId', 'dataUrl', 'resolution', 'padding', 'bloom', 'sizeRoot', 'renderMode'])
  for (const [name] of params) if (!allowedKeys.has(name)) throw new Error(`[P39.11 diagnostics] unsupported request parameter ${name}`)
  const request = parsePlanetExportRequest(`?${new URLSearchParams(params).toString()}`)
  if (request.movieId !== P3911_CHECKPOINT_C_THRESHOLD.movieId || !request.bloom || request.renderMode !== 'shader') {
    throw new Error('[P39.11 diagnostics] Checkpoint C1 requires TMDB 157336, Bloom ON, and shader mode')
  }
  return { ...request, bloomThreshold }
}

export function assertP3911CheckpointCThresholdProductionContract(): void {
  const bloom = PERLIN_BLOOM_DEFAULTS
  const expected = P3911_CHECKPOINT_C_THRESHOLD
  const historicalBloom = p3911CheckpointCThresholdBloomParams(0)
  const productionBloom = PLANET_VISUAL_DEFAULTS.focus.bloom
  if (
    historicalBloom.enabled !== expected.bloom.enabled
    || historicalBloom.strength !== expected.bloom.strength
    || historicalBloom.radius !== expected.bloom.radius
    || historicalBloom.threshold !== 0
    || bloom.enabled !== productionBloom.enabled
    || bloom.strength !== productionBloom.strength
    || bloom.radius !== productionBloom.radius
    || bloom.threshold !== productionBloom.threshold
  ) throw new Error('[P39.11 diagnostics] Checkpoint C1 historical Bloom or production Bloom contract is invalid')
}

export function p3911CheckpointCThresholdBloomParams(threshold: number): PerlinBloomParams {
  if (!P3911_CHECKPOINT_C_THRESHOLD.thresholdCandidates.includes(threshold as typeof P3911_CHECKPOINT_C_THRESHOLD.thresholdCandidates[number])) {
    throw new Error(`[P39.11 diagnostics] Bloom threshold ${threshold} is not a Checkpoint C1 candidate`)
  }
  return { enabled: true, strength: P3911_CHECKPOINT_C_THRESHOLD.bloom.strength, radius: P3911_CHECKPOINT_C_THRESHOLD.bloom.radius, threshold }
}

/** C1-only hash inputs: candidates embed threshold; OFF stays an explicit reference contract. */
export function p3911CheckpointCThresholdVisualConfigInput(productionVisualConfig: string, threshold: number): string {
  return JSON.stringify({ diagnostic: 'p39.11-checkpoint-c1-threshold-pure-delta-v1', productionVisualConfig, bloom: p3911CheckpointCThresholdBloomParams(threshold) })
}

export function p3911CheckpointCOffReferenceVisualConfigInput(productionVisualConfig: string): string {
  return JSON.stringify({ diagnostic: 'p39.11-checkpoint-c1-bloom-off-reference-v1', productionVisualConfig, bloom: { enabled: false, composition: PERLIN_BLOOM_COMPOSITION } })
}

/** Uses the shared P39.10 pure-delta renderer; this wrapper only fixes the C1 threshold input. */
export function renderP3911CheckpointCThresholdPlanetImage(options: PlanetRenderOptions & { diagnosticsBloomThreshold: number }): PlanetRenderResult {
  const params = p3911CheckpointCThresholdBloomParams(options.diagnosticsBloomThreshold)
  if (!options.bloom || options.renderMode !== 'shader') throw new Error('[P39.11 diagnostics] Checkpoint C1 requires Bloom ON shader rendering')
  return renderP3911DiagnosticPlanetImage({ ...options, bloom: true, bloomParamsOverride: params })
}