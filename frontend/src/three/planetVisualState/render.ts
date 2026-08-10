import * as THREE from 'three'

import { focusEmissionIntensityFromProfile } from '../focusEmission.js'
import { remapFocusEmissionIntensity } from '../focusEmissionTuning.js'
import { validatePerlinBloomParams } from '../perlinBloomContract.js'
import type { SelectionPlanetHandle } from '../planet.js'
import { planetGenreDisplayWeights } from '../planetAppearance.js'
import { computePlanetOuterRadius } from '../planetSizing.js'
import { selectionPlanetBaseQuaternion } from '../selectionPlanetRotation.js'
import { genreHueForGenreName, hueFromGenreColor, primaryGenreHueRad } from '../../utils/genreHue.js'

import type {
  PlanetVisualAppliedSnapshot,
  PlanetVisualApplication,
  PlanetVisualBloomHandle,
  PlanetVisualMovieState,
  PlanetVisualRenderContext,
  PlanetVisualRenderResult,
  PlanetVisualRendererHandle,
  PlanetVisualState,
} from './types.js'

function fail(message: string): never {
  throw new Error(`[PlanetVisualState] ${message}`)
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) fail(`${label} must be finite`)
  return Object.is(value, -0) ? 0 : value
}

function positive(value: number, label: string): number {
  const result = finite(value, label)
  if (result <= 0) fail(`${label} must be > 0`)
  return result
}

function geometryDetail(geometry: THREE.BufferGeometry): number {
  const detail = (geometry as THREE.BufferGeometry & {
    readonly parameters?: { readonly detail?: unknown }
  }).parameters?.detail
  if (typeof detail !== 'number') fail('renderer geometry must expose a numeric detail')
  return integer(detail, 'renderer geometry detail')
}

function integer(value: number, label: string): number {
  const result = finite(value, label)
  if (!Number.isSafeInteger(result)) fail(`${label} must be a safe integer`)
  return result
}

function resolveAppearance(
  state: PlanetVisualState,
  context: PlanetVisualRenderContext,
): PlanetVisualMovieState {
  const { movie, palette, worldRadius } = context
  positive(worldRadius, 'render context worldRadius')
  const { genres } = planetGenreDisplayWeights([...movie.genres], state.bands.max)
  const fallbackHue =
    movie.genre_hue ??
    hueFromGenreColor([movie.genre_color[0]!, movie.genre_color[1]!, movie.genre_color[2]!])
  const primaryHue = primaryGenreHueRad(movie, palette)
  const primaryGenreName = movie.genres.find(Boolean) ?? ''
  const hues = genres.map((genre) =>
    genre === primaryGenreName ? primaryHue : genreHueForGenreName(genre, palette, fallbackHue),
  )
  const bandCount = genres.length
  const cutCount = Math.max(0, bandCount - 1)
  const baseQuaternion = selectionPlanetBaseQuaternion(movie.id)

  return {
    genres,
    hues,
    bandCount,
    cutCount,
    outerRadius: computePlanetOuterRadius(worldRadius, bandCount, state.bands.stepHeight),
    baseQuaternion: [baseQuaternion.x, baseQuaternion.y, baseQuaternion.z, baseQuaternion.w],
  }
}

function deriveEmission(
  state: PlanetVisualState,
  rating: number,
): PlanetVisualApplication['emission'] {
  if (state.emissionDerivation !== undefined) {
    const value = finite(rating, 'render context movie vote_average')
    const clampedRating = Math.min(10, Math.max(0, value))
    const derivation = state.emissionDerivation
    const intensity = derivation.intensityMin
      + Math.pow(clampedRating / 10, derivation.exponent)
        * (derivation.intensityMax - derivation.intensityMin)
    return Object.freeze({ profileIntensity: intensity, finalIntensity: intensity })
  }
  const profileIntensity = focusEmissionIntensityFromProfile(rating, state.curve)
  const finalIntensity = remapFocusEmissionIntensity(
    profileIntensity,
    state.curve,
    state.focus.emissionTuning,
  )
  return Object.freeze({ profileIntensity, finalIntensity })
}

function createApplication(
  state: PlanetVisualState,
  context: PlanetVisualRenderContext,
): PlanetVisualApplication {
  const appearance = resolveAppearance(state, context)
  return Object.freeze({
    state,
    movie: context.movie,
    palette: context.palette,
    worldRadius: context.worldRadius,
    appearance: Object.freeze(appearance),
    emission: deriveEmission(state, context.movie.vote_average),
  })
}

