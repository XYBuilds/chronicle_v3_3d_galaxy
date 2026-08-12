import { productionPlanetBloomParams } from '@/three/planetVisualDefaults'
import {
  createPlanetVisualRendererHandle,
  renderPlanetVisualState,
  type PlanetVisualAppliedSnapshot,
  type PlanetVisualBloomHandle,
  type PlanetVisualEmissionDerivation,
  type PlanetVisualRendererHandle,
  type PlanetVisualRenderResult,
} from '@/three/planetVisualState'
import type { ResolvedPlanetVisualConfig } from './visualConfig'
import { requireProductionPlanetVisualConfig } from './visualConfig'
import * as THREE from 'three'
import {
  PERLIN_BLOOM_COMPOSITION,
  PERLIN_BLOOM_LAYER,
  createPerlinBloomDeltaCompositor,
  type PerlinBloomParams,
  validatePerlinBloomParams,
  withCameraLayer,
} from '@/three/perlinBloomContract'
import type { FocusEmissionProfile } from '@/three/focusEmission'
import type { FocusEmissionProfileProvenance } from '@/types/galaxy'
import { createSelectionPlanet, type SelectionPlanetHandle } from '@/three/planet'
import { planetNoiseSeed } from '@/three/planetAppearance'
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
  renderer_snapshot?: PlanetVisualAppliedSnapshot
  override_provenance?: PlanetVisualAppliedSnapshot['overrideProvenance']
  diagnostic_marker?: PlanetVisualAppliedSnapshot['diagnosticMarker']
  legacy_compatibility?: PlanetVisualAppliedSnapshot['legacyCompatibility']
  emission_derivation?: PlanetVisualAppliedSnapshot['emissionDerivation']
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

