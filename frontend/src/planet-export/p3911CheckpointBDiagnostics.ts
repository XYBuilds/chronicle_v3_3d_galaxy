import * as THREE from 'three'

import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import {
  capturePlanetRenderDiagnostics,
  positionExportCamera,
  prepareExportPlanet,
  type PlanetRenderDiagnostics,
  type PlanetRenderOptions,
  type PlanetRenderResult,
} from './renderPlanetImage'
import { parsePlanetExportRequest, type PlanetExportRequest } from './request'
import { computeOrthographicHalfExtent } from './sizing'

export const P3911_CHECKPOINT_B = {
  checkpoint: 'B',
  movieId: 157336,
  keyLightIntensity: 0.45,
  ratings: [0, 4, 5, 10] as const,
  emissionExponentCandidates: [3, 2.5, 2] as const,
  bloom: false,
  emission: { intensityMin: 0.06, intensityMax: 0.6 },
  diagnosticModelVersion: 'p39.11-checkpoint-b-emission-exponent-v1',
} as const

export type P3911CheckpointBRequest = PlanetExportRequest & { emissionExponent: number }

function parseCandidateExponent(text: string): number {
  if (!/^(?:[1-9]\d*|[1-9]\d*\.\d+)$/.test(text)) {
    throw new Error('[P39.11 diagnostics] p3911EmissionExponent must be a finite positive decimal')
  }
  const exponent = Number(text)
  if (!Number.isFinite(exponent) || exponent <= 0) {
    throw new Error('[P39.11 diagnostics] p3911EmissionExponent must be finite and positive')
  }
  if (!P3911_CHECKPOINT_B.emissionExponentCandidates.includes(exponent as typeof P3911_CHECKPOINT_B.emissionExponentCandidates[number])) {
    throw new Error(`[P39.11 diagnostics] emission exponent ${exponent} is not a Checkpoint B candidate`)
  }
  return exponent
}

/** Strict offline request boundary; normal exporter requests reject its exponent parameter. */
export function parseP3911CheckpointBRequest(search: string): P3911CheckpointBRequest {
  const params = new URLSearchParams(search)
  const values = params.getAll('p3911EmissionExponent')
  if (values.length !== 1) throw new Error('[P39.11 diagnostics] p3911EmissionExponent must appear exactly once')
  const text = values[0]!.trim()
  if (!text || text === 'null') throw new Error('[P39.11 diagnostics] p3911EmissionExponent is required')
  const emissionExponent = parseCandidateExponent(text)
  params.delete('p3911EmissionExponent')
  const allowedKeys = new Set(['movieId', 'dataUrl', 'resolution', 'padding', 'bloom', 'sizeRoot', 'renderMode', 'bloomStrength'])
  for (const [name] of params) {
    if (!allowedKeys.has(name)) throw new Error(`[P39.11 diagnostics] unsupported request parameter ${name}`)
  }
  const request = parsePlanetExportRequest(`?${new URLSearchParams(params).toString()}`)
  if (request.movieId !== P3911_CHECKPOINT_B.movieId || request.bloom !== false || request.renderMode !== 'shader') {
    throw new Error('[P39.11 diagnostics] Checkpoint B requires TMDB 157336, Bloom OFF, and shader mode')
  }
  return { ...request, emissionExponent }
}

/** Historical P39 evidence keeps its own fixed Key; production visuals are independent. */
export function assertP3911CheckpointBProductionContract(): void {
  if (
    !Number.isFinite(P3911_CHECKPOINT_B.keyLightIntensity)
    || P3911_CHECKPOINT_B.keyLightIntensity < 0
    || !Number.isFinite(PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity)
    || PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity < 0
  ) {
    throw new Error('[P39.11 diagnostics] Checkpoint B and production Key values must be finite and non-negative')
  }
}

export function p3911CheckpointBEmissionForRating(rating: number, exponent: number): number {
  if (!Number.isFinite(rating)) throw new Error('[P39.11 diagnostics] rating must be finite')
  if (!P3911_CHECKPOINT_B.emissionExponentCandidates.includes(exponent as typeof P3911_CHECKPOINT_B.emissionExponentCandidates[number])) {
    throw new Error(`[P39.11 diagnostics] emission exponent ${exponent} is not a Checkpoint B candidate`)
  }
  const clampedRating = Math.min(10, Math.max(0, rating))
  return P3911_CHECKPOINT_B.emission.intensityMin
    + Math.pow(clampedRating / 10, exponent)
      * (P3911_CHECKPOINT_B.emission.intensityMax - P3911_CHECKPOINT_B.emission.intensityMin)
}

/** P39.11-only hash input; normal website/exporter hashes only production defaults. */
export function p3911CheckpointBVisualConfigInput(productionVisualConfig: string, emissionExponent: number): string {
  if (!P3911_CHECKPOINT_B.emissionExponentCandidates.includes(emissionExponent as typeof P3911_CHECKPOINT_B.emissionExponentCandidates[number])) {
    throw new Error(`[P39.11 diagnostics] emission exponent ${emissionExponent} is not a Checkpoint B candidate`)
  }
  return JSON.stringify({
    diagnostic: 'p39.11-checkpoint-b-fixed-key-emission-exponent-v1',
    productionVisualConfig,
    keyLightIntensity: P3911_CHECKPOINT_B.keyLightIntensity,
    emissionExponent,
  })
}

export type P3911CheckpointBPlanetRenderOptions = PlanetRenderOptions & { diagnosticsEmissionExponent: number }

function checkpointBDiagnostics(
  captured: PlanetRenderDiagnostics,
  emissionExponent: number,
  emission: number,
): PlanetRenderDiagnostics {
  return {
    ...captured,
    emission,
    emission_curve: {
      model_version: P3911_CHECKPOINT_B.diagnosticModelVersion,
      exponent: emissionExponent,
      intensity_min: P3911_CHECKPOINT_B.emission.intensityMin,
      intensity_max: P3911_CHECKPOINT_B.emission.intensityMax,
    },
  }
}

/** Dedicated evidence renderer; it changes only offline Key/emission uniforms after shared construction. */
export function renderP3911CheckpointBPlanetImage(options: P3911CheckpointBPlanetRenderOptions): PlanetRenderResult {
  const { diagnosticsEmissionExponent, canvas, movie, meta, globalRadius, resolution, padding, bloom, renderMode, sizeRoot } = options
  if (bloom || renderMode !== 'shader') throw new Error('[P39.11 diagnostics] Checkpoint B requires Bloom OFF shader rendering')
  const emission = p3911CheckpointBEmissionForRating(movie.vote_average, diagnosticsEmissionExponent)
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(resolution, resolution, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = true
  const scene = new THREE.Scene()
  const half = computeOrthographicHalfExtent(globalRadius, padding)
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, half * 4)
  positionExportCamera(camera, half)
  const planet = prepareExportPlanet(movie, meta, renderMode, sizeRoot)
  planet.material.uniforms.uKeyLightIntensity.value = P3911_CHECKPOINT_B.keyLightIntensity
  planet.material.uniforms.uEmissionIntensity.value = emission
  const captured = capturePlanetRenderDiagnostics(movie, planet, camera, options)
  const diagnostics = checkpointBDiagnostics(captured, diagnosticsEmissionExponent, emission)
  scene.add(planet.mesh)
  renderer.render(scene, camera)
  console.assert(planet.mesh.visible, '[P39.11 diagnostics] planet must be visible before rendering')
  return { renderer, visible: planet.mesh.visible, renderMode, diagnostics }
}