function readSnapshot(
  planet: SelectionPlanetHandle,
  bloom: PlanetVisualBloomHandle,
  application: PlanetVisualApplication,
): PlanetVisualAppliedSnapshot {
  const uniforms = planet.material.uniforms
  const lightDirection = uniforms.uLightDir.value as THREE.Vector3
  const actualDirection = Object.freeze([
    finite(lightDirection.x, 'renderer key light direction[0]'),
    finite(lightDirection.y, 'renderer key light direction[1]'),
    finite(lightDirection.z, 'renderer key light direction[2]'),
  ] as [number, number, number])
  const scale = [
    positive(planet.mesh.scale.x, 'renderer world radius x'),
    positive(planet.mesh.scale.y, 'renderer world radius y'),
    positive(planet.mesh.scale.z, 'renderer world radius z'),
  ] as const
  if (scale[0] !== scale[1] || scale[0] !== scale[2]) {
    fail('renderer planet scale must remain uniform')
  }
  const actualBloom = Object.freeze(validatePerlinBloomParams(bloom.params))
  const hueArray = uniforms.uHue.value as Float32Array
  const hues = Object.freeze(Array.from(
    hueArray.slice(0, application.appearance.bandCount),
    (value, index) => finite(value, `renderer hue[${index}]`),
  ))

  return Object.freeze({
    canonicalHashInput: application.state.hashInput,
    profileProvenance: application.state.emissionProvenance,
    profileSource: application.state.emissionSource,
    overrideProvenance: application.state.overrideProvenance,
    ...(application.state.diagnosticMarker === undefined
      ? {}
      : { diagnosticMarker: application.state.diagnosticMarker }),
    ...(application.state.legacyCompatibility === undefined
      ? {}
      : { legacyCompatibility: application.state.legacyCompatibility }),
    ...(application.state.emissionDerivation === undefined
      ? {}
      : { emissionDerivation: application.state.emissionDerivation }),
    movieId: application.movie.id,
    worldRadius: scale[0],
    outerRadius: positive(planet.lastRadius, 'renderer outer radius'),
    emission: finite(uniforms.uEmissionIntensity.value as number, 'renderer emission'),
    profileEmission: application.emission.profileIntensity,
    focus: Object.freeze({
      lightness: finite(uniforms.uPerlinL.value as number, 'renderer lightness'),
      chroma: finite(uniforms.uPerlinChroma.value as number, 'renderer chroma'),
    }),
    lighting: Object.freeze({
      enabled: (uniforms.uLightingEnabled.value as number) === 1,
      direction: actualDirection,
      keyLightIntensity: finite(uniforms.uKeyLightIntensity.value as number, 'renderer key light intensity'),
      flatShadingMix: finite(uniforms.uFlatShadingMix.value as number, 'renderer flat shading mix'),
    }),
    geometryDetail: geometryDetail(planet.mesh.geometry),
    size: application.state.size,
    noise: Object.freeze({
      scale: finite(uniforms.uScale.value as number, 'renderer noise scale'),
      octaves: integer(uniforms.uOctaves.value as number, 'renderer noise octaves'),
      persistence: finite(uniforms.uPersistence.value as number, 'renderer noise persistence'),
    }),
    bands: Object.freeze({
      max: application.state.bands.max,
      areaRatio: finite(uniforms.uAreaRatio.value as number, 'renderer band area ratio'),
      stepHeight: finite(uniforms.uStepHeight.value as number, 'renderer band step height'),
      stepSmoothness: finite(
        uniforms.uStepSmoothness.value as number,
        'renderer band step smoothness',
      ),
      bandCount: integer(uniforms.uBandCount.value as number, 'renderer band count'),
      cutCount: integer(uniforms.uCutCount.value as number, 'renderer cut count'),
    }),
    hues,
    color: Object.freeze({
      pipelineVersion: application.state.color.pipelineVersion,
      lMax: finite(uniforms.uLMax.value as number, 'renderer color lMax'),
      huntGamma: finite(uniforms.uHuntGamma.value as number, 'renderer Hunt gamma'),
      huntApplyMask: integer(uniforms.uHuntApplyMask.value as number, 'renderer Hunt apply mask'),
    }),
    material: Object.freeze({
      alpha: finite(uniforms.uAlpha.value as number, 'renderer alpha'),
      alphaTest: finite(planet.material.alphaTest, 'renderer alpha test'),
      transparent: planet.material.transparent,
      depthWrite: planet.material.depthWrite,
      depthTest: planet.material.depthTest,
    }),
    bloom: actualBloom,
  })
}

