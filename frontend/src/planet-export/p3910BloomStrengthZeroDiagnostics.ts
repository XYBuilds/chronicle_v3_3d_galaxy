import { PERLIN_BLOOM_COMPOSITION, type PerlinBloomParams } from '@/three/perlinBloomContract'
import { p3911LegacyFrozenProfileVisualConfigHashInput } from '@/three/planetVisualDefaults'
import { parsePlanetExportRequest, type PlanetExportRequest } from './request'
import { renderP3911DiagnosticPlanetImage, type P3911LegacyPlanetRenderOptions, type PlanetRenderResult } from './renderPlanetImage'
import { planetExportVisualConfigInput } from './visualConfig'
import {
  P3911_LEGACY_FROZEN_PROFILE_FIXTURE,
  resolveP39LegacyPlanetVisualState,
} from './p39LegacyVisualState'

export const P3910_BLOOM_STRENGTH_ZERO = 0 as const
export const P3910_BLOOM_STRENGTH_ZERO_PARAM = 'p3910BloomStrengthZero' as const

export type P3910BloomStrengthZeroRequest = PlanetExportRequest & {
  bloomStrengthZero: typeof P3910_BLOOM_STRENGTH_ZERO
}

const allowedRequestKeys = new Set(['movieId', 'dataUrl', 'resolution', 'padding', 'bloom', 'sizeRoot', 'renderMode', P3910_BLOOM_STRENGTH_ZERO_PARAM])

/** Dedicated P39.10 evidence URL; normal planet-export requests never accept this parameter. */
export function parseP3910BloomStrengthZeroRequest(search: string): P3910BloomStrengthZeroRequest {
  const params = new URLSearchParams(search)
  const values = params.getAll(P3910_BLOOM_STRENGTH_ZERO_PARAM)
  if (values.length !== 1 || values[0]?.trim() !== '0') {
    throw new Error(`[P39.10 diagnostics] ${P3910_BLOOM_STRENGTH_ZERO_PARAM} must appear exactly once with value 0`)
  }
  params.delete(P3910_BLOOM_STRENGTH_ZERO_PARAM)
  for (const [name] of params) {
    if (!allowedRequestKeys.has(name)) throw new Error(`[P39.10 diagnostics] unsupported request parameter ${name}`)
  }
  const request = parsePlanetExportRequest(`?${params.toString()}`)
  if (request.movieId !== 157336 || !request.bloom || request.renderMode !== 'shader') {
    throw new Error('[P39.10 diagnostics] strength-zero proof requires TMDB 157336, Bloom ON, and shader mode')
  }
  return { ...request, bloomStrengthZero: P3910_BLOOM_STRENGTH_ZERO }
}

export function p3910BloomStrengthZeroParams(): PerlinBloomParams {
  return { enabled: true, strength: P3910_BLOOM_STRENGTH_ZERO, radius: 1, threshold: 0 }
}

/** P39.10-only visual input; the production SSOT remains untouched. */
export function p3910BloomStrengthZeroVisualConfigInput(productionVisualConfig: string): string {
  return JSON.stringify({
    diagnostic: 'p39.10-bloom-on-strength-zero-pure-delta-v1',
    productionVisualConfig,
    bloom: { ...p3910BloomStrengthZeroParams(), composition: PERLIN_BLOOM_COMPOSITION },
  })
}

export function p3910ProductionVisualConfigInput(sizeRoot: P3911LegacyPlanetRenderOptions['sizeRoot']): string {
  return planetExportVisualConfigInput(p3911LegacyFrozenProfileVisualConfigHashInput(), sizeRoot)
}

/** Dedicated historical adapter; canonical resolution owns power emission and renderer readback. */
export function renderP3910BloomStrengthZeroPlanetImage(options: P3911LegacyPlanetRenderOptions): PlanetRenderResult {
  if (!options.bloom || options.renderMode !== 'shader') {
    throw new Error('[P39.10 diagnostics] strength-zero proof requires Bloom ON shader rendering')
  }
  const bloom = p3910BloomStrengthZeroParams()
  const visualConfig = resolveP39LegacyPlanetVisualState({
    evidenceIdentity: 'p39.10-bloom-on-strength-zero-pure-delta-v1',
    historicalVisualHash: p3910BloomStrengthZeroVisualConfigInput(
      p3910ProductionVisualConfigInput(options.sizeRoot),
    ),
    historicalMetadata: {
      checkpoint: 'P39.10',
      bloomStrength: P3910_BLOOM_STRENGTH_ZERO,
    },
    bloom,
  })
  return renderP3911DiagnosticPlanetImage({
    ...options,
    visualConfig,
    bloomParamsOverride: bloom,
    legacyProfileCompatibility: P3911_LEGACY_FROZEN_PROFILE_FIXTURE,
  })
}