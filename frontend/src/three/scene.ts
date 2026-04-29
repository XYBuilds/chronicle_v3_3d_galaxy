import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import { setGalaxyCameraZ } from '@/lib/galaxyCameraZBridge'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { useSearchIndexStore } from '@/store/searchIndexStore'
import type { Meta, Movie } from '@/types/galaxy'

import { attachGalaxyCameraControls, clampGalaxyCameraXY, GALAXY_CAMERA_EULER, setFocusCameraPosition } from './camera'
import { CONSTELLATION_SURFACE_GAP_WORLD, createConstellation } from './constellation'
import { createGalaxyDualMeshes } from './galaxyMeshes'
import { attachGalaxyActiveMeshInteraction } from './interaction'
import { createSelectionPlanet, type SelectionPlanetHandle } from './planet'
import { computeActiveWorldRadius, getSelectionMaskPickSet, resolveSelectionWorldRadius } from './screenRadius'
import { buildMovieIdToIndexMap, setSelectionMask, type SelectionMaskUniformBag } from './selectionMask'

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
  /** P10.2 — `1/(1+k·dz²)` for `dz = max(0, aZ - (uZCurrent+uZVisWindow))` (world Z, decimal years). */
  distanceFalloffK: number
  /** P10.2 — `0` off (P8.4 idle alpha), `1` on (color × falloff + high idle alpha vs bloom halo). */
  distanceFalloffMode: number
  chroma: number
  /** P11.1 — alpha of non-target active stars when focus blend = 1 (default 0.1). */
  focusNonTargetActiveAlpha: number
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

/** Dev console: `window.__planetTerrace` — Perlin focus sphere terrace + P11.4 lighting uniforms. */
interface SelectionPlanetTerraceDebug {
  /** Unit-sphere extrusion per band step; world radius uses `× (1 + cuts × stepHeight)`. Clamped to [0, 0.25] on set. */
  stepHeight: number
  /** Noise-domain smoothstep half-width at thresholds; 0 ≈ hard cuts. Clamped to [0, 0.25] on set. */
  stepSmoothness: number
  /** P11.4 — derivative vs geometric normal (1 = screen-space normal from world-position derivatives). */
  flatShadingMix: number
  /** P11.4 — ambient factor in `lit = base × (ambient + diffuse × lambert)`. */
  perlinAmbient: number
  /** P11.4 — diffuse factor (set 0 for flat ambient-only). */
  perlinDiffuse: number
  /** P11.4 — world-space light direction (normalized on set). */
  perlinLightDir: THREE.Vector3
  log: () => void
}

declare global {
  interface Window {
    __bloom?: BloomDebugControls
    __galaxyPointScale?: GalaxyPointScaleDebug
    __galaxyColor?: GalaxyColorDebug
    __galaxyInteraction?: GalaxyInteractionDebug
    __planetTerrace?: SelectionPlanetTerraceDebug
  }
}

