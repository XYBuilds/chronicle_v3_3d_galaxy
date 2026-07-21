import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import { createHdrCapabilitiesDebug, type HdrCapabilitiesDebug } from '@/lib/hdrCapabilities'
import { createHdrProofDebug, type HdrProofDebug } from '@/lib/hdrProof'
import { createSdrFallbackDebug, SDR_FALLBACK_OUTPUT_COLOR_SPACE, type SdrFallbackDebug } from '@/lib/sdrFallback'
import { setGalaxyCameraZ } from '@/lib/galaxyCameraZBridge'
import { getStrings } from '@/lib/strings'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { useSearchIndexStore } from '@/store/searchIndexStore'
import type { Meta, Movie } from '@/types/galaxy'

import {
  applyFocusOrbitLookAt,
  attachGalaxyCameraControls,
  clampGalaxyCameraXY,
  GALAXY_CAMERA_EULER,
  setFocusOrbitCameraPosition,
} from './camera'
import { CONSTELLATION_SURFACE_GAP_WORLD, createConstellation } from './constellation'
import { createGalaxyDualMeshes } from './galaxyMeshes'
import { computeIdleMacroFadesBlendForPhase, IDLE_NEAR_FADE_DEFAULTS } from './idleNearFade'
import { IDLE_Z_FADE_DEFAULTS } from './idleZFade'
import { createPerlinSelectiveBloom } from './perlinSelectiveBloom'
import {
  applyIdleNearFadeDefaults,
  applyIdleZFadeDefaults,
  FOCUS_DESELECT_MS,
  FOCUS_SELECT_MS,
  formatSdrRuntimeTuningLog,
  SDR_RUNTIME_DEFAULTS,
} from './sdrRuntimeTuning'
import { attachGalaxyActiveMeshInteraction } from './interaction'
import { createSelectionPlanet, type SelectionPlanetHandle } from './planet'
import { validateFocusEmissionRuntimeTuning, type FocusEmissionRuntimeTuning } from './focusEmissionTuning'
import { PLANET_VISUAL_DEFAULTS } from './planetVisualDefaults'
import {
  selectionPlanetOrientedQuaternion,
  selectionPlanetRotationAxisForMovie,
  selectionPlanetSpinAngleRad,
} from './selectionPlanetRotation'
import { computeActiveWorldRadius, getSelectionMaskPickSet, resolveSelectionWorldRadius } from './screenRadius'
import { computeFocusNeighborIds } from './focusNeighborMask'
import { buildMovieIdToIndexMap, setSelectionMask, type SelectionMaskUniformBag } from './selectionMask'
import { createTransitionDriver } from './transitionDriver'
import {
  applyUniverseBackgroundColor,
  COSMOS_UNIVERSE_BG_DEFAULT,
  formatUniverseBgLogLine,
  getActiveUniverseBgSource,
  readUniverseBgHex,
  resetUniverseBackgroundColor,
  type UniverseBgTargets,
} from './universeBackground'

interface BloomDebugControls {
  strength: number
  radius: number
  threshold: number
  log: () => void
  /** True when `UnrealBloomPass` is attached and the render loop uses `composer.render()`. */
  readonly enabled: boolean
  enable: () => void
  disable: () => void
}

interface GalaxyPointScaleDebug {
  /** Dual mesh / Points: `uSizeScale` drives macro size (dual: × focus/bg mul × `aSize`; Points: screen diameter). */
  scale: number
  /** Active (viz-window) slab size multiplier — uniform `uActiveSizeMul`. */
  activeSizeMul: number
  /** Background slab size multiplier (see `uBgSizeMul`). */
  bgSizeMul: number
  log: () => void
}

interface GalaxyColorDebug {
  lMin: number
  lMax: number
  /** P10.1 — `voteNorm` threshold (~vote/10) where high-tier slope compression starts. */
  highRatingT: number
  /** P10.1 — multiplier on `(t - highRatingT)` above the threshold (smaller = more compression). */
  highTierTRangeScale: number
  /** P10.1 — exponent on compressed `t` before `mix(uLMin, uLMax, …)`. */
  lightnessRatingExponent: number
  /** P17.1 — lower clamp on idle distance-L multiplier `pow(d0/d, 2/3)` (`uDistanceLightnessFloor`). */
  distanceLightnessFloor: number
  /** P17.2 — Hunt γ (shared with active + Perlin). */
  huntGamma: number
  /** P17.2 — Hunt layer mask 0–7 (bits: idle / active / perlin). */
  huntApplyMask: number
  chroma: number
  /** P11.1 / P13.6 — alpha of non-target active stars when focus blend = 1 (default 0.08). */
  focusNonTargetActiveAlpha: number
  /** P17.2+ — focus neighborhood hovered active: alpha = max(dim, this); default 1. */
  focusHoveredActiveAlpha: number
  /** P11.2 — idle focus dim: chroma multiplier toward gray. */
  focusDimChroma: number
  /** P11.2 — idle focus dim: L multiplier (× L_base). */
  focusDimL: number
  /** P11.2 — 0/1; future selection path may diverge. */
  focusDimMode: number
  log: () => void
}

/** Dev console: `window.__galaxyInteraction` — Phase 5.1.5 time-axis & camera standoff. */
interface GalaxyInteractionDebug {
  /** Same Zustand store as the app: `getState` / `setState` / `subscribe`. */
  readonly store: typeof useGalaxyInteractionStore
  zCurrent: number
  zVisWindow: number
  zCamDistance: number
  /** P12.7 — person-mode constellation `LineSegments` (`window.__galaxy.constellationEnabled`; product HUD 无开关). */
  constellationEnabled: boolean
  log: () => void
}

/** Dev console: `window.__galaxyIdleNearFade` — P26.3 idle near-fade uniforms (mirrors `IDLE_NEAR_FADE_DEFAULTS` at boot). */
interface GalaxyIdleNearFadeDebug {
  /** >0.5 enables shader fade + idle `transparent` / no depth-write path. */
  enabled: number
  /** World units — same as `uIdleNearFadeStartDist`. */
  startDist: number
  width: number
  minAlpha: number
  /** Restore `IDLE_NEAR_FADE_DEFAULTS` to GPU uniforms. */
  reset(): void
  log: () => void
}

/** Dev console: `window.__galaxyUniverseBg` — universe bg token (css var + scene + clear). */
interface GalaxyUniverseBgDebug {
  /** CSS hex from `--cosmos-universe-bg` (read-only). */
  get color(): string
  /** CSS hex, `rgb()`, `hsl()`, or numeric `0x000000`; logs css/scene/clear on apply. */
  set color(value: string | number)
  /** Same as assigning to `.color`; avoids a property named `set` (accessor clash). */
  apply(value: string | number): string
  reset(): string
  /** Last driver: `default` | `interaction` (reserved) | `runtime`. */
  readonly source: string
  log(): void
}

/** Dev console: window.__galaxyIdleZFade — P27 idle Z dim (see idleZFade.ts). */
interface GalaxyIdleZFadeDebug {
  /** 1 = dim aZ > zCurrent+zVisWindow; 0 = off; -1 = dim aZ < zCurrent. */
  mode: number
  /** Alpha multiplier on the dimmed side (0…1). */
  outsideAlpha: number
  /** Restore `IDLE_Z_FADE_DEFAULTS` to GPU uniforms. */
  reset(): void
  log: () => void
}

/** Dev console: `window.__galaxyIdleMacroFade` — P32.3 shared near+Z blend vs `focusDriver`. */
interface GalaxyIdleMacroFadeDebug {
  /** Current `uIdleMacroFadesBlend` (0 = focus, 1 = macro browse). */
  readonly blend: number
  readonly selectionPhase: string
  readonly focusProgress: number
  readonly selectingEnteredFromMacro: boolean
  log(): void
}

/** Dev console: `window.__sdrTuning` — Phase 32.4 SDR brightness path (bg + idle macro fades). */
interface SdrRuntimeTuningDebug {
  readonly defaults: typeof SDR_RUNTIME_DEFAULTS
  log(): void
  resetAll(): void
}

/** Dev console: `window.__planetTerrace` — Perlin focus sphere terrace + P11.4 lighting uniforms. */
interface SelectionPlanetTerraceDebug {
  /** Unit-sphere extrusion per band step; world radius uses `× (1 + cuts × stepHeight)`. Clamped to [0, 0.25] on set. */
  stepHeight: number
  /** Noise-domain smoothstep half-width at thresholds; 0 ≈ hard cuts. Clamped to [0, 0.25] on set. */
  stepSmoothness: number
  /** P11.4 — derivative vs geometric normal (1 = screen-space normal from world-position derivatives). */
  flatShadingMix: number
  /** P11.4 — world-space light direction (normalized on set). */
  perlinLightDir: THREE.Vector3
  /** P11.4 — Lambert shading on/off; off uses flat band colors only. */
  perlinLightingEnabled: boolean
  log: () => void
}

