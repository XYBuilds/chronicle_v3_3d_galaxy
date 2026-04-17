import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import { setGalaxyCameraZ } from '@/lib/galaxyCameraZBridge'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Meta, Movie, XyRange } from '@/types/galaxy'

import { attachGalaxyCameraControls, GALAXY_CAMERA_EULER } from './camera'
import { createGalaxyPoints } from './galaxy'
import { attachGalaxyPointsInteraction } from './interaction'
import { createSelectionPlanet } from './planet'

interface BloomDebugControls {
  strength: number
  radius: number
  threshold: number
  log: () => void
}

interface GalaxyPointScaleDebug {
  /** Multiplier on screen point diameter (JSON `size` × perspective × this). */
  scale: number
  log: () => void
}

declare global {
  interface Window {
    __bloom?: BloomDebugControls
    __galaxyPointScale?: GalaxyPointScaleDebug
  }
}

export interface GalaxySceneMount {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  dispose: () => void
}

function xyRangeMidpoint(xyRange: XyRange): { cx: number; cy: number } {
  const { x, y } = xyRange
  if (x.length !== 2 || y.length !== 2) {
    throw new Error('[Scene] meta.xy_range.x / .y must be length-2 [min, max]')
  }
  return { cx: (x[0] + x[1]) / 2, cy: (y[0] + y[1]) / 2 }
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/** Phase 5.1.4.4 (H-B / 方案 3): density-aware XY so the camera targets the point-mass center, not the AABB midpoint. */
function xyCenterFromMovies(movies: Movie[]): { cx: number; cy: number } {
  const medianX = median(movies.map((m) => m.x))
  const medianY = median(movies.map((m) => m.y))
  return { cx: medianX, cy: medianY }
}

/**
 * Black fullscreen scene: WebGL2 renderer, perspective camera at XY center and
 * Z = z_range[0] - 2, facing +Z (axis-parallel, no rotation in controls).
 */
const SELECT_MS = 700
const DESELECT_MS = 450

function easeOutCubic(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1)
  return 1 - Math.pow(1 - x, 3)
}