export interface GalaxySceneMount {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  dispose: () => void
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
const SELECT_MS = 700
const DESELECT_MS = 450

function easeOutCubic(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1)
  return 1 - Math.pow(1 - x, 3)
}

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
  const zVisWindow = 1
  /** Rev 4 plan: start at the earliest year in `z_range` so the first screen is the time origin. */
  const zCurrent = zLo
  useGalaxyInteractionStore.setState({ zCurrent, zVisWindow, zCamDistance })

  const { cx, cy } = xyCenter(meta)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)

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
  renderer.outputColorSpace = THREE.SRGBColorSpace

  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose()
    throw new Error(
      '[Scene] 需要 WebGL2（`gl_InstanceID` 与双 InstancedMesh 管线）。请升级浏览器或启用硬件加速；与 Phase 7.2 红线一致。',
    )
  }

  const gl = renderer.getContext()
  const webglLabel = gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1'

  const pr = Math.min(window.devicePixelRatio, 2)
  const galaxy = createGalaxyDualMeshes(movies, pr, renderer.capabilities.maxTextureSize)
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

  const syncSelectionMaskFromStore = () => {
    setSelectionMask(useGalaxyInteractionStore.getState().selectionIds, movieIdToIndex, selectionMaskUniforms)
  }
  syncSelectionMaskFromStore()
  const unsubSelectionMask = useGalaxyInteractionStore.subscribe((state, prev) => {
    if (state.selectionIds === prev.selectionIds) return
    syncSelectionMaskFromStore()
  })

  const uSelectionMode = galUniforms.uSelectionMode as THREE.Uniform<number>
  const uZ = galUniforms.uZCurrent as THREE.Uniform<number>
  const uZw = galUniforms.uZVisWindow as THREE.Uniform<number>
  const uFocused = galUniforms.uFocusedInstanceId as THREE.Uniform<number>
  const uFocusCameraBlend = galUniforms.uFocusCameraBlend as THREE.Uniform<number>
  const uFocusTargetInstanceId = galUniforms.uFocusTargetInstanceId as THREE.Uniform<number>
  const uFocusNonTargetActiveAlpha = galUniforms.uFocusNonTargetActiveAlpha as THREE.Uniform<number>
  const uFocusDimChroma = galUniforms.uFocusDimChroma as THREE.Uniform<number>
  const uFocusDimL = galUniforms.uFocusDimL as THREE.Uniform<number>
  const uFocusDimMode = galUniforms.uFocusDimMode as THREE.Uniform<number>
  uZ.value = zCurrent
  uZw.value = zVisWindow
  uFocused.value = -1
  uFocusCameraBlend.value = 0
  uFocusTargetInstanceId.value = -1
  scene.add(galaxy.idle)
  scene.add(galaxy.active)

  const movieByIdForConstellation = new Map<number, Movie>()
  for (const m of movies) {
    movieByIdForConstellation.set(m.id, m)
  }
  const constellation = createConstellation()
  constellation.mesh.renderOrder = 0.5
  scene.add(constellation.mesh)

  const syncConstellationFromStores = () => {
    const st = useGalaxyInteractionStore.getState()
    const index = useSearchIndexStore.getState().data
    const entry =
      st.searchMode === 'person' && st.selectionPersonKey && index
        ? index.people[st.selectionPersonKey]
        : undefined
    const maskPick = getSelectionMaskPickSet(st.searchMode, st.selectionIds)
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

  type SelectionPhase = 'idle' | 'selecting' | 'selected' | 'deselecting'
  let selectionPhase: SelectionPhase = 'idle'
  const macroZWheel = () => selectionPhase === 'idle'
  let animStartMs = 0
  const restCam = new THREE.Vector3()
  const fromCam = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  let inputLocked = false

  let pendingSelectInstanceIndex = 0

  const applySelectionFrame = (nowMs: number) => {
    if (selectionPhase === 'idle') {
      uFocused.value = -1
      uFocusTargetInstanceId.value = -1
      uFocusCameraBlend.value = 0
      planet.mesh.visible = false
      planet.material.uniforms.uAlpha.value = 0
      inputLocked = false
      return
    }

    if (selectionPhase === 'selecting') {
      inputLocked = true
      uFocused.value = -1
      const t = Math.min(1, (nowMs - animStartMs) / SELECT_MS)
      const camEased = easeOutCubic(t)
      camera.position.lerpVectors(fromCam, toCam, camEased)
      camera.rotation.copy(GALAXY_CAMERA_EULER)
      uFocusTargetInstanceId.value = pendingSelectInstanceIndex
      uFocusCameraBlend.value = camEased
      if (t >= 1) {
        selectionPhase = 'selected'
        uFocused.value = pendingSelectInstanceIndex
        uFocusCameraBlend.value = 1
        planet.mesh.visible = true
        planet.material.uniforms.uAlpha.value = 1
        camera.position.copy(toCam)
        console.log('[Selection] phase=selected | dual mesh instance hidden | planet visible')
      }
      return
    }

    if (selectionPhase === 'deselecting') {
      inputLocked = true
      uFocused.value = -1
      const t = Math.min(1, (nowMs - animStartMs) / DESELECT_MS)
      const camEased = easeOutCubic(t)
      camera.position.lerpVectors(fromCam, toCam, camEased)
      camera.rotation.copy(GALAXY_CAMERA_EULER)
      uFocusTargetInstanceId.value = pendingSelectInstanceIndex
      uFocusCameraBlend.value = 1 - camEased
      if (t >= 1) {
        selectionPhase = 'idle'
        uFocusTargetInstanceId.value = -1
        uFocusCameraBlend.value = 0
        planet.mesh.visible = false
        planet.material.uniforms.uAlpha.value = 0
        console.log('[Selection] phase=idle | camera restored | dual mesh full')
      }
      return
    }

    // selected — user may truck/pedestal; focused instance stays hidden on dual meshes
    inputLocked = false
    uFocused.value = pendingSelectInstanceIndex
    uFocusTargetInstanceId.value = pendingSelectInstanceIndex
    uFocusCameraBlend.value = 1
    planet.mesh.visible = true
    planet.material.uniforms.uAlpha.value = 1
  }

  const syncSelectionPlanetWorldScale = () => {
    if (selectionPhase !== 'selecting' && selectionPhase !== 'selected') return
    if (!planet.mesh.visible) return
    const idx = pendingSelectInstanceIndex
    if (idx < 0 || idx >= movies.length) return
    const m = movies[idx]!
    const stPick = useGalaxyInteractionStore.getState()
    const maskPick = getSelectionMaskPickSet(stPick.searchMode, stPick.selectionIds)
    const { r } = resolveSelectionWorldRadius(m, uZ.value, uZw.value, galaxy.activeMaterial, maskPick)
    const stepH = planet.material.uniforms.uStepHeight.value as number
    const cuts = planet.material.uniforms.uCutCount.value as number
    planet.lastRadius = r * (1 + cuts * stepH)
    planet.mesh.scale.setScalar(r)
    planet.mesh.updateMatrixWorld(true)
  }

  const beginSelect = (movie: Movie) => {
    planet.mesh.visible = true
    planet.material.uniforms.uAlpha.value = 1
    pendingSelectInstanceIndex = movies.findIndex((m) => m.id === movie.id)
    console.assert(pendingSelectInstanceIndex >= 0, '[Selection] movie must exist in mounted list')
    const stPick = useGalaxyInteractionStore.getState()
    const maskPick = getSelectionMaskPickSet(stPick.searchMode, stPick.selectionIds)
    const { r, rActive } = resolveSelectionWorldRadius(movie, uZ.value, uZw.value, galaxy.activeMaterial, maskPick)
    setFocusCameraPosition(toCam, movie)
    const gu = galaxy.idleMaterial.uniforms
    planet.setFromMovie(movie, meta.genre_palette, r, {
      uLMin: (gu.uLMin as THREE.Uniform<number>).value,
      uLMax: (gu.uLMax as THREE.Uniform<number>).value,
      uHighRatingT: (gu.uHighRatingT as THREE.Uniform<number>).value,
      uHighTierTRangeScale: (gu.uHighTierTRangeScale as THREE.Uniform<number>).value,
      uLightnessRatingExponent: (gu.uLightnessRatingExponent as THREE.Uniform<number>).value,
      uChroma: (gu.uChroma as THREE.Uniform<number>).value,
    })
    uFocused.value = -1
    fromCam.copy(camera.position)
    animStartMs = performance.now()
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
    animStartMs = performance.now()
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

  const uSizeScale = galUniforms.uSizeScale as THREE.Uniform<number>
  const uActiveSizeMul = galUniforms.uActiveSizeMul as THREE.Uniform<number>
  const uBgSizeMul = galUniforms.uBgSizeMul as THREE.Uniform<number>
  const uLMin = galUniforms.uLMin as THREE.Uniform<number>
  const uLMax = galUniforms.uLMax as THREE.Uniform<number>
  const uHighRatingT = galUniforms.uHighRatingT as THREE.Uniform<number>
  const uHighTierTRangeScale = galUniforms.uHighTierTRangeScale as THREE.Uniform<number>
  const uLightnessRatingExponent = galUniforms.uLightnessRatingExponent as THREE.Uniform<number>
  const uDistanceFalloffK = galUniforms.uDistanceFalloffK as THREE.Uniform<number>
  const uDistanceFalloffMode = galUniforms.uDistanceFalloffMode as THREE.Uniform<number>
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
    get distanceFalloffK() {
      return uDistanceFalloffK.value
    },
    set distanceFalloffK(value: number) {
      uDistanceFalloffK.value = value
    },
    get distanceFalloffMode() {
      return uDistanceFalloffMode.value
    },
    set distanceFalloffMode(value: number) {
      const v = Math.round(value)
      uDistanceFalloffMode.value = v === 0 ? 0 : 1
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
        `[Galaxy] OKLCH+P10.1 uLMin=${uLMin.value} uLMax=${uLMax.value} uHighRatingT=${uHighRatingT.value} uHighTierTRangeScale=${uHighTierTRangeScale.value} uLightnessRatingExponent=${uLightnessRatingExponent.value} uChroma=${uChroma.value} | P10.2 uDistanceFalloffK=${uDistanceFalloffK.value} uDistanceFalloffMode=${uDistanceFalloffMode.value} | P11.1 uFocusNonTargetActiveAlpha=${uFocusNonTargetActiveAlpha.value} | P11.2 uFocusDimChroma=${uFocusDimChroma.value} uFocusDimL=${uFocusDimL.value} uFocusDimMode=${uFocusDimMode.value}`,
      )
    },
  }
  window.__galaxyColor = galaxyColorDebug
  galaxyColorDebug.log()

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
    get perlinAmbient() {
      return planet.material.uniforms.uAmbient.value as number
    },
    set perlinAmbient(value: number) {
      planet.material.uniforms.uAmbient.value = THREE.MathUtils.clamp(value, 0, 1)
    },
    get perlinDiffuse() {
      return planet.material.uniforms.uDiffuse.value as number
    },
    set perlinDiffuse(value: number) {
      planet.material.uniforms.uDiffuse.value = THREE.MathUtils.clamp(value, 0, 2)
    },
    get perlinLightDir() {
      return planet.material.uniforms.uLightDir.value as THREE.Vector3
    },
    set perlinLightDir(value: THREE.Vector3) {
      const v = planet.material.uniforms.uLightDir.value as THREE.Vector3
      v.copy(value)
      if (v.lengthSq() > 1e-12) v.normalize()
    },
    log() {
      const u = planet.material.uniforms
      const ld = u.uLightDir.value as THREE.Vector3
      console.log(
        `[Planet] uStepHeight=${(u.uStepHeight.value as number).toFixed(4)} uStepSmoothness=${(u.uStepSmoothness.value as number).toFixed(4)} uBandCount=${u.uBandCount.value} uCutCount=${u.uCutCount.value} | P11.4 uFlatShadingMix=${(u.uFlatShadingMix.value as number).toFixed(2)} uAmbient=${(u.uAmbient.value as number).toFixed(2)} uDiffuse=${(u.uDiffuse.value as number).toFixed(2)} uLightDir=(${ld.x.toFixed(2)},${ld.y.toFixed(2)},${ld.z.toFixed(2)}) uPerlinL=${(u.uPerlinL.value as number).toFixed(4)} uPerlinChroma=${(u.uPerlinChroma.value as number).toFixed(4)}`,
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

  const detachControls = attachGalaxyCameraControls(camera, canvas, {
    zRange: meta.z_range,
    xyRange: meta.xy_range,
    getInputLocked: () => inputLocked,
    getMacroZWheel: macroZWheel,
  })

  const detachInteraction = attachGalaxyActiveMeshInteraction({
    camera,
    domElement: canvas,
    activeMesh: galaxy.active,
    movies,
    activeMaterial: galaxy.activeMaterial,
    selectionPlanet: planet,
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
    applySelectionFrame(performance.now())
    const st = useGalaxyInteractionStore.getState()
    // P12.6 — person/genre: mask overrides timeline vis-window for `inFocus`; mode follows store, not mask write path
    const searchSelectMode = st.searchMode === 'person' || st.searchMode === 'genre' ? 1 : 0
    uSelectionMode.value = searchSelectMode
    if (searchSelectMode !== prevSearchSelectMode) {
      prevSearchSelectMode = searchSelectMode
      console.log('[Scene] uSelectionMode=', searchSelectMode, '| searchMode=', st.searchMode)
    }
    uZ.value = st.zCurrent
    uZw.value = st.zVisWindow
    syncSelectionPlanetWorldScale()
    if (selectionPhase === 'idle') {
      camera.position.z = st.zCurrent - st.zCamDistance
    }
    clampGalaxyCameraXY(camera, meta.xy_range, 0.08)
    const bridgeZ = selectionPhase === 'idle' ? st.zCurrent : camera.position.z + st.zCamDistance
    setGalaxyCameraZ(bridgeZ)
    const expectedPr = Math.min(window.devicePixelRatio, 2)
    if (renderer.getPixelRatio() !== expectedPr) {
      resize()
    }
    if (postFxBloomEnabled) {
      composer.render()
    } else {
      renderer.render(scene, camera)
    }
  }
  tick()

  const dispose = () => {
    cancelAnimationFrame(raf)
    ro?.disconnect()
    window.removeEventListener('resize', resize)
    unsubSelection()
    unsubSelectionMask()
    unsubConstellation()
    unsubConstellationIndex()
    constellation.mesh.removeFromParent()
    constellation.dispose()
    detachControls()
    detachInteraction()
    planet.mesh.removeFromParent()
    planet.dispose()
    galaxy.idle.removeFromParent()
    galaxy.active.removeFromParent()
    galaxy.dispose()
    if (window.__bloom === bloomDebug) {
      delete window.__bloom
    }
    if (window.__galaxyPointScale === pointScaleDebug) {
      delete window.__galaxyPointScale
    }
    if (window.__galaxyColor === galaxyColorDebug) {
      delete window.__galaxyColor
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
    galaxyMaterial: galaxy.idleMaterial,
    galaxyActiveMaterial: galaxy.activeMaterial,
    selectionPlanet: planet,
  }
}
