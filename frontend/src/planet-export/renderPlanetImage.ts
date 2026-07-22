import { productionPlanetBloomParams } from '@/three/planetVisualDefaults'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '@/three/productionFocusEmissionProfile'
import type { ResolvedPlanetVisualConfig } from './visualConfig'
import * as THREE from 'three'
import {
  PERLIN_BLOOM_COMPOSITION,
  PERLIN_BLOOM_LAYER,
  createPerlinBloomDeltaCompositor,
  type PerlinBloomParams,
  validatePerlinBloomParams,
  withCameraLayer,
} from '@/three/perlinBloomContract'
import { focusEmissionIntensityFromProfile, type RatingMidrankCdfLutProfile } from '@/three/focusEmission'
import type { FocusEmissionProfileProvenance } from '@/types/galaxy'
import { createSelectionPlanet, type SelectionPlanetHandle } from '@/three/planet'
import { planetNoiseSeed } from '@/three/planetAppearance'
import {
  PHASE41_DIAGNOSTIC_MARKER,
  type Phase41EmissionCurve,
  type Phase41RenderOverride,
} from './phase41DiagnosticProfile'
import { selectionPlanetRotationAxisForMovie } from '@/three/selectionPlanetRotation'
import type { Meta, Movie } from '@/types/galaxy'
import { computeExportWorldRadius, computeOrthographicHalfExtent } from './sizing'
import type { PlanetExportRenderMode } from './request'

type PlanetRenderBaseOptions = {
  canvas: HTMLCanvasElement
  movie: Movie
  meta: Meta
  globalRadius: number
  resolution: number
  padding: number
  bloom: boolean
  renderMode: PlanetExportRenderMode
  sizeRoot: 2 | 3 | 4
}

/** Production boundary: renderer-owned visual config is mandatory and supplies the active curve. */
export type PlanetRenderOptions = PlanetRenderBaseOptions & {
  visualConfig: ResolvedPlanetVisualConfig
}

/** Explicit historical P39 compatibility input. Never use for production/browser export. */
export type P3911LegacyPlanetRenderOptions = PlanetRenderBaseOptions & {
  visualConfig?: ResolvedPlanetVisualConfig
  emissionProfile?: RatingMidrankCdfLutProfile
  emissionProfileProvenance?: FocusEmissionProfileProvenance
  emissionProfileSource?: 'active' | 'legacy-fallback' | 'diagnostic-override'
}

export type Phase41DiagnosticPlanetRenderOptions = PlanetRenderBaseOptions & {
  visualConfig: ResolvedPlanetVisualConfig
  diagnostic_only: typeof PHASE41_DIAGNOSTIC_MARKER
  diagnosticOverride: Phase41RenderOverride
  bloomParamsOverride: PerlinBloomParams
}

type OfflineDiagnosticPlanetRenderOptions = P3911LegacyPlanetRenderOptions & {
  bloomParamsOverride?: PerlinBloomParams
}

export type PlanetRenderDiagnostics = {
  movie_id: number
  genres: string[]
  rating: number
  band_count: number
  world_radius: number
  outer_radius: number
  size_root: 2 | 3 | 4
  padding: number
  emission: number
  emission_curve:
    | {
      model_version: 'vote-average-power-clamped-v1'
      exponent: number
      intensity_min: number
      intensity_max: number
    }
    | {
      model_version: 'vote-average-anchored-smoothstep-v1'
      rating_low_anchor: number
      rating_high_anchor: number
      intensity_min: number
      intensity_max: number
    }
    | {
      model_version: 'rating-midrank-cdf-lut-v1'
      rating_min: number
      rating_max: number
      sample_step: number
      sample_count: number
      intensity_min: number
      intensity_max: number
    }
    | {
      model_version: 'p39.11-checkpoint-b-emission-exponent-v1'
      exponent: number
      intensity_min: number
      intensity_max: number
    }
  visual_config_payload?: ResolvedPlanetVisualConfig['payload']
  visual_config_hash_input?: string
  profile_provenance?: FocusEmissionProfileProvenance & { source: 'active' | 'legacy-fallback' | 'diagnostic-override' }
  fixed_lightness: number
  fixed_chroma: number
  bloom: {
    enabled: boolean
    composition: typeof PERLIN_BLOOM_COMPOSITION
    strength: number
    radius: number
    threshold: number
  }
  key_light: {
    enabled: boolean
    direction: [number, number, number]
    intensity: number
    flat_shading_mix: number
  }
  noise: {
    seed: number
    scale: number
    octaves: number
    persistence: number
  }
  rotation: {
    base_quaternion: [number, number, number, number]
    seeded_spin_axis_world: [number, number, number]
    revs_per_sec: number
  }
  camera: {
    projection: 'orthographic'
    position: [number, number, number]
    quaternion: [number, number, number, number]
    direction: [number, number, number]
    left: number
    right: number
    top: number
    bottom: number
    near: number
    far: number
  }
}