function worldSpan(meta: Pick<Meta, 'xy_range' | 'z_range'>): number {
  const xr = meta.xy_range.x
  const yr = meta.xy_range.y
  const zr = meta.z_range
  return Math.max(xr[1] - xr[0], yr[1] - yr[0], zr[1] - zr[0])
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
  const [zMin] = zRange
  const { cx, cy } =
    movies.length > 0 ? xyCenterFromMovies(movies) : xyRangeMidpoint(meta.xy_range)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1e6)
  camera.position.set(cx, cy, zMin - 2)
  camera.rotation.copy(GALAXY_CAMERA_EULER)
  camera.updateMatrixWorld(true)
  setGalaxyCameraZ(camera.position.z)

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const gl = renderer.getContext()
  const webglLabel = gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1'

  const pr = Math.min(window.devicePixelRatio, 2)
  const galaxy = createGalaxyPoints(movies, pr)
  scene.add(galaxy.points)

  const planet = createSelectionPlanet()
  scene.add(planet.mesh)

  type SelectionPhase = 'idle' | 'selecting' | 'selected' | 'deselecting'
  let selectionPhase: SelectionPhase = 'idle'
  let animStartMs = 0
  const restCam = new THREE.Vector3()
  const fromCam = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  let inputLocked = false

  const uPointsOpacity = galaxy.material.uniforms.uPointsOpacity as THREE.Uniform<number>
  console.assert(uPointsOpacity.value === 1, '[Scene] initial uPointsOpacity must be 1')

  const applySelectionFrame = (nowMs: number) => {
    planet.material.uniforms.uTime.value = nowMs * 0.001

    if (selectionPhase === 'idle') {
      uPointsOpacity.value = 1
      planet.setOpacity(0)
      inputLocked = false
      return
    }

    if (selectionPhase === 'selecting') {
      inputLocked = true
      const t = Math.min(1, (nowMs - animStartMs) / SELECT_MS)
      const e = easeOutCubic(t)
      camera.position.lerpVectors(fromCam, toCam, e)
      camera.rotation.copy(GALAXY_CAMERA_EULER)
      uPointsOpacity.value = 1 - easeOutCubic(Math.min(1, t / 0.58))
      planet.setOpacity(easeOutCubic(THREE.MathUtils.clamp((t - 0.12) / 0.88, 0, 1)))
      if (t >= 1) {
        selectionPhase = 'selected'
        uPointsOpacity.value = 0
        planet.setOpacity(1)
        camera.position.copy(toCam)
        console.log('[Selection] phase=selected | points hidden | planet visible')
      }
      return
    }

    if (selectionPhase === 'deselecting') {
      inputLocked = true
      const t = Math.min(1, (nowMs - animStartMs) / DESELECT_MS)
      const e = easeOutCubic(t)
      camera.position.lerpVectors(fromCam, toCam, e)
      camera.rotation.copy(GALAXY_CAMERA_EULER)
      planet.setOpacity(1 - e)
      uPointsOpacity.value = easeOutCubic(THREE.MathUtils.clamp((t - 0.28) / 0.72, 0, 1))
      if (t >= 1) {
        selectionPhase = 'idle'
        uPointsOpacity.value = 1
        planet.setOpacity(0)
        console.log('[Selection] phase=idle | camera restored | points visible')
      }
      return
    }

    // selected — user may truck/pedestal; only keep points dimmed + planet lit
    inputLocked = false
    uPointsOpacity.value = 0
    planet.setOpacity(1)
  }

  const beginSelect = (movie: Movie) => {
    const span = worldSpan(meta)
    const r = THREE.MathUtils.clamp(span * 0.014, 0.07, span * 0.05)
    const standoff = Math.max(r * 4.2, span * 0.018)
    toCam.set(movie.x, movie.y, movie.z - standoff)
    planet.setFromMovie(movie, meta.genre_palette, r)
    fromCam.copy(camera.position)
    animStartMs = performance.now()
    selectionPhase = 'selecting'
    console.log(
      `[Selection] phase=selecting | duration=${SELECT_MS}ms | standoff=${standoff.toFixed(4)} | planetR=${r.toFixed(4)}`,
    )
  }

  const beginDeselect = () => {
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
  const renderPass = new RenderPass(scene, camera)
  // strength 0: disable bloom for readability / solid-entity inspection (restore e.g. 1.0 when tuning glow).
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.0, 0.5, 0.85)
  composer.addPass(renderPass)
  composer.addPass(bloomPass)

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
        `[PostFX] Bloom enabled | threshold=${bloomPass.threshold.toFixed(2)} strength=${bloomPass.strength.toFixed(
          2,
        )} radius=${bloomPass.radius.toFixed(2)}`,
      )
    },
  }
  window.__bloom = bloomDebug
  bloomDebug.log()

  const uSizeScale = galaxy.material.uniforms.uSizeScale as THREE.Uniform<number>
  const pointScaleDebug: GalaxyPointScaleDebug = {
    get scale() {
      return uSizeScale.value
    },
    set scale(value: number) {
      uSizeScale.value = value
    },
    log() {
      console.log(`[Galaxy] point size scale=${uSizeScale.value} (uniform uSizeScale)`)
    },
  }
  window.__galaxyPointScale = pointScaleDebug
  pointScaleDebug.log()

  const resize = () => {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    composer.setSize(w, h)
    bloomPass.setSize(w, h)
    galaxy.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2)
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
  })

  const detachInteraction = attachGalaxyPointsInteraction({
    camera,
    domElement: canvas,
    points: galaxy.points,
    movies,
    meta,
  })

  const w = renderer.domElement.width
  const h = renderer.domElement.height
  console.log(
    `[Scene] Renderer: ${webglLabel} | Canvas: ${w}x${h} | Camera initial Z: ${camera.position.z.toFixed(4)}`,
  )

  let raf = 0
  const tick = () => {
    raf = requestAnimationFrame(tick)
    applySelectionFrame(performance.now())
    setGalaxyCameraZ(camera.position.z)
    composer.render()
  }
  tick()

  const dispose = () => {
    cancelAnimationFrame(raf)
    ro?.disconnect()
    window.removeEventListener('resize', resize)
    unsubSelection()
    detachControls()
    detachInteraction()
    planet.mesh.removeFromParent()
    planet.dispose()
    galaxy.points.removeFromParent()
    galaxy.dispose()
    if (window.__bloom === bloomDebug) {
      delete window.__bloom
    }
    if (window.__galaxyPointScale === pointScaleDebug) {
      delete window.__galaxyPointScale
    }
    composer.dispose()
    renderer.dispose()
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement)
    }
  }

  return { renderer, scene, camera, dispose }
}