/** Dev console: `window.__planetVisual` — grouped Focus look-development controls. */
interface PlanetVisualDebug {
  exponent: number
  intensityMin: number
  intensityMax: number
  readonly focus: {
    lightness: number
  }
  readonly lighting: {
    keyLightIntensity: number
    flatShadingMix: number
    direction: [number, number, number]
  }
  readonly bloom: {
    strength: number
    radius: number
    threshold: number
  }
  reset(): void
  log(): void
}

/** Dev console: `window.__hdrCapabilities` — Phase 29.2 HDR capability probe (§29 spec). */
type HdrCapabilitiesWindowDebug = HdrCapabilitiesDebug
/** Dev console: `window.__hdrProbe` — Phase 29.3 minimal HDR proof overlay (§29 spec). */
type HdrProofWindowDebug = HdrProofDebug
/** Dev console: `window.__sdrFallback` — Phase 29.4 production SDR policy (§29 spec). */
type SdrFallbackWindowDebug = SdrFallbackDebug

declare global {
  interface Window {
    __hdrCapabilities?: HdrCapabilitiesWindowDebug
    __hdrProbe?: HdrProofWindowDebug
    __sdrFallback?: SdrFallbackWindowDebug
    __bloom?: BloomDebugControls
    __galaxyPointScale?: GalaxyPointScaleDebug
    __galaxyColor?: GalaxyColorDebug
    __galaxyIdleNearFade?: GalaxyIdleNearFadeDebug
    __galaxyIdleZFade?: GalaxyIdleZFadeDebug
    __galaxyIdleMacroFade?: GalaxyIdleMacroFadeDebug
    __galaxyUniverseBg?: GalaxyUniverseBgDebug
    __sdrTuning?: SdrRuntimeTuningDebug
    __galaxyInteraction?: GalaxyInteractionDebug
    __planetTerrace?: SelectionPlanetTerraceDebug
    __planetVisual?: PlanetVisualDebug
  }
}

/** P16.2 — Timeline `zCurrent` eased drift (person search); scene-owned driver, HUD calls via mount ref. */
export interface GalaxySceneController {
  animateZCurrentTo: (z: number, durationMs?: number) => void
}

export interface GalaxySceneMount {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  dispose: () => void
  controller: GalaxySceneController
  /** Idle `InstancedMesh` shader (P8.4); shares `uniforms` with `galaxyActiveMaterial`. */
  galaxyMaterial: THREE.ShaderMaterial
  /** Active mesh shader — same uniform bag as `galaxyMaterial` for `__galaxyPointScale` / Leva. */
  galaxyActiveMaterial: THREE.ShaderMaterial
  /** Selection icosphere handle (Perlin uniforms + `setFromMovie` / `setOpacity`). */
  selectionPlanet: SelectionPlanetHandle
}

function xyCenter(meta: Pick<Meta, 'xy_range'>): { cx: number; cy: number } {
  const { x, y } = meta.xy_range
  if (x.length !== 2 || y.length !== 2) {
    throw new Error('[Scene] meta.xy_range.x / .y must be length-2 [min, max]')
  }
  return { cx: (x[0] + x[1]) / 2, cy: (y[0] + y[1]) / 2 }
}

/**
 * Black fullscreen scene: WebGL2 renderer, perspective camera at XY center,
 * macro Z from Phase 5.1.5 (`zCurrent - zCamDistance`), facing +Z (axis-parallel).
 */
const SELECT_MS = FOCUS_SELECT_MS
const DESELECT_MS = FOCUS_DESELECT_MS
/** P16.2 — person/genre suggestion zCurrent drift matches focus enter easing (Design Spec §4.4). */
const Z_CURRENT_ANIM_MS = 700