export type PlanetRenderResult = {
  renderer: THREE.WebGLRenderer
  visible: boolean
  renderMode: PlanetExportRenderMode
  diagnostics: PlanetRenderDiagnostics
}

function serializableNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`[PlanetExport] ${label} must be finite`)
  return Object.is(value, -0) ? 0 : value
}

function vectorTuple(vector: THREE.Vector3, label: string): [number, number, number] {
  return [
    serializableNumber(vector.x, `${label}[0]`),
    serializableNumber(vector.y, `${label}[1]`),
    serializableNumber(vector.z, `${label}[2]`),
  ]
}

function quaternionTuple(quaternion: THREE.Quaternion, label: string): [number, number, number, number] {
  return [serializableNumber(quaternion.x, `${label}[0]`), serializableNumber(quaternion.y, `${label}[1]`), serializableNumber(quaternion.z, `${label}[2]`), serializableNumber(quaternion.w, `${label}[3]`)]
}

function diagnosticsEmissionCurve(curve: Phase41EmissionCurve): PlanetRenderDiagnostics['emission_curve'] {
  if (curve.modelVersion === 'rating-midrank-cdf-lut-v1') {
    return {
      model_version: curve.modelVersion,
      rating_min: serializableNumber(curve.ratingMin, 'emission rating minimum'),
      rating_max: serializableNumber(curve.ratingMax, 'emission rating maximum'),
      sample_step: serializableNumber(curve.sampleStep, 'emission sample step'),
      sample_count: curve.samples.length,
      intensity_min: serializableNumber(curve.intensityMin, 'emission minimum'),
      intensity_max: serializableNumber(curve.intensityMax, 'emission maximum'),
    }
  }
  return {
    model_version: curve.modelVersion,
    rating_low_anchor: serializableNumber(curve.ratingLowAnchor, 'emission low anchor'),
    rating_high_anchor: serializableNumber(curve.ratingHighAnchor, 'emission high anchor'),
    intensity_min: serializableNumber(curve.intensityMin, 'emission minimum'),
    intensity_max: serializableNumber(curve.intensityMax, 'emission maximum'),
  }
}

function positive(value: number, label: string): number {
  const result = serializableNumber(value, label)
  if (result <= 0) throw new Error(`[PlanetExport] ${label} must be > 0`)
  return result
}

