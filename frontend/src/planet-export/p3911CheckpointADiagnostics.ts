import { p3911LegacyFrozenProfileVisualConfigHashInput } from '@/three/planetVisualDefaults'
import {
  renderP3911DiagnosticPlanetImage,
  type P3911LegacyPlanetRenderOptions,
  type PlanetRenderResult,
} from './renderPlanetImage'
import {
  P3911_LEGACY_FROZEN_PROFILE_FIXTURE,
  p39LegacyBloomOff,
  resolveP39LegacyPlanetVisualState,
} from './p39LegacyVisualState'
import { parsePlanetExportRequest, type PlanetExportRequest } from './request'

export const P3911_CHECKPOINT_A = {
  checkpoint: 'A',
  movieId: 157336,
  ratings: [0, 4, 5, 10] as const,
  keyCandidates: [0.35, 0.5, 0.65] as const,
  bloom: false,
  emission: { exponent: 3, intensityMin: 0.06, intensityMax: 0.6 },
} as const

export type P3911CheckpointARequest = PlanetExportRequest & { keyLightIntensity: number }

/** Strict offline request boundary; normal exporter requests reject its Key parameter. */
export function parseP3911CheckpointARequest(search: string): P3911CheckpointARequest {
  const params = new URLSearchParams(search)
  const values = params.getAll('p3911KeyLightIntensity')
  if (values.length !== 1) throw new Error('[P39.11 diagnostics] p3911KeyLightIntensity must appear exactly once')
  const text = values[0]!.trim()
  if (!/^(?:0|(?:[1-9]\d*|0)\.\d+|[1-9]\d*)$/.test(text)) {
    throw new Error('[P39.11 diagnostics] p3911KeyLightIntensity must be a finite non-negative decimal')
  }
  const keyLightIntensity = Number(text)
  assertP3911CheckpointAKeyLightIntensity(keyLightIntensity)
  if (!P3911_CHECKPOINT_A.keyCandidates.includes(keyLightIntensity as typeof P3911_CHECKPOINT_A.keyCandidates[number])) {
    throw new Error(`[P39.11 diagnostics] Key ${keyLightIntensity} is not a Checkpoint A candidate`)
  }
  params.delete('p3911KeyLightIntensity')
  const allowedKeys = new Set(['movieId', 'dataUrl', 'resolution', 'padding', 'bloom', 'sizeRoot', 'renderMode', 'bloomStrength'])
  for (const [name] of params) {
    if (!allowedKeys.has(name)) throw new Error(`[P39.11 diagnostics] unsupported request parameter ${name}`)
  }
  const request = parsePlanetExportRequest(`?${new URLSearchParams(params).toString()}`)
  if (request.movieId !== P3911_CHECKPOINT_A.movieId || request.bloom !== false || request.renderMode !== 'shader') {
    throw new Error('[P39.11 diagnostics] Checkpoint A requires TMDB 157336, Bloom OFF, and shader mode')
  }
  return { ...request, keyLightIntensity }
}

export function assertP3911CheckpointAKeyLightIntensity(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`[P39.11 diagnostics] key light intensity must be finite and non-negative; received ${value}`)
  }
}

/** Historical P39 evidence keeps its own curve; it no longer constrains production emission. */
export function assertP3911CheckpointAEmissionContract(): void {
  if (P3911_CHECKPOINT_A.emission.intensityMin > P3911_CHECKPOINT_A.emission.intensityMax) {
    throw new Error('[P39.11 diagnostics] Checkpoint A historical emission endpoints are inverted')
  }
}

/** P39.11-only hash input; normal website/exporter hashes do not use it. */
export function p3911CheckpointAVisualConfigInput(productionVisualConfig: string, keyLightIntensity: number): string {
  assertP3911CheckpointAKeyLightIntensity(keyLightIntensity)
  return JSON.stringify({ diagnostic: 'p39.11-checkpoint-a-fixed-key-v1', productionVisualConfig, keyLightIntensity })
}

export type P3911CheckpointAPlanetRenderOptions = P3911LegacyPlanetRenderOptions & { diagnosticsKeyLightIntensity: number }

/** Dedicated evidence adapter; canonical resolution owns historical power emission and renderer readback. */
export function renderP3911CheckpointAPlanetImage(options: P3911CheckpointAPlanetRenderOptions): PlanetRenderResult {
  const { diagnosticsKeyLightIntensity, bloom, renderMode } = options
  assertP3911CheckpointAKeyLightIntensity(diagnosticsKeyLightIntensity)
  if (bloom || renderMode !== 'shader') throw new Error('[P39.11 diagnostics] Checkpoint A requires Bloom OFF shader rendering')
  const historicalVisualHash = p3911CheckpointAVisualConfigInput(
    p3911LegacyFrozenProfileVisualConfigHashInput(false),
    diagnosticsKeyLightIntensity,
  )
  const visualConfig = resolveP39LegacyPlanetVisualState({
    evidenceIdentity: 'p39.11-checkpoint-a-fixed-key-v1',
    historicalVisualHash,
    historicalMetadata: {
      checkpoint: P3911_CHECKPOINT_A.checkpoint,
      keyLightIntensity: diagnosticsKeyLightIntensity,
    },
    bloom: p39LegacyBloomOff(),
    keyLightIntensity: diagnosticsKeyLightIntensity,
    emissionDerivation: {
      kind: 'legacy-power',
      modelVersion: 'vote-average-power-clamped-v1',
      exponent: P3911_CHECKPOINT_A.emission.exponent,
      intensityMin: P3911_CHECKPOINT_A.emission.intensityMin,
      intensityMax: P3911_CHECKPOINT_A.emission.intensityMax,
    },
  })
  return renderP3911DiagnosticPlanetImage({
    ...options,
    visualConfig,
    bloomParamsOverride: visualConfig.bloom,
    legacyProfileCompatibility: P3911_LEGACY_FROZEN_PROFILE_FIXTURE,
  })
}