/**
 * Adapts the existing Focus Planet shader handle to the canonical application seam.
 * Uniform order, CPU noise synchronization and renderer readback stay behind this adapter.
 */
export function createPlanetVisualRendererHandle(
  planet: SelectionPlanetHandle,
  bloom: PlanetVisualBloomHandle,
): PlanetVisualRendererHandle {
  let lastApplication: PlanetVisualApplication | null = null

  return {
    apply(application) {
      const state = application.state
      if (geometryDetail(planet.mesh.geometry) !== state.geometry.detail) {
        fail('renderer geometry detail does not match canonical state')
      }
      const uniforms = planet.material.uniforms
      uniforms.uScale.value = state.noise.scale
      uniforms.uOctaves.value = state.noise.octaves
      uniforms.uPersistence.value = state.noise.persistence
      uniforms.uAreaRatio.value = state.bands.areaRatio
      uniforms.uStepHeight.value = state.bands.stepHeight
      uniforms.uStepSmoothness.value = state.bands.stepSmoothness
      planet.setFromMovie(application.movie, application.palette, application.worldRadius)
      const appearance = application.appearance
      const hueArray = uniforms.uHue.value as Float32Array
      const paddedHue = appearance.hues[appearance.hues.length - 1]!
      for (let index = 0; index < hueArray.length; index += 1) {
        hueArray[index] = appearance.hues[index] ?? paddedHue
      }
      const lightDirection = uniforms.uLightDir.value as THREE.Vector3
      lightDirection.set(...state.lighting.direction).normalize()
      uniforms.uPerlinL.value = state.focus.lightness
      uniforms.uPerlinChroma.value = state.focus.chroma
      uniforms.uLMax.value = state.color.lMax
      uniforms.uHuntGamma.value = state.color.huntGamma
      uniforms.uHuntApplyMask.value = state.color.huntApplyMask
      uniforms.uLightingEnabled.value = state.lighting.enabled ? 1 : 0
      uniforms.uKeyLightIntensity.value = state.lighting.keyLightIntensity
      uniforms.uFlatShadingMix.value = state.lighting.flatShadingMix
      uniforms.uEmissionIntensity.value = application.emission.finalIntensity
      uniforms.uBandCount.value = appearance.bandCount
      uniforms.uCutCount.value = appearance.cutCount
      uniforms.uAlpha.value = 1
      const materialRequiresUpdate =
        planet.material.transparent !== state.material.transparent
        || planet.material.alphaTest !== state.material.alphaTest
        || planet.material.depthWrite !== state.material.depthWrite
        || planet.material.depthTest !== state.material.depthTest
      planet.material.transparent = state.material.transparent
      planet.material.alphaTest = state.material.alphaTest
      planet.material.depthWrite = state.material.depthWrite
      planet.material.depthTest = state.material.depthTest
      if (materialRequiresUpdate) planet.material.needsUpdate = true
      planet.mesh.position.set(application.movie.x, application.movie.y, application.movie.z)
      planet.mesh.scale.setScalar(application.worldRadius)
      planet.mesh.quaternion.set(...appearance.baseQuaternion)
      planet.mesh.updateMatrixWorld(true)
      ;(uniforms.uMeshWorldPos.value as THREE.Vector3).copy(planet.mesh.position)
      planet.mesh.visible = true
      bloom.applyParams(state.bloom)
      lastApplication = application
    },
    readAppliedState() {
      if (lastApplication === null) {
        fail('renderer state has not been applied')
      }
      return readSnapshot(planet, bloom, lastApplication)
    },
  }
}

/** Applies a complete canonical state and returns the final renderer readback. */
export function renderPlanetVisualState(
  state: PlanetVisualState,
  context: PlanetVisualRenderContext,
  renderer: PlanetVisualRendererHandle,
): PlanetVisualRenderResult {
  const application = createApplication(state, context)
  renderer.apply(application)
  const appliedSnapshot = renderer.readAppliedState()
  if (appliedSnapshot.canonicalHashInput !== state.hashInput) {
    fail('renderer snapshot does not identify the applied canonical state')
  }
  if (appliedSnapshot.movieId !== context.movie.id) {
    fail('renderer snapshot does not identify the applied movie')
  }
  return Object.freeze({ application, appliedSnapshot })
}