export function capturePlanetRenderDiagnostics(
  movie: Movie,
  planet: SelectionPlanetHandle,
  camera: THREE.OrthographicCamera,
  options: Pick<P3911LegacyPlanetRenderOptions, 'sizeRoot' | 'padding' | 'emissionProfileProvenance' | 'emissionProfileSource' | 'visualConfig'> & { bloomParamsOverride?: PerlinBloomParams; bloom?: boolean; emissionCurveOverride?: Phase41EmissionCurve },
): PlanetRenderDiagnostics {
  if (!Number.isSafeInteger(movie.id) || movie.id <= 0) {
    throw new Error('[PlanetExport] movie id must be a positive integer')
  }
  if (!Array.isArray(movie.genres) || movie.genres.some((genre) => typeof genre !== 'string')) {
    throw new Error('[PlanetExport] genres must be strings')
  }
  if (options.sizeRoot !== 2 && options.sizeRoot !== 3 && options.sizeRoot !== 4) {
    throw new Error('[PlanetExport] size root must be 2, 3, or 4')
  }
  if (!Number.isFinite(options.padding) || options.padding < 0 || options.padding >= 0.5) {
    throw new Error('[PlanetExport] padding must be in [0, 0.5)')
  }

  const appearance = planet.lastAppearance
  if (!appearance) throw new Error('[PlanetExport] planet appearance must be resolved before diagnostics')
  const bloomParams = validatePerlinBloomParams(options.bloomParamsOverride ?? productionPlanetBloomParams(options.bloom))
  const scale = planet.mesh.scale
  const worldRadius = positive(scale.x, 'world radius')
  if (scale.y !== scale.x || scale.z !== scale.x) {
    throw new Error('[PlanetExport] mesh scale must be uniform')
  }
  const outerRadius = positive(planet.lastRadius, 'outer radius')
  if (outerRadius < worldRadius) {
    throw new Error('[PlanetExport] outer radius must cover world radius')
  }

  const uniforms = planet.material.uniforms
  const bandCount = uniforms.uBandCount.value as number
  if (!Number.isSafeInteger(bandCount) || bandCount < 1 || bandCount > 8) {
    throw new Error('[PlanetExport] band count must be an integer in [1, 8]')
  }
  const lightingEnabled = uniforms.uLightingEnabled.value as number
  if (lightingEnabled !== 0 && lightingEnabled !== 1) {
    throw new Error('[PlanetExport] lighting enabled must be 0 or 1')
  }
  const noiseOctaves = uniforms.uOctaves.value as number
  if (!Number.isSafeInteger(noiseOctaves) || noiseOctaves <= 0) {
    throw new Error('[PlanetExport] noise octaves must be a positive integer')
  }
  const noiseSeed = planetNoiseSeed(movie.id)
  if (!Number.isSafeInteger(noiseSeed) || noiseSeed < 0) {
    throw new Error('[PlanetExport] noise seed must be a non-negative integer')
  }

  const cameraValues = [camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far]
  if (
    cameraValues.some((value) => !Number.isFinite(value))
    || camera.left >= camera.right
    || camera.bottom >= camera.top
    || camera.near <= 0
    || camera.far <= camera.near
  ) {
    throw new Error('[PlanetExport] invalid orthographic camera frustum')
  }

  const rotation = selectionPlanetRotationAxisForMovie(movie.id)
  const lightDirection = uniforms.uLightDir.value as THREE.Vector3
  const cameraDirection = camera.getWorldDirection(new THREE.Vector3())
  return {
    movie_id: movie.id,
    genres: [...movie.genres],
    rating: serializableNumber(movie.vote_average, 'rating'),
    band_count: bandCount,
    world_radius: worldRadius,
    outer_radius: outerRadius,
    size_root: options.sizeRoot,
    padding: serializableNumber(options.padding, 'padding'),
    emission: serializableNumber(uniforms.uEmissionIntensity.value as number, 'emission'),
    emission_curve: diagnosticsEmissionCurve(options.emissionCurveOverride ?? options.visualConfig?.curve ?? appearance.emissionCurve),
    ...(options.visualConfig === undefined ? {} : {
      visual_config_payload: options.visualConfig.payload,
      visual_config_hash_input: options.visualConfig.hashInput,
    }),
    ...((options.visualConfig ?? (options.emissionProfileProvenance === undefined || options.emissionProfileSource === undefined
      ? undefined
      : { emissionProvenance: options.emissionProfileProvenance, emissionSource: options.emissionProfileSource })) === undefined
      ? {}
      : { profile_provenance: (() => {
        const resolved = options.visualConfig ?? { emissionProvenance: options.emissionProfileProvenance!, emissionSource: options.emissionProfileSource! }
        return { ...resolved.emissionProvenance, source: resolved.emissionSource }
      })() }),
    fixed_lightness: serializableNumber(uniforms.uPerlinL.value as number, 'lightness'),
    fixed_chroma: serializableNumber(uniforms.uPerlinChroma.value as number, 'chroma'),
    bloom: {
      enabled: options.bloom ?? false,
      composition: PERLIN_BLOOM_COMPOSITION,
      strength: bloomParams.strength,
      radius: bloomParams.radius,
      threshold: bloomParams.threshold,
    },
    key_light: {
      enabled: lightingEnabled === 1,
      direction: vectorTuple(lightDirection, 'key light direction'),
      intensity: serializableNumber(uniforms.uKeyLightIntensity.value as number, 'key light intensity'),
      flat_shading_mix: serializableNumber(
        uniforms.uFlatShadingMix.value as number,
        'flat shading mix',
      ),
    },
    noise: {
      seed: noiseSeed,
      scale: serializableNumber(uniforms.uScale.value as number, 'noise scale'),
      octaves: noiseOctaves,
      persistence: serializableNumber(uniforms.uPersistence.value as number, 'noise persistence'),
    },
    rotation: {
      base_quaternion: quaternionTuple(planet.mesh.quaternion, 'base quaternion'),
      seeded_spin_axis_world: vectorTuple(rotation.spinAxisWorld, 'spin axis'),
      revs_per_sec: serializableNumber(rotation.revsPerSec, 'revs per sec'),
    },
    camera: {
      projection: 'orthographic',
      position: vectorTuple(camera.position, 'camera position'),
      quaternion: quaternionTuple(camera.quaternion, 'camera quaternion'),
      direction: vectorTuple(cameraDirection, 'camera direction'),
      left: serializableNumber(camera.left, 'camera left'),
      right: serializableNumber(camera.right, 'camera right'),
      top: serializableNumber(camera.top, 'camera top'),
      bottom: serializableNumber(camera.bottom, 'camera bottom'),
      near: positive(camera.near, 'camera near'),
      far: positive(camera.far, 'camera far'),
    },
  }
}

