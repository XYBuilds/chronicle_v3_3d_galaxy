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

export function assertP3911CheckpointAEmissionContract(): void {
  const emission = PLANET_VISUAL_DEFAULTS.focus.emission
  if (emission.intensityMin !== P3911_CHECKPOINT_A.emission.intensityMin || emission.intensityMax !== P3911_CHECKPOINT_A.emission.intensityMax) {
    throw new Error('[P39.11 diagnostics] Checkpoint A requires historical 0.06–0.60 emission endpoints')
  }
}

/** P39.11-only hash input; normal website/exporter hashes do not use it. */
export function p3911CheckpointAVisualConfigInput(productionVisualConfig: string, keyLightIntensity: number): string {
  assertP3911CheckpointAKeyLightIntensity(keyLightIntensity)
  return JSON.stringify({ diagnostic: 'p39.11-checkpoint-a-fixed-key-v1', productionVisualConfig, keyLightIntensity })
}

export type P3911CheckpointAPlanetRenderOptions = PlanetRenderOptions & { diagnosticsKeyLightIntensity: number }

/**
 * Dedicated evidence renderer. It begins with shared planet construction, then
 * adjusts Key only in this offline P39.11 module; normal render entry points
 * never import this boundary.
 */
export function renderP3911CheckpointAPlanetImage(options: P3911CheckpointAPlanetRenderOptions): PlanetRenderResult {
  const { diagnosticsKeyLightIntensity, canvas, movie, meta, globalRadius, resolution, padding, bloom, renderMode, sizeRoot } = options
  assertP3911CheckpointAKeyLightIntensity(diagnosticsKeyLightIntensity)
  if (bloom || renderMode !== 'shader') throw new Error('[P39.11 diagnostics] Checkpoint A requires Bloom OFF shader rendering')
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
  const historicalEmission = P3911_CHECKPOINT_A.emission.intensityMin
    + Math.pow(Math.min(10, Math.max(0, movie.vote_average)) / 10, P3911_CHECKPOINT_A.emission.exponent)
      * (P3911_CHECKPOINT_A.emission.intensityMax - P3911_CHECKPOINT_A.emission.intensityMin)
  planet.material.uniforms.uKeyLightIntensity.value = diagnosticsKeyLightIntensity
  planet.material.uniforms.uEmissionIntensity.value = historicalEmission
  const captured = capturePlanetRenderDiagnostics(movie, planet, camera, options)
  const diagnostics: PlanetRenderDiagnostics = {
    ...captured,
    emission: historicalEmission,
    emission_curve: {
      model_version: 'vote-average-power-clamped-v1',
      exponent: P3911_CHECKPOINT_A.emission.exponent,
      intensity_min: P3911_CHECKPOINT_A.emission.intensityMin,
      intensity_max: P3911_CHECKPOINT_A.emission.intensityMax,
    },
  }
  scene.add(planet.mesh)
  renderer.render(scene, camera)
  console.assert(planet.mesh.visible, '[P39.11 diagnostics] planet must be visible before rendering')
  return { renderer, visible: planet.mesh.visible, renderMode, diagnostics }
}