export function mountGalaxyScene(
  container: HTMLElement,
  meta: Pick<Meta, 'z_range' | 'xy_range' | 'count' | 'genre_palette'>,
  movies: Movie[],
): GalaxySceneMount {
  const zRange = meta.z_range
  if (zRange.length !== 2) {
    throw new Error('[Scene] meta.z_range must be [z_min, z_max]')
  }
  const zLo = Math.min(zRange[0], zRange[1])
  /** Macro camera standoff along Z (absolute world units; not derived from `z_range` span). */
  const zCamDistance = 30
  const zVisWindow = 0.5
  /** Rev 4 plan: start at the earliest year in `z_range` so the first screen is the time origin. */
  const zCurrent = zLo
  useGalaxyInteractionStore.setState({ zCurrent, zVisWindow, zCamDistance })

  const { cx, cy } = xyCenter(meta)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COSMOS_UNIVERSE_BG_DEFAULT)

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1e6)
  camera.position.set(cx, cy, zCurrent - zCamDistance)
  camera.rotation.copy(GALAXY_CAMERA_EULER)
  camera.updateMatrixWorld(true)
  setGalaxyCameraZ(zCurrent)

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = SDR_FALLBACK_OUTPUT_COLOR_SPACE

  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose()
    throw new Error(getStrings().scene.webgl2Required)
  }

  const gl = renderer.getContext()
  const webglLabel = gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1'

  // eslint-disable-next-line prefer-const -- hdr callback must close over sdr after both are constructed
  let sdrFallbackDebug: SdrFallbackDebug
  const hdrCapabilitiesDebug = createHdrCapabilitiesDebug(renderer, {
    onReportUpdated: () => {
      sdrFallbackDebug.refresh()
    },
  })
  sdrFallbackDebug = createSdrFallbackDebug(renderer, () => hdrCapabilitiesDebug.report)
  window.__sdrFallback = sdrFallbackDebug
  window.__hdrCapabilities = hdrCapabilitiesDebug

  const hdrProofDebug = createHdrProofDebug()
  window.__hdrProbe = hdrProofDebug

  applyUniverseBackgroundColor(readUniverseBgHex(), { scene, renderer }, { source: 'default', log: false })

  const pr = Math.min(window.devicePixelRatio, 2)
  const galaxy = createGalaxyDualMeshes(movies, meta.genre_palette, pr, renderer.capabilities.maxTextureSize)
  const galUniforms = galaxy.idleMaterial.uniforms
  const movieIdToIndex = buildMovieIdToIndexMap(movies)
  const selectionMaskUniforms: SelectionMaskUniformBag = {
    uSelectionMask: galUniforms.uSelectionMask as THREE.Uniform<THREE.DataTexture>,
    uSelectionCount: galUniforms.uSelectionCount as THREE.Uniform<number>,
    uSelectionMode: galUniforms.uSelectionMode as THREE.Uniform<number>,
    uMovieCount: galUniforms.uMovieCount as THREE.Uniform<number>,
    uSelectionAtlasWidth: galUniforms.uSelectionAtlasWidth as THREE.Uniform<number>,
    uSelectionAtlasHeight: galUniforms.uSelectionAtlasHeight as THREE.Uniform<number>,
  }

  const syncSelectionMaskToGPU = () => {
    const st = useGalaxyInteractionStore.getState()
    if (st.selectedMovieId !== null) {
      let ids = st.focusNeighborIds
      if (!ids?.length) {
        const movie = movies.find((m) => m.id === st.selectedMovieId)
        if (!movie) {
          setSelectionMask(null, movieIdToIndex, selectionMaskUniforms)
          return
        }
        ids = computeFocusNeighborIds(
          movies,
          { x: movie.x, y: movie.y, z: movie.z },
          st.focusNeighborRadius,
        )
        useGalaxyInteractionStore.setState({ focusNeighborIds: ids })
      }
      setSelectionMask(ids, movieIdToIndex, selectionMaskUniforms)
      return
    }
    if (st.searchMode === 'person' || st.searchMode === 'genre') {
      setSelectionMask(st.selectionIds, movieIdToIndex, selectionMaskUniforms)
      return
    }
    setSelectionMask(null, movieIdToIndex, selectionMaskUniforms)
  }
  syncSelectionMaskToGPU()
  const unsubSelectionMask = useGalaxyInteractionStore.subscribe((state, prev) => {
    if (
      state.selectionIds === prev.selectionIds &&
      state.selectedMovieId === prev.selectedMovieId &&
      state.focusNeighborIds === prev.focusNeighborIds &&
      state.focusNeighborRadius === prev.focusNeighborRadius &&
      state.searchMode === prev.searchMode
    ) {
      return
    }
    if (
      state.selectedMovieId !== null &&
      (state.selectedMovieId !== prev.selectedMovieId || state.focusNeighborRadius !== prev.focusNeighborRadius)
    ) {
      const pivot = movies.find((m) => m.id === state.selectedMovieId)
      if (pivot) {
        const ids = computeFocusNeighborIds(
          movies,
          { x: pivot.x, y: pivot.y, z: pivot.z },
          state.focusNeighborRadius,
        )
        useGalaxyInteractionStore.setState({ focusNeighborIds: ids })
      }
    }
    syncSelectionMaskToGPU()
  })

  const uSelectionMode = galUniforms.uSelectionMode as THREE.Uniform<number>
  const uZ = galUniforms.uZCurrent as THREE.Uniform<number>
  const uZw = galUniforms.uZVisWindow as THREE.Uniform<number>
  const uFocused = galUniforms.uFocusedInstanceId as THREE.Uniform<number>
  const uFocusCameraBlend = galUniforms.uFocusCameraBlend as THREE.Uniform<number>
  const uFocusActiveDimBlend = galUniforms.uFocusActiveDimBlend as THREE.Uniform<number>
  const uFocusTargetInstanceId = galUniforms.uFocusTargetInstanceId as THREE.Uniform<number>
  const uFocusNonTargetActiveAlpha = galUniforms.uFocusNonTargetActiveAlpha as THREE.Uniform<number>
  const uFocusHoveredActiveAlpha = galUniforms.uFocusHoveredActiveAlpha as THREE.Uniform<number>
  const uFocusDimChroma = galUniforms.uFocusDimChroma as THREE.Uniform<number>
  const uFocusDimL = galUniforms.uFocusDimL as THREE.Uniform<number>
  const uFocusDimMode = galUniforms.uFocusDimMode as THREE.Uniform<number>
  const uZCamDistUniform = galUniforms.uZCamDistance as THREE.Uniform<number>
  const uHoveredInstanceId = galUniforms.uHoveredInstanceId as THREE.Uniform<number>
  const uCameraWorldPosGal = galUniforms.uCameraWorldPos as THREE.Uniform<THREE.Vector3>
  const uIdleMacroFadesBlend = galUniforms.uIdleMacroFadesBlend as THREE.Uniform<number>
  let idleMacroFadesBlendCurrent = 1
  uZ.value = zCurrent
  uZw.value = zVisWindow
  uZCamDistUniform.value = useGalaxyInteractionStore.getState().zCamDistance
  uFocused.value = -1
  uFocusCameraBlend.value = 0
  uFocusActiveDimBlend.value = 0
  uFocusTargetInstanceId.value = -1
  scene.add(galaxy.idle)
  scene.add(galaxy.active)

  const movieByIdForConstellation = new Map<number, Movie>()
  for (const m of movies) {
    movieByIdForConstellation.set(m.id, m)
  }
  const constellation = createConstellation()
  scene.add(constellation.group)

  const syncConstellationFromStores = () => {
    const st = useGalaxyInteractionStore.getState()
    const index = useSearchIndexStore.getState().data
    const entry =
      st.searchMode === 'person' && st.selectionPersonKey && index
        ? index.people[st.selectionPersonKey]
        : undefined
    const maskPick = getSelectionMaskPickSet(
      st.selectedMovieId,
      st.focusNeighborIds,
      st.searchMode,
      st.selectionIds,
    )
    const mat = galaxy.activeMaterial
    constellation.sync({
      visible:
        st.searchMode === 'person' &&
        st.constellationEnabled &&
        (st.selectionIds?.length ?? 0) >= 2,
      hasFilmFocus: st.selectedMovieId !== null,
      movieById: movieByIdForConstellation,
      selectionIds: st.selectionIds,
      movieRoles: entry?.movie_roles ?? null,
      surfaceGapWorld: CONSTELLATION_SURFACE_GAP_WORLD,
      getActiveWorldRadius: (m) => computeActiveWorldRadius(m, st.zCurrent, st.zVisWindow, mat, maskPick),
    })
  }
  syncConstellationFromStores()
  const unsubConstellation = useGalaxyInteractionStore.subscribe((state, prev) => {
    if (
      state.searchMode === prev.searchMode &&
      state.constellationEnabled === prev.constellationEnabled &&
      state.selectionIds === prev.selectionIds &&
      state.selectionPersonKey === prev.selectionPersonKey &&
      state.selectedMovieId === prev.selectedMovieId &&
      state.focusNeighborIds === prev.focusNeighborIds &&
      state.focusNeighborRadius === prev.focusNeighborRadius &&
      state.zCurrent === prev.zCurrent &&
      state.zVisWindow === prev.zVisWindow
    ) {
      return
    }
    syncConstellationFromStores()
  })
  const unsubConstellationIndex = useSearchIndexStore.subscribe((state, prev) => {
    if (state.data === prev.data) return
    syncConstellationFromStores()
  })

  const planet = createSelectionPlanet()
  planet.mesh.renderOrder = 2
  scene.add(planet.mesh)

  /** P32.6 — slow spin about the planet-local pole; reset baseline on movie change. */
  let planetSpinMovieId = -1
  let planetSpinStartMs = 0
  let planetSpinRevsPerSec = 0
  const planetSpinBase = new THREE.Quaternion()
  const planetSpinAxis = new THREE.Vector3()

  const bindSelectionPlanetSpin = (movieId: number, nowMs: number) => {
    const snap = selectionPlanetRotationAxisForMovie(movieId)
    planetSpinMovieId = movieId
    planetSpinBase.copy(snap.baseQuaternion)
    planetSpinAxis.copy(snap.spinAxisWorld)
    planetSpinRevsPerSec = snap.revsPerSec
    planetSpinStartMs = nowMs
  }

  const applySelectionPlanetSpin = (nowMs: number) => {
    const alpha = planet.material.uniforms.uAlpha.value as number
    if (!planet.mesh.visible || alpha <= 0.001 || planetSpinMovieId < 0) return
    const elapsedSec = (nowMs - planetSpinStartMs) / 1000
    const angle = selectionPlanetSpinAngleRad(elapsedSec, planetSpinRevsPerSec)
    selectionPlanetOrientedQuaternion(planetSpinBase, planetSpinAxis, angle, planet.mesh.quaternion)
    planet.mesh.updateMatrixWorld(true)
  }

  type SelectionPhase = 'idle' | 'selecting' | 'selected' | 'deselecting'
  let selectionPhase: SelectionPhase = 'idle'
  const macroZWheel = () => selectionPhase === 'idle'
  const focusDriver = createTransitionDriver()
  const zCurrentDriver = createTransitionDriver()
  let zTimelineAnimFrom = zCurrent
  let zTimelineAnimTo = zCurrent
  const restCam = new THREE.Vector3()
  const fromCam = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  const scratchCameraWorldPos = new THREE.Vector3()
  const tmpOrbitPos = new THREE.Vector3()
  const deselectFromQuat = new THREE.Quaternion()
  const deselectToQuat = new THREE.Quaternion().setFromEuler(GALAXY_CAMERA_EULER)
  const orbitPivotVec = new THREE.Vector3()
  let inputLocked = false
  /** true 当次 `selecting` 从宏观 `idle` 飞入；false = focus 内换星，飞入时 slerp 四元数保留视角。 */
  let selectingEnteredFromMacro = true
  const selectingStartQuat = new THREE.Quaternion()
  const selectingEndQuat = new THREE.Quaternion()
  const selectingQuatHelper = new THREE.Object3D()

  let pendingSelectInstanceIndex = 0
  /** P13.4 — Timeline `zCurrent` animates with focus enter (same eased progress as camera). */
  let focusZAnimStart = 0
  let focusZAnimTarget = 0

  /** P32.3 — shared macro-fade blend; mirrors focusDriver (selecting: 1→0, deselecting: 0→1). */
  const computeIdleMacroFadesBlend = () =>
    computeIdleMacroFadesBlendForPhase(selectionPhase, focusDriver.progress, selectingEnteredFromMacro)

  const syncIdleMacroFadesBlend = (blend: number) => {
    idleMacroFadesBlendCurrent = blend
    uIdleMacroFadesBlend.value = blend
  }

  const animateZCurrentTo = (targetZ: number, durationMs: number = Z_CURRENT_ANIM_MS) => {
    zCurrentDriver.cancel()
    const st = useGalaxyInteractionStore.getState()
    zTimelineAnimFrom = st.zCurrent
    zTimelineAnimTo = targetZ
    zCurrentDriver.start(Math.max(1, durationMs))
    console.log('[ZCurrent] animateZCurrentTo start', {
      from: zTimelineAnimFrom,
      to: zTimelineAnimTo,
      durationMs,
    })
  }

  const applySelectionFrame = (nowMs: number) => {
    if (selectionPhase === 'idle') {
      uFocused.value = -1
      uFocusTargetInstanceId.value = -1
      uFocusCameraBlend.value = 0
      uFocusActiveDimBlend.value = 0
      planet.mesh.visible = false
      planet.material.uniforms.uAlpha.value = 0
      inputLocked = false
      return
    }

    if (selectionPhase === 'selecting') {
      inputLocked = true
      uFocused.value = -1
      focusDriver.tick(nowMs)
      const p = focusDriver.progress
      const zNext = focusZAnimStart + (focusZAnimTarget - focusZAnimStart) * p
      useGalaxyInteractionStore.setState({ zCurrent: zNext })
      camera.position.lerpVectors(fromCam, toCam, p)
      if (selectingEnteredFromMacro) {
        camera.rotation.copy(GALAXY_CAMERA_EULER)
      } else {
        // focus 内换星：仅直线平移机位，朝向在飞行中保持不变；结束瞬时再对齐新 pivot（避免四元数插值绕圈）
        camera.quaternion.copy(selectingStartQuat)
      }
      uFocusTargetInstanceId.value = pendingSelectInstanceIndex
      uFocusCameraBlend.value = p
      uFocusActiveDimBlend.value = selectingEnteredFromMacro ? p : 1
      syncIdleMacroFadesBlend(computeIdleMacroFadesBlend())
      if (!focusDriver.active) {
        selectionPhase = 'selected'
        uFocused.value = pendingSelectInstanceIndex
        uFocusCameraBlend.value = 1
        uFocusActiveDimBlend.value = 1
        planet.mesh.visible = true
        planet.material.uniforms.uAlpha.value = 1
        camera.position.copy(toCam)
        useGalaxyInteractionStore.setState({ zCurrent: focusZAnimTarget })
        if (!selectingEnteredFromMacro) {
          camera.quaternion.copy(selectingEndQuat)
        }
        console.log('[Selection] phase=selected | dual mesh instance hidden | planet visible')
      }
      return
    }

    if (selectionPhase === 'deselecting') {
      inputLocked = true
      uFocused.value = -1
      focusDriver.tick(nowMs)
      const p = focusDriver.progress
      const camWeight = 1 - p
      camera.position.lerpVectors(fromCam, toCam, camWeight)
      camera.quaternion.slerpQuaternions(deselectFromQuat, deselectToQuat, camWeight)
      uFocusTargetInstanceId.value = pendingSelectInstanceIndex
      uFocusCameraBlend.value = p
      uFocusActiveDimBlend.value = p
      syncIdleMacroFadesBlend(computeIdleMacroFadesBlend())
      if (!focusDriver.active) {
        selectionPhase = 'idle'
        uFocusTargetInstanceId.value = -1
        uFocusCameraBlend.value = 0
        uFocusActiveDimBlend.value = 0
        planet.mesh.visible = false
        planet.material.uniforms.uAlpha.value = 0
        camera.rotation.setFromQuaternion(deselectToQuat)
        useGalaxyInteractionStore.setState({ focusOrbit: { yaw: 0, pitch: 0 } })
        console.log('[Selection] phase=idle | camera restored | dual mesh full')
      }
      return
    }

    // selected — orbit camera (P13.3); focused instance stays hidden on dual meshes
    inputLocked = false
    uFocused.value = pendingSelectInstanceIndex
    uFocusTargetInstanceId.value = pendingSelectInstanceIndex
    uFocusCameraBlend.value = 1
    uFocusActiveDimBlend.value = 1
    planet.mesh.visible = true
    planet.material.uniforms.uAlpha.value = 1
    const mSel = movies[pendingSelectInstanceIndex]
    if (mSel) {
      const { yaw, pitch } = useGalaxyInteractionStore.getState().focusOrbit
      setFocusOrbitCameraPosition(tmpOrbitPos, mSel, yaw, pitch)
      camera.position.copy(tmpOrbitPos)
      applyFocusOrbitLookAt(camera, mSel)
    }
  }

  const syncSelectionPlanetWorldScale = () => {
    if (selectionPhase !== 'selecting' && selectionPhase !== 'selected') return
    if (!planet.mesh.visible) return
    const idx = pendingSelectInstanceIndex
    if (idx < 0 || idx >= movies.length) return
    const m = movies[idx]!
    const stPick = useGalaxyInteractionStore.getState()
    const maskPick = getSelectionMaskPickSet(
      stPick.selectedMovieId,
      stPick.focusNeighborIds,
      stPick.searchMode,
      stPick.selectionIds,
    )
    const { r } = resolveSelectionWorldRadius(m, uZ.value, uZw.value, galaxy.activeMaterial, maskPick)
    const stepH = planet.material.uniforms.uStepHeight.value as number
    const cuts = planet.material.uniforms.uCutCount.value as number
    planet.lastRadius = r * (1 + cuts * stepH)
    planet.mesh.scale.setScalar(r)
    planet.mesh.updateMatrixWorld(true)
  }

  const beginSelect = (movie: Movie) => {
    zCurrentDriver.cancel()
    planet.mesh.visible = true
    planet.material.uniforms.uAlpha.value = 1
    pendingSelectInstanceIndex = movies.findIndex((m) => m.id === movie.id)
    console.assert(pendingSelectInstanceIndex >= 0, '[Selection] movie must exist in mounted list')
    const stPick = useGalaxyInteractionStore.getState()
    const neighborIds = computeFocusNeighborIds(
      movies,
      { x: movie.x, y: movie.y, z: movie.z },
      stPick.focusNeighborRadius,
    )
    // First macro focus resets orbit; focus-to-focus retargeting preserves it.
    useGalaxyInteractionStore.setState(
      selectionPhase === 'idle'
        ? { focusNeighborIds: neighborIds, focusOrbit: { yaw: 0, pitch: 0 } }
        : { focusNeighborIds: neighborIds },
    )
    const maskPick = getSelectionMaskPickSet(
      movie.id,
      neighborIds,
      stPick.searchMode,
      stPick.selectionIds,
    )
    const { r, rActive } = resolveSelectionWorldRadius(movie, uZ.value, uZw.value, galaxy.activeMaterial, maskPick)
    const { yaw, pitch } = useGalaxyInteractionStore.getState().focusOrbit
    setFocusOrbitCameraPosition(toCam, movie, yaw, pitch)
    selectingEnteredFromMacro = selectionPhase === 'idle'
    if (!selectingEnteredFromMacro) {
      selectingStartQuat.copy(camera.quaternion)
      // 飞入结束帧对齐到新 pivot（与保留 yaw/pitch 一致）；飞行过程中不用此四元数插值
      selectingQuatHelper.position.copy(toCam)
      selectingQuatHelper.lookAt(movie.x, movie.y, movie.z)
      selectingEndQuat.copy(selectingQuatHelper.quaternion)
    }
    planet.setFromMovie(movie, meta.genre_palette, r)
    bindSelectionPlanetSpin(movie.id, performance.now())
    uFocused.value = -1
    const zSnap = useGalaxyInteractionStore.getState().zCurrent
    focusZAnimStart = zSnap
    focusZAnimTarget = movie.z
    console.log('[FocusZ] selecting', { zStart: focusZAnimStart, zTarget: focusZAnimTarget, movieId: movie.id })
    fromCam.copy(camera.position)
    focusDriver.start(SELECT_MS)
    selectionPhase = 'selecting'
    const camDz = movie.z - toCam.z
    console.log(
      `[Selection] phase=selecting | duration=${SELECT_MS}ms | focusCamΔz=${camDz.toFixed(4)} | planetR=${r.toFixed(4)} (activeWorld=${rActive.toFixed(4)})`,
    )
  }

  const beginDeselect = () => {
    uFocused.value = -1
    fromCam.copy(camera.position)
    toCam.copy(restCam)
    deselectFromQuat.copy(camera.quaternion)
    focusDriver.setImmediate(1)
    focusDriver.reverse(DESELECT_MS)
    selectionPhase = 'deselecting'
    console.log(`[Selection] phase=deselecting | duration=${DESELECT_MS}ms`)
  }

  const onSelectionStore = (
    state: { selectedMovieId: number | null },
    prev: { selectedMovieId: number | null },
  ) => {
    const id = state.selectedMovieId
    if (id === prev.selectedMovieId) return

    if (id === null) {
      useGalaxyInteractionStore.setState({ focusNeighborIds: null })
      if (selectionPhase === 'selected' || selectionPhase === 'selecting') {
        beginDeselect()
      }
      return
    }

    const movie = movies.find((m) => m.id === id)
    if (!movie) {
      console.warn(`[Selection] unknown movie id=${id}`)
      return
    }

    if (selectionPhase === 'idle') {
      restCam.copy(camera.position)
    }
    beginSelect(movie)
  }

  const unsubSelection = useGalaxyInteractionStore.subscribe(onSelectionStore)
  onSelectionStore(
    useGalaxyInteractionStore.getState(),
    { selectedMovieId: null },
  )

  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(renderer.getPixelRatio())
  const renderPass = new RenderPass(scene, camera)
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.95, 0.52, 0.82)
  composer.addPass(renderPass)
  /** P10.3 收尾：Bloom 生产默认关（验收未达标；未来不采用 Bloom）。`window.__bloom.enable()` 仍可加 pass 并切 `composer.render()`。见 `docs/reports/Phase 10.3 P10.3 Bloom 决策与收尾报告.md`。 */
  let postFxBloomEnabled = false

  const bloomDebug: BloomDebugControls = {
    get strength() {
      return bloomPass.strength
    },
    set strength(value: number) {
      bloomPass.strength = value
    },
    get radius() {
      return bloomPass.radius
    },
    set radius(value: number) {
      bloomPass.radius = value
    },
    get threshold() {
      return bloomPass.threshold
    },
    set threshold(value: number) {
      bloomPass.threshold = value
    },
    log() {
      console.log(
        `[PostFX] Bloom ${postFxBloomEnabled ? 'enabled' : 'available (off)'} | threshold=${bloomPass.threshold.toFixed(
          2,
        )} strength=${bloomPass.strength.toFixed(2)} radius=${bloomPass.radius.toFixed(2)}`,
      )
    },
    get enabled() {
      return postFxBloomEnabled
    },
    enable() {
      if (postFxBloomEnabled) return
      composer.addPass(bloomPass)
      postFxBloomEnabled = true
      bloomDebug.log()
    },
    disable() {
      if (!postFxBloomEnabled) return
      composer.removePass(bloomPass)
      postFxBloomEnabled = false
      console.log('[PostFX] Bloom disabled — using direct renderer.render (SRGB output)')
    },
  }
  window.__bloom = bloomDebug
  bloomDebug.log()

  const perlinBloom = createPerlinSelectiveBloom(renderer, scene, camera)
  perlinBloom.assignBloomLayer(planet.mesh)

  let focusEmissionTuning: FocusEmissionRuntimeTuning = {
    ...PLANET_VISUAL_DEFAULTS.focus.emissionTuning,
  }

  const setFocusEmissionTuning = (): void => {
    planet.setFocusEmissionTuning(focusEmissionTuning)
  }

  const focusVisualDebug: PlanetVisualDebug['focus'] = {
    get lightness() {
      return planet.material.uniforms.uPerlinL.value as number
    },
    set lightness(value: number) {
      planet.setFocusVisualTuning({
        lightness: Number(value),
        keyLightIntensity: planet.material.uniforms.uKeyLightIntensity.value as number,
      })
    },
  }

  const lightingVisualDebug: PlanetVisualDebug['lighting'] = {
    get keyLightIntensity() {
      return planet.material.uniforms.uKeyLightIntensity.value as number
    },
    set keyLightIntensity(value: number) {
      planet.setFocusVisualTuning({
        lightness: planet.material.uniforms.uPerlinL.value as number,
        keyLightIntensity: Number(value),
      })
    },
    get flatShadingMix() {
      return planet.material.uniforms.uFlatShadingMix.value as number
    },
    set flatShadingMix(value: number) {
      const next = Number(value)
      if (!Number.isFinite(next)) throw new Error('[PlanetVisual] lighting.flatShadingMix must be finite')
      planet.material.uniforms.uFlatShadingMix.value = THREE.MathUtils.clamp(next, 0, 1)
    },
    get direction() {
      const direction = planet.material.uniforms.uLightDir.value as THREE.Vector3
      return [direction.x, direction.y, direction.z]
    },
    set direction(value: [number, number, number]) {
      if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
        throw new Error('[PlanetVisual] lighting.direction must be a finite [x, y, z] tuple')
      }
      const direction = planet.material.uniforms.uLightDir.value as THREE.Vector3
      direction.set(value[0], value[1], value[2])
      if (direction.lengthSq() <= 1e-12) throw new Error('[PlanetVisual] lighting.direction must not be zero')
      direction.normalize()
    },
  }

  const bloomVisualDebug: PlanetVisualDebug['bloom'] = {
    get strength() { return perlinBloom.debug.strength },
    set strength(value: number) { perlinBloom.debug.strength = Number(value) },
    get radius() { return perlinBloom.debug.radius },
    set radius(value: number) { perlinBloom.debug.radius = Number(value) },
    get threshold() { return perlinBloom.debug.threshold },
    set threshold(value: number) { perlinBloom.debug.threshold = Number(value) },
  }

  const planetVisualDebug: PlanetVisualDebug = {
    get exponent() { return focusEmissionTuning.exponent },
    set exponent(value: number) {
      focusEmissionTuning = validateFocusEmissionRuntimeTuning({ ...focusEmissionTuning, exponent: Number(value) })
      setFocusEmissionTuning()
    },
    get intensityMin() { return focusEmissionTuning.intensityMin },
    set intensityMin(value: number) {
      focusEmissionTuning = validateFocusEmissionRuntimeTuning({ ...focusEmissionTuning, intensityMin: Number(value) })
      setFocusEmissionTuning()
    },
    get intensityMax() { return focusEmissionTuning.intensityMax },
    set intensityMax(value: number) {
      focusEmissionTuning = validateFocusEmissionRuntimeTuning({ ...focusEmissionTuning, intensityMax: Number(value) })
      setFocusEmissionTuning()
    },
    focus: focusVisualDebug,
    lighting: lightingVisualDebug,
    bloom: bloomVisualDebug,
    reset() {
      focusEmissionTuning = {
        ...PLANET_VISUAL_DEFAULTS.focus.emissionTuning,
      }
      setFocusEmissionTuning()
      focusVisualDebug.lightness = PLANET_VISUAL_DEFAULTS.focus.lightness
      lightingVisualDebug.keyLightIntensity = PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity
      lightingVisualDebug.flatShadingMix = PLANET_VISUAL_DEFAULTS.lighting.flatShadingMix
      const [x, y, z] = PLANET_VISUAL_DEFAULTS.lighting.direction
      lightingVisualDebug.direction = [x, y, z]
      bloomVisualDebug.strength = PLANET_VISUAL_DEFAULTS.focus.bloom.strength
      bloomVisualDebug.radius = PLANET_VISUAL_DEFAULTS.focus.bloom.radius
      bloomVisualDebug.threshold = PLANET_VISUAL_DEFAULTS.focus.bloom.threshold
      this.log()
    },
    log() {
      const [x, y, z] = lightingVisualDebug.direction
      console.log(
        `[PlanetVisual] exponent=${focusEmissionTuning.exponent.toFixed(3)} intensityMin=${focusEmissionTuning.intensityMin.toFixed(4)} intensityMax=${focusEmissionTuning.intensityMax.toFixed(4)} | ` +
          `focus.lightness=${focusVisualDebug.lightness.toFixed(4)} | lighting.keyLightIntensity=${lightingVisualDebug.keyLightIntensity.toFixed(4)} flatShadingMix=${lightingVisualDebug.flatShadingMix.toFixed(4)} direction=(${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}) | ` +
          `bloom strength=${bloomVisualDebug.strength.toFixed(4)} radius=${bloomVisualDebug.radius.toFixed(4)} threshold=${bloomVisualDebug.threshold.toFixed(4)}`,
      )
    },
  }
  window.__planetVisual = planetVisualDebug
  planetVisualDebug.log()

  const uSizeScale = galUniforms.uSizeScale as THREE.Uniform<number>
  const uActiveSizeMul = galUniforms.uActiveSizeMul as THREE.Uniform<number>
  const uBgSizeMul = galUniforms.uBgSizeMul as THREE.Uniform<number>
  const uLMin = galUniforms.uLMin as THREE.Uniform<number>
  const uLMax = galUniforms.uLMax as THREE.Uniform<number>
  const uHighRatingT = galUniforms.uHighRatingT as THREE.Uniform<number>
  const uHighTierTRangeScale = galUniforms.uHighTierTRangeScale as THREE.Uniform<number>
  const uLightnessRatingExponent = galUniforms.uLightnessRatingExponent as THREE.Uniform<number>
  const uDistanceLightnessFloorU = galUniforms.uDistanceLightnessFloor as THREE.Uniform<number>
  const uHuntGammaU = galUniforms.uHuntGamma as THREE.Uniform<number>
  const uHuntApplyMaskU = galUniforms.uHuntApplyMask as THREE.Uniform<number>
  const uChroma = galUniforms.uChroma as THREE.Uniform<number>

  const pointScaleDebug: GalaxyPointScaleDebug = {
    get scale() {
      return uSizeScale.value
    },
    set scale(value: number) {
      uSizeScale.value = value
      syncSelectionPlanetWorldScale()
    },
    get activeSizeMul() {
      return uActiveSizeMul.value
    },
    set activeSizeMul(value: number) {
      uActiveSizeMul.value = value
      syncSelectionPlanetWorldScale()
    },
    get bgSizeMul() {
      return uBgSizeMul.value
    },
    set bgSizeMul(value: number) {
      uBgSizeMul.value = value
    },
    log() {
      console.log(
        `[Galaxy] uSizeScale=${uSizeScale.value} uActiveSizeMul=${uActiveSizeMul.value} uBgSizeMul=${uBgSizeMul.value}`,
      )
    },
  }
  window.__galaxyPointScale = pointScaleDebug
  pointScaleDebug.log()

  const galaxyColorDebug: GalaxyColorDebug = {
    get lMin() {
      return uLMin.value
    },
    set lMin(value: number) {
      uLMin.value = value
    },
    get lMax() {
      return uLMax.value
    },
    set lMax(value: number) {
      uLMax.value = value
    },
    get highRatingT() {
      return uHighRatingT.value
    },
    set highRatingT(value: number) {
      uHighRatingT.value = value
    },
    get highTierTRangeScale() {
      return uHighTierTRangeScale.value
    },
    set highTierTRangeScale(value: number) {
      uHighTierTRangeScale.value = value
    },
    get lightnessRatingExponent() {
      return uLightnessRatingExponent.value
    },
    set lightnessRatingExponent(value: number) {
      uLightnessRatingExponent.value = value
    },
    get distanceLightnessFloor() {
      return uDistanceLightnessFloorU.value
    },
    set distanceLightnessFloor(value: number) {
      uDistanceLightnessFloorU.value = THREE.MathUtils.clamp(value, 0.02, 1)
    },
    get huntGamma() {
      return uHuntGammaU.value
    },
    set huntGamma(value: number) {
      uHuntGammaU.value = THREE.MathUtils.clamp(value, 0, 3)
    },
    get huntApplyMask() {
      return uHuntApplyMaskU.value
    },
    set huntApplyMask(value: number) {
      uHuntApplyMaskU.value = Math.round(THREE.MathUtils.clamp(value, 0, 7))
    },
    get chroma() {
      return uChroma.value
    },
    set chroma(value: number) {
      uChroma.value = value
    },
    get focusNonTargetActiveAlpha() {
      return uFocusNonTargetActiveAlpha.value
    },
    set focusNonTargetActiveAlpha(value: number) {
      uFocusNonTargetActiveAlpha.value = THREE.MathUtils.clamp(value, 0.02, 1)
    },
    get focusHoveredActiveAlpha() {
      return uFocusHoveredActiveAlpha.value
    },
    set focusHoveredActiveAlpha(value: number) {
      uFocusHoveredActiveAlpha.value = THREE.MathUtils.clamp(value, 0.02, 1)
    },
    get focusDimChroma() {
      return uFocusDimChroma.value
    },
    set focusDimChroma(value: number) {
      uFocusDimChroma.value = THREE.MathUtils.clamp(value, 0, 1.5)
    },
    get focusDimL() {
      return uFocusDimL.value
    },
    set focusDimL(value: number) {
      uFocusDimL.value = THREE.MathUtils.clamp(value, 0.05, 1.5)
    },
    get focusDimMode() {
      return uFocusDimMode.value
    },
    set focusDimMode(value: number) {
      const v = Math.round(value)
      uFocusDimMode.value = v === 1 ? 1 : 0
    },
    log() {
      console.log(
        `[Galaxy] OKLCH+P10.1 uLMin=${uLMin.value} uLMax=${uLMax.value} uHighRatingT=${uHighRatingT.value} uHighTierTRangeScale=${uHighTierTRangeScale.value} uLightnessRatingExponent=${uLightnessRatingExponent.value} uChroma=${uChroma.value} | P17.1 uDistanceLightnessFloor=${uDistanceLightnessFloorU.value} (uZCamDistance sync via store) | P17.2 uHuntGamma=${uHuntGammaU.value} uHuntApplyMask=${uHuntApplyMaskU.value} | P11.1 uFocusNonTargetActiveAlpha=${uFocusNonTargetActiveAlpha.value} uFocusHoveredActiveAlpha=${uFocusHoveredActiveAlpha.value} | P11.2 uFocusDimChroma=${uFocusDimChroma.value} uFocusDimL=${uFocusDimL.value} uFocusDimMode=${uFocusDimMode.value}`,
      )
    },
  }
  /** Auxiliary OKLCH star-body tuning — not the Phase 32 SDR brightness primary path (`__sdrTuning` / `__galaxyUniverseBg`). */
  window.__galaxyColor = galaxyColorDebug

  const uIdleNearFadeEnabled = galUniforms.uIdleNearFadeEnabled as THREE.Uniform<number>
  const uIdleNearFadeStartDist = galUniforms.uIdleNearFadeStartDist as THREE.Uniform<number>
  const uIdleNearFadeWidth = galUniforms.uIdleNearFadeWidth as THREE.Uniform<number>
  const uIdleNearFadeMinAlpha = galUniforms.uIdleNearFadeMinAlpha as THREE.Uniform<number>

  const idleNearFadeDebug: GalaxyIdleNearFadeDebug = {
    get enabled() {
      return uIdleNearFadeEnabled.value
    },
    set enabled(value: number) {
      uIdleNearFadeEnabled.value = value > 0.5 ? 1 : 0
    },
    get startDist() {
      return uIdleNearFadeStartDist.value
    },
    set startDist(value: number) {
      uIdleNearFadeStartDist.value = Math.max(0.05, value)
    },
    get width() {
      return uIdleNearFadeWidth.value
    },
    set width(value: number) {
      uIdleNearFadeWidth.value = Math.max(0.05, value)
    },
    get minAlpha() {
      return uIdleNearFadeMinAlpha.value
    },
    set minAlpha(value: number) {
      uIdleNearFadeMinAlpha.value = THREE.MathUtils.clamp(value, 0, 1)
    },
    reset() {
      applyIdleNearFadeDefaults({
        uIdleNearFadeEnabled,
        uIdleNearFadeStartDist,
        uIdleNearFadeWidth,
        uIdleNearFadeMinAlpha,
      })
      this.log()
    },
    log() {
      console.log(
        `[Galaxy] P26.3 idle near-fade enabled=${uIdleNearFadeEnabled.value > 0.5 ? 'on' : 'off'} | uIdleNearFadeStartDist=${uIdleNearFadeStartDist.value.toFixed(3)} uIdleNearFadeWidth=${uIdleNearFadeWidth.value.toFixed(3)} uIdleNearFadeMinAlpha=${uIdleNearFadeMinAlpha.value.toFixed(3)} | defaults from idleNearFade.ts: start=${IDLE_NEAR_FADE_DEFAULTS.startDist} width=${IDLE_NEAR_FADE_DEFAULTS.width} minA=${IDLE_NEAR_FADE_DEFAULTS.minAlpha} | reset: __galaxyIdleNearFade.reset()`,
      )
    },
  }
  window.__galaxyIdleNearFade = idleNearFadeDebug

  const uIdleZFadeMode = galUniforms.uIdleZFadeMode as THREE.Uniform<number>
  const uIdleZFadeOutsideAlpha = galUniforms.uIdleZFadeOutsideAlpha as THREE.Uniform<number>

  const idleZFadeDebug: GalaxyIdleZFadeDebug = {
    get mode() {
      return uIdleZFadeMode.value
    },
    set mode(value: number) {
      const x = Number(value)
      uIdleZFadeMode.value = x > 0.5 ? 1 : x < -0.5 ? -1 : 0
    },
    get outsideAlpha() {
      return uIdleZFadeOutsideAlpha.value
    },
    set outsideAlpha(value: number) {
      uIdleZFadeOutsideAlpha.value = THREE.MathUtils.clamp(value, 0, 1)
    },
    reset() {
      applyIdleZFadeDefaults({ uIdleZFadeMode, uIdleZFadeOutsideAlpha })
      this.log()
    },
    log() {
      const m = uIdleZFadeMode.value
      const label = m > 0.5 ? 'future (aZ > zHi)' : m < -0.5 ? 'past (aZ < zCurrent)' : 'off'
      console.log(
        '[Galaxy] P27 idle Z-fade mode=' +
          m +
          ' (' +
          label +
          ') outsideAlpha=' +
          uIdleZFadeOutsideAlpha.value.toFixed(3) +
          ' | defaults idleZFade.ts: mode=' +
          IDLE_Z_FADE_DEFAULTS.mode +
          ' outsideAlpha=' +
          IDLE_Z_FADE_DEFAULTS.outsideAlpha +
          ' | reset: __galaxyIdleZFade.reset()',
      )
    },
  }
  window.__galaxyIdleZFade = idleZFadeDebug

  const idleMacroFadeDebug: GalaxyIdleMacroFadeDebug = {
    get blend() {
      return idleMacroFadesBlendCurrent
    },
    get selectionPhase() {
      return selectionPhase
    },
    get focusProgress() {
      return focusDriver.progress
    },
    get selectingEnteredFromMacro() {
      return selectingEnteredFromMacro
    },
    log() {
      console.log(
        `[Galaxy] P32.3 macro-fade blend=${idleMacroFadesBlendCurrent.toFixed(4)} phase=${selectionPhase} focusProgress=${focusDriver.progress.toFixed(4)} selectingFromMacro=${selectingEnteredFromMacro} | uIdleMacroFadesBlend syncs SELECT_MS=${SELECT_MS} DESELECT_MS=${DESELECT_MS}`,
      )
    },
  }
  window.__galaxyIdleMacroFade = idleMacroFadeDebug

  const universeBgTargets: UniverseBgTargets = { scene, renderer }
  const universeBgDebug: GalaxyUniverseBgDebug = {
    get color(): string {
      return readUniverseBgHex()
    },
    set color(value: string | number) {
      applyUniverseBackgroundColor(value, universeBgTargets, { source: 'runtime' })
    },
    apply(value: string | number) {
      return applyUniverseBackgroundColor(value, universeBgTargets, { source: 'runtime' })
    },
    reset() {
      return resetUniverseBackgroundColor(universeBgTargets)
    },
    get source(): string {
      return getActiveUniverseBgSource()
    },
    log() {
      console.log(formatUniverseBgLogLine(universeBgTargets, getActiveUniverseBgSource()))
    },
  }
  window.__galaxyUniverseBg = universeBgDebug

  const sdrTuningDebug: SdrRuntimeTuningDebug = {
    get defaults() {
      return SDR_RUNTIME_DEFAULTS
    },
    log() {
      console.log(
        formatSdrRuntimeTuningLog({
          universeBgHex: readUniverseBgHex(),
          universeBgSource: getActiveUniverseBgSource(),
          idleNearFade: {
            enabled: uIdleNearFadeEnabled.value,
            startDist: uIdleNearFadeStartDist.value,
            width: uIdleNearFadeWidth.value,
            minAlpha: uIdleNearFadeMinAlpha.value,
          },
          idleZFade: {
            mode: uIdleZFadeMode.value,
            outsideAlpha: uIdleZFadeOutsideAlpha.value,
          },
          macroFadeBlend: idleMacroFadesBlendCurrent,
          selectionPhase,
          focusProgress: focusDriver.progress,
        }),
      )
      universeBgDebug.log()
      idleNearFadeDebug.log()
      idleZFadeDebug.log()
      idleMacroFadeDebug.log()
    },
    resetAll() {
      universeBgDebug.reset()
      idleNearFadeDebug.reset()
      idleZFadeDebug.reset()
      console.log('[Galaxy] SDR runtime tuning reset to shipped defaults (macro-fade blend unchanged; toggle focus to observe transition)')
      this.log()
    },
  }
  window.__sdrTuning = sdrTuningDebug
  sdrTuningDebug.log()

  const planetTerraceDebug: SelectionPlanetTerraceDebug = {
    get stepHeight() {
      return planet.material.uniforms.uStepHeight.value as number
    },
    set stepHeight(value: number) {
      planet.material.uniforms.uStepHeight.value = THREE.MathUtils.clamp(value, 0, 0.25)
      syncSelectionPlanetWorldScale()
    },
    get stepSmoothness() {
      return planet.material.uniforms.uStepSmoothness.value as number
    },
    set stepSmoothness(value: number) {
      planet.material.uniforms.uStepSmoothness.value = THREE.MathUtils.clamp(value, 0, 0.25)
    },
    get flatShadingMix() {
      return planet.material.uniforms.uFlatShadingMix.value as number
    },
    set flatShadingMix(value: number) {
      planet.material.uniforms.uFlatShadingMix.value = THREE.MathUtils.clamp(value, 0, 1)
    },
    get perlinLightDir() {
      return planet.material.uniforms.uLightDir.value as THREE.Vector3
    },
    set perlinLightDir(value: THREE.Vector3) {
      const v = planet.material.uniforms.uLightDir.value as THREE.Vector3
      v.copy(value)
      if (v.lengthSq() > 1e-12) v.normalize()
    },
    get perlinLightingEnabled() {
      return (planet.material.uniforms.uLightingEnabled.value as number) > 0.5
    },
    set perlinLightingEnabled(value: boolean) {
      planet.material.uniforms.uLightingEnabled.value = value ? 1 : 0
    },
    log() {
      const u = planet.material.uniforms
      const ld = u.uLightDir.value as THREE.Vector3
      const lightingOn = (u.uLightingEnabled.value as number) > 0.5
      console.log(
        `[Planet] uStepHeight=${(u.uStepHeight.value as number).toFixed(4)} uStepSmoothness=${(u.uStepSmoothness.value as number).toFixed(4)} uBandCount=${u.uBandCount.value} uCutCount=${u.uCutCount.value} | P11.4 lightingEnabled=${lightingOn ? 1 : 0} uFlatShadingMix=${(u.uFlatShadingMix.value as number).toFixed(2)} uEmissionIntensity=${(u.uEmissionIntensity.value as number).toFixed(4)} uKeyLightIntensity=${(u.uKeyLightIntensity.value as number).toFixed(2)} uLightDir=(${ld.x.toFixed(2)},${ld.y.toFixed(2)},${ld.z.toFixed(2)}) uPerlinL=${(u.uPerlinL.value as number).toFixed(4)} uPerlinChroma=${(u.uPerlinChroma.value as number).toFixed(4)}`,
      )
    },
  }
  window.__planetTerrace = planetTerraceDebug
  planetTerraceDebug.log()

  /** Phase 5.1.5 — e.g. `__galaxyInteraction.zCamDistance = 30` or `__galaxyInteraction.store.setState({ zCurrent: 2000 })`. */
  const interactionDebug: GalaxyInteractionDebug = {
    store: useGalaxyInteractionStore,
    get zCurrent() {
      return useGalaxyInteractionStore.getState().zCurrent
    },
    set zCurrent(value: number) {
      useGalaxyInteractionStore.setState({ zCurrent: value })
    },
    get zVisWindow() {
      return useGalaxyInteractionStore.getState().zVisWindow
    },
    set zVisWindow(value: number) {
      useGalaxyInteractionStore.setState({ zVisWindow: value })
    },
    get zCamDistance() {
      return useGalaxyInteractionStore.getState().zCamDistance
    },
    set zCamDistance(value: number) {
      useGalaxyInteractionStore.setState({ zCamDistance: value })
    },
    get constellationEnabled() {
      return useGalaxyInteractionStore.getState().constellationEnabled
    },
    set constellationEnabled(value: boolean) {
      useGalaxyInteractionStore.setState({ constellationEnabled: value })
    },
    log() {
      const s = useGalaxyInteractionStore.getState()
      console.log(
        `[Galaxy] zCurrent=${s.zCurrent.toFixed(4)} zVisWindow=${s.zVisWindow.toFixed(4)} zCamDistance=${s.zCamDistance.toFixed(4)} (macro idle: camera.z = zCurrent - zCamDistance) | constellationEnabled=${s.constellationEnabled}`,
      )
    },
  }
  window.__galaxyInteraction = interactionDebug
  interactionDebug.log()

  const resize = () => {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    const pr = Math.min(window.devicePixelRatio, 2)

    // H-G (Phase 5.1.4.7): set pixel ratio before setSize so drawing buffer uses the
    // intended DPR; keep EffectComposer in sync to avoid RT vs canvas viewport mismatch.
    renderer.setPixelRatio(pr)
    composer.setPixelRatio(pr)

    renderer.setSize(w, h, true)
    composer.setSize(w, h)
    bloomPass.setSize(w, h)
    perlinBloom.setSize(w, h, pr)

    camera.aspect = w / h
    camera.updateProjectionMatrix()

    galUniforms.uPixelRatio.value = pr
  }

  resize()

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null
  ro?.observe(container)
  window.addEventListener('resize', resize)

  container.appendChild(renderer.domElement)

  const canvas = renderer.domElement

  const getCameraMode = () => (selectionPhase === 'selected' ? 'orbit' : 'macro')
  const getOrbitPivot = () => {
    if (selectionPhase !== 'selected') return null
    const m = movies[pendingSelectInstanceIndex]
    if (!m) return null
    orbitPivotVec.set(m.x, m.y, m.z)
    return orbitPivotVec
  }

  const detachControls = attachGalaxyCameraControls(camera, canvas, {
    zRange: meta.z_range,
    xyRange: meta.xy_range,
    getInputLocked: () => inputLocked,
    getMacroZWheel: macroZWheel,
    getCameraMode,
    getOrbitPivot,
  })

  const detachInteraction = attachGalaxyActiveMeshInteraction({
    camera,
    domElement: canvas,
    activeMesh: galaxy.active,
    movies,
    activeMaterial: galaxy.activeMaterial,
    selectionPlanet: planet,
    getIdleMacroFadesBlend: () => idleMacroFadesBlendCurrent,
  })

  const w = renderer.domElement.width
  const h = renderer.domElement.height
  console.log(
    `[Scene] Renderer: ${webglLabel} | Canvas: ${w}x${h} | zCurrent=${zCurrent.toFixed(2)} zCamDistance=${zCamDistance.toFixed(2)} → camera Z=${camera.position.z.toFixed(4)}`,
  )

  let raf = 0
  let prevSearchSelectMode = -1
  const tick = () => {
    raf = requestAnimationFrame(tick)
    const nowMs = performance.now()
    applySelectionFrame(nowMs)
    if (zCurrentDriver.active && selectionPhase !== 'selecting') {
      zCurrentDriver.tick(nowMs)
      const p = zCurrentDriver.progress
      const zNext = zTimelineAnimFrom + (zTimelineAnimTo - zTimelineAnimFrom) * p
      useGalaxyInteractionStore.setState({ zCurrent: zNext })
    }
    const st = useGalaxyInteractionStore.getState()
    // P16.3 / P19 — active material dual path (state machine §3.2.1): macro browse
    // (`selectionPhase === 'idle'` && no selectedMovieId) uses opaque + depthWrite so strip
    // actives depth-sort correctly (movie search, Space dolly, person/genre select pre-focus).
    // `selectionPhase` is this closure (not Zustand). Focus phases need path B for P11.1.
    const wantOpaque = selectionPhase === 'idle' && st.selectedMovieId === null
    const activeMat = galaxy.activeMaterial
    if (activeMat.transparent !== !wantOpaque || activeMat.depthWrite !== wantOpaque) {
      activeMat.transparent = !wantOpaque
      activeMat.depthWrite = wantOpaque
      activeMat.needsUpdate = true
      console.log(
        '[Active material]',
        wantOpaque ? 'opaque (path A · macro browse)' : 'transparent (path B · focus)',
      )
    }
    const idleMat = galaxy.idleMaterial
    const idleNearFadeOn = (galUniforms.uIdleNearFadeEnabled as THREE.Uniform<number>).value > 0.5
    const idleZFadeOn = Math.abs((galUniforms.uIdleZFadeMode as THREE.Uniform<number>).value) > 0.5
    const macroFadeBlend = computeIdleMacroFadesBlend()
    if (selectionPhase === 'idle' || selectionPhase === 'selected') {
      syncIdleMacroFadesBlend(macroFadeBlend)
    }
    const inMacroFadeTransition =
      (selectionPhase === 'selecting' && selectingEnteredFromMacro) || selectionPhase === 'deselecting'
    const idleAlphaFadeOn =
      (idleNearFadeOn || idleZFadeOn) && (macroFadeBlend > 1e-6 || inMacroFadeTransition)
    if (idleMat.transparent !== idleAlphaFadeOn || idleMat.depthWrite !== !idleAlphaFadeOn) {
      idleMat.transparent = idleAlphaFadeOn
      idleMat.depthWrite = !idleAlphaFadeOn
      idleMat.alphaTest = idleAlphaFadeOn ? 0.003 : 0
      idleMat.needsUpdate = true
      console.log(
        '[Idle material]',
        idleAlphaFadeOn
          ? `transparent (P26.3 near=${idleNearFadeOn ? 'on' : 'off'} · P27 z=${idleZFadeOn ? 'on' : 'off'})`
          : 'opaque + depthWrite (idle alpha fades off)',
      )
    }
    // P12.6 / P13.2 — person/genre mask vs focus spherical neighborhood vs timeline slab
    const selectionDrawMode =
      st.selectedMovieId !== null ? 2 : st.searchMode === 'person' || st.searchMode === 'genre' ? 1 : 0
    uSelectionMode.value = selectionDrawMode
    if (selectionDrawMode !== prevSearchSelectMode) {
      prevSearchSelectMode = selectionDrawMode
      console.log('[Scene] uSelectionMode=', selectionDrawMode, '| searchMode=', st.searchMode, '| filmFocus=', st.selectedMovieId !== null)
    }
    uZ.value = st.zCurrent
    uZw.value = st.zVisWindow
    uZCamDistUniform.value = st.zCamDistance
    {
      const hid = st.hoveredMovieId
      uHoveredInstanceId.value = hid === null ? -1 : movieIdToIndex.get(hid) ?? -1
    }
    {
      const constellationActive =
        st.searchMode === 'person' &&
        st.constellationEnabled &&
        (st.selectionIds?.length ?? 0) >= 2 &&
        st.selectedMovieId === null &&
        constellation.group.visible
      if (!constellationActive || st.selectionPersonKey === null || st.hoveredMovieId === null) {
        constellation.resetChainOpacities()
      } else {
        const index = useSearchIndexStore.getState().data
        const roleMask =
          index?.people[st.selectionPersonKey]?.movie_roles?.[String(st.hoveredMovieId)] ?? 0
        constellation.updateHoverFromRoleMask(roleMask === 0 ? null : roleMask)
      }
    }
    constellation.tickOpacity(nowMs)
    syncSelectionPlanetWorldScale()
    applySelectionPlanetSpin(nowMs)

    if (selectionPhase === 'idle') {
      camera.position.z = st.zCurrent - st.zCamDistance
      clampGalaxyCameraXY(camera, meta.xy_range, 0.08)
    }
    camera.updateMatrixWorld()
    camera.getWorldPosition(scratchCameraWorldPos)
    uCameraWorldPosGal.value.copy(scratchCameraWorldPos)
    // P13.4 — Timeline reads `bridgeZ` ≡ macro axis focus; during focus `zCurrent` is kept at movie.z (enter anim only).
    setGalaxyCameraZ(st.zCurrent)
    const expectedPr = Math.min(window.devicePixelRatio, 2)
    if (renderer.getPixelRatio() !== expectedPr) {
      resize()
    }
    if (postFxBloomEnabled) {
      composer.render()
    } else {
      const planetAlpha = planet.material.uniforms.uAlpha.value as number
      perlinBloom.renderFrame({
        userEnabled: perlinBloom.debug.enabled,
        globalPostFxBloomEnabled: postFxBloomEnabled,
        planetVisible: planet.mesh.visible,
        planetAlpha,
      })
    }
  }
  tick()

  const dispose = () => {
    zCurrentDriver.cancel()
    cancelAnimationFrame(raf)
    ro?.disconnect()
    window.removeEventListener('resize', resize)
    unsubSelection()
    unsubSelectionMask()
    unsubConstellation()
    unsubConstellationIndex()
    constellation.group.removeFromParent()
    constellation.dispose()
    detachControls()
    detachInteraction()
    planet.mesh.removeFromParent()
    planet.dispose()
    galaxy.idle.removeFromParent()
    galaxy.active.removeFromParent()
    galaxy.dispose()
    if (window.__hdrCapabilities === hdrCapabilitiesDebug) {
      delete window.__hdrCapabilities
    }
    if (window.__sdrFallback === sdrFallbackDebug) {
      delete window.__sdrFallback
    }
    hdrProofDebug.dispose()
    if (window.__hdrProbe === hdrProofDebug) {
      delete window.__hdrProbe
    }
    if (window.__bloom === bloomDebug) {
      delete window.__bloom
    }
    perlinBloom.dispose()
    if (window.__galaxyPointScale === pointScaleDebug) {
      delete window.__galaxyPointScale
    }
    if (window.__galaxyColor === galaxyColorDebug) {
      delete window.__galaxyColor
    }
    if (window.__galaxyIdleNearFade === idleNearFadeDebug) {
      delete window.__galaxyIdleNearFade
    }
    if (window.__galaxyIdleZFade === idleZFadeDebug) {
      delete window.__galaxyIdleZFade
    }
    if (window.__galaxyUniverseBg === universeBgDebug) {
      delete window.__galaxyUniverseBg
    }
    if (window.__galaxyIdleMacroFade === idleMacroFadeDebug) {
      delete window.__galaxyIdleMacroFade
    }
    if (window.__sdrTuning === sdrTuningDebug) {
      delete window.__sdrTuning
    }
    if (window.__galaxyInteraction === interactionDebug) {
      delete window.__galaxyInteraction
    }
    if (window.__planetTerrace === planetTerraceDebug) {
      delete window.__planetTerrace
    }
    if (postFxBloomEnabled) {
      composer.removePass(bloomPass)
      postFxBloomEnabled = false
    }
    composer.dispose()
    renderer.dispose()
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement)
    }
  }

  return {
    renderer,
    scene,
    camera,
    dispose,
    controller: { animateZCurrentTo },
    galaxyMaterial: galaxy.idleMaterial,
    galaxyActiveMaterial: galaxy.activeMaterial,
    selectionPlanet: planet,
  }
}