export function prepareExportPlanet(
  movie: Movie,
  meta: Meta,
  renderMode: PlanetExportRenderMode,
  sizeRoot: 2 | 3 | 4,
  emissionProfile: RatingMidrankCdfLutProfile,
): SelectionPlanetHandle {
  const planet = createSelectionPlanet(emissionProfile)
  const worldRadius = computeExportWorldRadius(movie, sizeRoot)
  planet.setFromMovie(movie, meta.genre_palette, worldRadius)
  planet.mesh.position.set(0, 0, 0)
  planet.material.uniforms.uMeshWorldPos.value.set(0, 0, 0)
  planet.setOpacity(1)
  planet.mesh.updateMatrixWorld(true)
  if (renderMode === 'basic') {
    planet.mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
  }
  console.assert(planet.mesh.visible, '[PlanetExport] planet must be visible before rendering')
  return planet
}

function renderAlphaPreservingBloom(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  planet: THREE.Mesh,
  resolution: number,
  params: PerlinBloomParams,
): void {
  // The display framebuffer receives the base once. The shared GPU contract then
  // adds only the planet-only composite minus its isolated RenderPass base.
  renderer.render(scene, camera)
  planet.layers.enable(PERLIN_BLOOM_LAYER)
  const delta = createPerlinBloomDeltaCompositor(renderer, scene, camera)
  try {
    delta.applyParams(params)
    delta.setSize(resolution, resolution, 1)
    withCameraLayer(camera, PERLIN_BLOOM_LAYER, () => delta.renderDelta())
    delta.compositeDelta()
  } finally {
    delta.dispose()
  }
}

export function positionExportCamera(camera: THREE.OrthographicCamera, halfExtent: number): void {
  // Match the in-app focus default: yaw=0 observes the planet from world -Z.
  camera.position.set(0, 0, -halfExtent * 2)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
}

function applyResolvedVisualConfig(planet: SelectionPlanetHandle, movie: Movie, config: Phase41RenderOverride): void {
  planet.material.uniforms.uEmissionIntensity.value = focusEmissionIntensityFromProfile(movie.vote_average, config.curve)
  planet.material.uniforms.uPerlinL.value = config.lightness
  planet.material.uniforms.uPerlinChroma.value = config.chroma
  planet.material.uniforms.uKeyLightIntensity.value = config.keyLightIntensity
  planet.material.uniforms.uFlatShadingMix.value = config.flatShadingMix
  ;(planet.material.uniforms.uLightDir.value as THREE.Vector3).set(...config.direction).normalize()
}