function diagnosticsEmissionCurve(
  curve: FocusEmissionProfile,
  derivation?: PlanetVisualEmissionDerivation,
): PlanetRenderDiagnostics['emission_curve'] {
  if (derivation !== undefined) {
    return {
      model_version: derivation.modelVersion,
      exponent: serializableNumber(derivation.exponent, 'legacy emission exponent'),
      intensity_min: serializableNumber(derivation.intensityMin, 'legacy emission minimum'),
      intensity_max: serializableNumber(derivation.intensityMax, 'legacy emission maximum'),
    }
  }
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

type PlanetRenderCaptureOptions = {
  sizeRoot: 2 | 3 | 4
  padding: number
  visualConfig?: ResolvedPlanetVisualConfig
  bloomParamsOverride?: PerlinBloomParams
  bloom?: boolean
  appliedVisualState?: PlanetVisualRenderResult
}

function assertAppliedSnapshotMatchesFinalState(
  snapshot: PlanetVisualAppliedSnapshot,
  planet: SelectionPlanetHandle,
  bloom: PerlinBloomParams,
): void {
  const uniforms = planet.material.uniforms
  const lightDirection = uniforms.uLightDir.value as THREE.Vector3
  const actual = {
    worldRadius: planet.mesh.scale.x,
    outerRadius: planet.lastRadius,
    emission: uniforms.uEmissionIntensity.value as number,
    focus: {
      lightness: uniforms.uPerlinL.value as number,
      chroma: uniforms.uPerlinChroma.value as number,
    },
    lighting: {
      enabled: (uniforms.uLightingEnabled.value as number) === 1,
      direction: lightDirection.toArray(),
      keyLightIntensity: uniforms.uKeyLightIntensity.value as number,
      flatShadingMix: uniforms.uFlatShadingMix.value as number,
    },
    noise: {
      scale: uniforms.uScale.value as number,
      octaves: uniforms.uOctaves.value as number,
      persistence: uniforms.uPersistence.value as number,
    },
    bands: {
      areaRatio: uniforms.uAreaRatio.value as number,
      stepHeight: uniforms.uStepHeight.value as number,
      stepSmoothness: uniforms.uStepSmoothness.value as number,
      bandCount: uniforms.uBandCount.value as number,
      cutCount: uniforms.uCutCount.value as number,
    },
    bloom,
  }
  const expected = {
    worldRadius: snapshot.worldRadius,
    outerRadius: snapshot.outerRadius,
    emission: snapshot.emission,
    focus: snapshot.focus,
    lighting: snapshot.lighting,
    noise: snapshot.noise,
    bands: {
      areaRatio: snapshot.bands.areaRatio,
      stepHeight: snapshot.bands.stepHeight,
      stepSmoothness: snapshot.bands.stepSmoothness,
      bandCount: snapshot.bands.bandCount,
      cutCount: snapshot.bands.cutCount,
    },
    bloom: snapshot.bloom,
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('[PlanetExport] renderer state changed after canonical visual application')
  }
}

export function capturePlanetRenderDiagnostics(
  movie: Movie,
  planet: SelectionPlanetHandle,
  camera: THREE.OrthographicCamera,
  options: PlanetRenderCaptureOptions,
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
  const appliedVisualState = options.appliedVisualState
  const appliedSnapshot = appliedVisualState?.appliedSnapshot
  const resolvedVisualConfig = appliedVisualState?.application.state ?? options.visualConfig
  const bloomParams = validatePerlinBloomParams(
    appliedSnapshot?.bloom ?? options.bloomParamsOverride ?? productionPlanetBloomParams(options.bloom),
  )
  if (appliedSnapshot !== undefined) {
    assertAppliedSnapshotMatchesFinalState(appliedSnapshot, planet, bloomParams)
  }
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
    emission_curve: diagnosticsEmissionCurve(
      resolvedVisualConfig?.curve ?? appearance.emissionCurve,
      resolvedVisualConfig?.emissionDerivation,
    ),
    ...(resolvedVisualConfig === undefined ? {} : {
      visual_config_payload: resolvedVisualConfig.payload,
      visual_config_hash_input: appliedSnapshot?.canonicalHashInput ?? resolvedVisualConfig.hashInput,
    }),
    ...(appliedSnapshot === undefined
      ? (resolvedVisualConfig === undefined
        ? {}
        : { profile_provenance: { ...resolvedVisualConfig.emissionProvenance, source: resolvedVisualConfig.emissionSource } })
      : {
          profile_provenance: {
            ...appliedSnapshot.profileProvenance,
            source: appliedSnapshot.profileSource,
          },
          renderer_snapshot: appliedSnapshot,
        }),
    ...(resolvedVisualConfig === undefined ? {} : {
      override_provenance: resolvedVisualConfig.overrideProvenance,
      ...(resolvedVisualConfig.diagnosticMarker === undefined
        ? {}
        : { diagnostic_marker: resolvedVisualConfig.diagnosticMarker }),
      ...(resolvedVisualConfig.legacyCompatibility === undefined
        ? {}
        : { legacy_compatibility: resolvedVisualConfig.legacyCompatibility }),
      ...(resolvedVisualConfig.emissionDerivation === undefined
        ? {}
        : { emission_derivation: resolvedVisualConfig.emissionDerivation }),
    }),
    fixed_lightness: serializableNumber(uniforms.uPerlinL.value as number, 'lightness'),
    fixed_chroma: serializableNumber(uniforms.uPerlinChroma.value as number, 'chroma'),
    bloom: {
      enabled: appliedSnapshot?.bloom.enabled ?? options.bloom ?? false,
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

export type PreparedProductionExportPlanet = {
  planet: SelectionPlanetHandle
  visualState: PlanetVisualRenderResult
  rendererHandle: PlanetVisualRendererHandle
  bloomHandle: PlanetVisualBloomHandle
}

function createExportBloomHandle(): PlanetVisualBloomHandle {
  let params = validatePerlinBloomParams(productionPlanetBloomParams(false))
  return {
    applyParams(next) {
      params = validatePerlinBloomParams(next)
    },
    get params() {
      return { ...params }
    },
  }
}

/** Applies any resolved canonical visual state before selecting shader or basic validation output. */
function prepareResolvedExportPlanet(
  movie: Movie,
  meta: Meta,
  renderMode: PlanetExportRenderMode,
  sizeRoot: 2 | 3 | 4,
  visualConfig: ResolvedPlanetVisualConfig,
): PreparedProductionExportPlanet {
  const planet = createSelectionPlanet(visualConfig.curve)
  const bloomHandle = createExportBloomHandle()
  const rendererHandle = createPlanetVisualRendererHandle(planet, bloomHandle)
  const worldRadius = computeExportWorldRadius(movie, sizeRoot)
  const centeredMovie = { ...movie, x: 0, y: 0, z: 0 }
  try {
    const visualState = renderPlanetVisualState(
      visualConfig,
      { movie: centeredMovie, palette: meta.genre_palette, worldRadius },
      rendererHandle,
    )
    if (renderMode === 'basic') {
      planet.mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
    }
    console.assert(planet.mesh.visible, '[PlanetExport] planet must be visible after canonical application')
    return { planet, visualState, rendererHandle, bloomHandle }
  } catch (error) {
    planet.dispose()
    throw error
  }
}

/** Applies the complete production state after enforcing the active-profile boundary. */
export function prepareProductionExportPlanet(
  movie: Movie,
  meta: Meta,
  renderMode: PlanetExportRenderMode,
  sizeRoot: 2 | 3 | 4,
  visualConfig: ResolvedPlanetVisualConfig,
): PreparedProductionExportPlanet {
  return prepareResolvedExportPlanet(
    movie,
    meta,
    renderMode,
    sizeRoot,
    requireProductionPlanetVisualConfig(visualConfig),
  )
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

function renderPlanetImageInternal(options: PlanetRenderOptions): PlanetRenderResult {
  const { canvas, movie, meta, globalRadius, resolution, padding, bloom, renderMode, sizeRoot, visualConfig } = options
  let bloomParams = validatePerlinBloomParams(visualConfig.bloom)
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

  const prepared = prepareProductionExportPlanet(movie, meta, renderMode, sizeRoot, visualConfig)
  const planet = prepared.planet
  const appliedVisualState = prepared.visualState
  bloomParams = validatePerlinBloomParams(prepared.bloomHandle.params)
  const diagnostics = capturePlanetRenderDiagnostics(movie, planet, camera, {
    ...options,
    bloomParamsOverride: bloomParams,
    appliedVisualState,
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

/** Production renderer: no visual override or legacy profile can enter through its public options. */
export function renderPlanetImage(options: PlanetRenderOptions): PlanetRenderResult {
  const visualConfig = requireProductionPlanetVisualConfig(options.visualConfig)
  if (visualConfig.bloom.enabled !== options.bloom) {
    throw new Error('[PlanetExport] canonical Bloom state must match the production render request')
  }
  return renderPlanetImageInternal({ ...options, visualConfig })
}