function renderPlanetImageInternal(options: OfflineDiagnosticPlanetRenderOptions, diagnosticOverride?: Phase41RenderOverride): PlanetRenderResult {
  const { canvas, movie, meta, globalRadius, resolution, padding, bloom, renderMode, sizeRoot, bloomParamsOverride, visualConfig } = options
  const bloomParams = validatePerlinBloomParams(visualConfig?.bloom ?? bloomParamsOverride ?? productionPlanetBloomParams(bloom))
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

  const emissionCurve = visualConfig?.curve ?? options.emissionProfile
  if (emissionCurve === undefined || emissionCurve.modelVersion !== 'rating-midrank-cdf-lut-v1') {
    throw new Error('[PlanetExport] a rating-midrank active emission profile is required at the rendering boundary')
  }
  const planet = prepareExportPlanet(movie, meta, renderMode, sizeRoot, emissionCurve)
  const appliedConfig = visualConfig ?? diagnosticOverride
  if (appliedConfig !== undefined) applyResolvedVisualConfig(planet, movie, appliedConfig)
  const diagnostics = capturePlanetRenderDiagnostics(movie, planet, camera, {
    ...options,
    bloomParamsOverride: bloomParams,
    ...(appliedConfig === undefined ? {} : { emissionCurveOverride: appliedConfig.curve }),
  })
  scene.add(planet.mesh)
  if (bloom) {
    renderAlphaPreservingBloom(renderer, scene, camera, planet.mesh, resolution, bloomParams)
  } else {
    renderer.render(scene, camera)
  }
  console.assert(planet.mesh.visible, '[PlanetExport] planet must be visible before rendering')
  return { renderer, visible: planet.mesh.visible, renderMode, diagnostics }
}

/** Production renderer: no visual override can enter through its public options. */
export function renderPlanetImage(options: PlanetRenderOptions): PlanetRenderResult {
  if (options.visualConfig === undefined) {
    throw new Error('[PlanetExport] canonical resolved visual config is required at the rendering boundary')
  }
  return renderPlanetImageInternal(options)
}

export const P3911_LEGACY_FROZEN_PROFILE_FIXTURE = 'p39.11-frozen-profile-fixture' as const

type P3911LegacyFrozenProfileRenderOptions = OfflineDiagnosticPlanetRenderOptions & {
  /** Required proof that this call is historical/offline evidence, never a production export. */
  legacyProfileCompatibility: typeof P3911_LEGACY_FROZEN_PROFILE_FIXTURE
}

/** Explicit historical P39 fixture boundary: it may opt into the frozen Phase 41 LUT. */
export function renderP3911DiagnosticPlanetImage(options: P3911LegacyFrozenProfileRenderOptions): PlanetRenderResult {
  if (options.legacyProfileCompatibility !== P3911_LEGACY_FROZEN_PROFILE_FIXTURE) {
    throw new Error('[P39.11 diagnostics] legacy frozen profile compatibility marker is required')
  }
  return renderPlanetImageInternal({
    ...options,
    emissionProfile: options.emissionProfile ?? PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
  })
}

/** Explicit offline boundary for the Phase 41 profile only. */
export function renderPhase41DiagnosticPlanetImage(options: Phase41DiagnosticPlanetRenderOptions): PlanetRenderResult {
  if (options.diagnostic_only !== PHASE41_DIAGNOSTIC_MARKER) {
    throw new Error(`[Phase41 diagnostic] diagnostic_only must equal ${PHASE41_DIAGNOSTIC_MARKER}`)
  }
  if (options.visualConfig === undefined) {
    throw new Error('[Phase41 diagnostic] canonical resolved visual config is required')
  }
  return renderPlanetImageInternal(options, options.diagnosticOverride)
}
