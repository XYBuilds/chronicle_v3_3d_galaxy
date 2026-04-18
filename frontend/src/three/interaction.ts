import * as THREE from 'three'

import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Meta, Movie } from '@/types/galaxy'

/** Pixels of movement with primary button held before we treat the gesture as camera pan, not a pick click. */
const CLICK_MAX_MOVE_PX = 6

/**
 * World-space ray–point margin for `Raycaster.params.Points.threshold`, tuned for the
 * **focus slab** (layer B) only — assumes ~uniform release years so expected count in
 * `[z, z+zVisWindow]` scales with `zVisWindow / z_span`, then derives typical XY spacing
 * in the plot footprint (Phase 5.1.7 / T6).
 */
function computeFocusSlabPointsThreshold(
  meta: Pick<Meta, 'xy_range' | 'z_range' | 'count'>,
  movieCount: number,
  zVisWindow: number,
): number {
  const xr = meta.xy_range.x
  const yr = meta.xy_range.y
  const zr = meta.z_range
  console.assert(xr.length === 2 && yr.length === 2 && zr.length === 2, '[Interaction] meta ranges must be [min,max]')
  console.assert(
    meta.count === movieCount,
    `[Interaction] meta.count (${meta.count}) should equal movies.length (${movieCount})`,
  )
  const zSpan = Math.abs(zr[1] - zr[0])
  const zWin = Math.max(zVisWindow, 1e-9)
  const nSlab = Math.max(1, (movieCount * zWin) / Math.max(zSpan, 1e-9))
  const xyW = Math.max(1e-12, xr[1] - xr[0])
  const xyH = Math.max(1e-12, yr[1] - yr[0])
  const xyArea = xyW * xyH
  const avgXYSpacing = Math.sqrt(xyArea / nSlab)
  const xyMin = Math.min(xyW, xyH)
  return THREE.MathUtils.clamp(avgXYSpacing * 0.75, xyMin * 1e-4, xyMin * 0.08)
}

function movieInZFocusSlab(z: number, zCurrent: number, zVisWindow: number): boolean {
  const zHi = zCurrent + zVisWindow
  return z >= zCurrent && z <= zHi
}

function ndcFromClient(domElement: HTMLElement, clientX: number, clientY: number): THREE.Vector2 {
  const rect = domElement.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  const x = ((clientX - rect.left) / w) * 2 - 1
  const y = -((clientY - rect.top) / h) * 2 + 1
  return new THREE.Vector2(x, y)
}

const _worldProject = new THREE.Vector3()

/** Project movie world (x,y,z) to viewport CSS pixels relative to the canvas element. */
function movieToScreenCss(
  movie: Pick<Movie, 'x' | 'y' | 'z'>,
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
): { x: number; y: number } {
  _worldProject.set(movie.x, movie.y, movie.z)
  _worldProject.project(camera)
  const rect = domElement.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  const x = (_worldProject.x * 0.5 + 0.5) * w + rect.left
  const y = (-_worldProject.y * 0.5 + 0.5) * h + rect.top
  return { x, y }
}

type HoverEmitSnap = { id: number | null; ax: number; ay: number }

function hoverEmitEqual(a: HoverEmitSnap, id: number | null, anchor: { x: number; y: number } | null): boolean {
  const ax = anchor?.x ?? Number.NaN
  const ay = anchor?.y ?? Number.NaN
  return a.id === id && Math.abs(a.ax - ax) < 0.25 && Math.abs(a.ay - ay) < 0.25
}

/**
 * Raycaster against `THREE.Points`: updates `hoveredMovieId` / `selectedMovieId` in Zustand.
 * Click-select ignores gestures that were camera pans (primary drag beyond {@link CLICK_MAX_MOVE_PX}).
 *
 * Phase 5.1.7 — Only layer B (`z ∈ [zCurrent, zCurrent+zVisWindow]`, same slab as `point.vert.glsl`)
 * can be hovered or selected; hits outside the slab are skipped. Pick threshold follows slab density.
 */
export function attachGalaxyPointsInteraction(options: {
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  points: THREE.Points
  movies: Movie[]
  meta: Pick<Meta, 'xy_range' | 'z_range' | 'count'>
}): () => void {
  const { camera, domElement, points, movies, meta } = options
  const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  console.assert(!!posAttr, '[Interaction] points.geometry must have position attribute')
  console.assert(
    posAttr!.count === movies.length,
    `[Interaction] position count ${posAttr?.count} must equal movies.length ${movies.length}`,
  )
  console.log(`[Interaction] attach | movies=${movies.length}`)

  const raycaster = new THREE.Raycaster()
  let cachedThresholdZVis = Number.NaN
  const syncPickThreshold = () => {
    const { zVisWindow } = useGalaxyInteractionStore.getState()
    if (zVisWindow === cachedThresholdZVis) return
    cachedThresholdZVis = zVisWindow
    const zSpan = Math.abs(meta.z_range[1] - meta.z_range[0])
    const nSlabApprox = Math.max(1, (movies.length * Math.max(zVisWindow, 1e-9)) / Math.max(zSpan, 1e-9))
    const t = computeFocusSlabPointsThreshold(meta, movies.length, zVisWindow)
    raycaster.params.Points = { threshold: t }
    console.log(
      `[Interaction] Focus-slab pick threshold (world): ${t.toFixed(6)} | zVisWindow=${zVisWindow} nSlab≈${nSlabApprox.toFixed(1)}`,
    )
  }
  syncPickThreshold()

  const ndc = new THREE.Vector2()
  let lastHoverLogId: number | null | undefined
  let lastEmitted: HoverEmitSnap = { id: null, ax: Number.NaN, ay: Number.NaN }

  let pressX = 0
  let pressY = 0
  let dragExceededDuringPress = false
  let primaryPressActive = false

  const pickIndex = (clientX: number, clientY: number): number | null => {
    syncPickThreshold()
    ndc.copy(ndcFromClient(domElement, clientX, clientY))
    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObject(points, false)
    if (hits.length === 0) return null
    const { zCurrent, zVisWindow } = useGalaxyInteractionStore.getState()
    for (let i = 0; i < hits.length; i++) {
      const idx = hits[i].index
      if (idx === undefined || idx < 0 || idx >= movies.length) continue
      if (!movieInZFocusSlab(movies[idx].z, zCurrent, zVisWindow)) continue
      return idx
    }
    return null
  }

  const emitHover = (id: number | null, anchor: { x: number; y: number } | null) => {
    if (hoverEmitEqual(lastEmitted, id, anchor)) return
    lastEmitted = {
      id,
      ax: anchor?.x ?? Number.NaN,
      ay: anchor?.y ?? Number.NaN,
    }
    useGalaxyInteractionStore.setState({ hoveredMovieId: id, hoverAnchorCss: anchor })
  }

  const setHoverFromClient = (clientX: number, clientY: number) => {
    const idx = pickIndex(clientX, clientY)
    const id = idx === null ? null : movies[idx].id
    const anchor = idx === null ? null : movieToScreenCss(movies[idx], camera, domElement)
    emitHover(id, anchor)
    if (id !== lastHoverLogId) {
      lastHoverLogId = id
      if (id === null) {
        console.log('[Hover] null')
      } else {
        const m = movies[idx!]
        console.log(`[Hover] id=${id} title=${JSON.stringify(m.title)}`)
      }
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if ((e.buttons & 1) === 1) {
      const d = Math.hypot(e.clientX - pressX, e.clientY - pressY)
      if (d > CLICK_MAX_MOVE_PX) dragExceededDuringPress = true
    }
    setHoverFromClient(e.clientX, e.clientY)
  }

  const endPrimaryPressTracking = () => {
    if (!primaryPressActive) return
    primaryPressActive = false
    window.removeEventListener('pointerup', onWindowPointerUp, true)
    window.removeEventListener('pointercancel', onWindowPointerCancel, true)
  }

  const onWindowPointerCancel = () => {
    endPrimaryPressTracking()
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    pressX = e.clientX
    pressY = e.clientY
    dragExceededDuringPress = false
    primaryPressActive = true
    window.addEventListener('pointerup', onWindowPointerUp, true)
    window.addEventListener('pointercancel', onWindowPointerCancel, true)
  }

  const onWindowPointerUp = (e: PointerEvent) => {
    if (!primaryPressActive || e.button !== 0) return
    window.removeEventListener('pointerup', onWindowPointerUp, true)
    window.removeEventListener('pointercancel', onWindowPointerCancel, true)
    primaryPressActive = false
    if (dragExceededDuringPress) return
    const idx = pickIndex(e.clientX, e.clientY)
    const id = idx === null ? null : movies[idx].id
    useGalaxyInteractionStore.setState({ selectedMovieId: id })
    if (id === null) {
      console.log('[Select] null')
    } else {
      const m = movies[idx!]
      console.log(`[Select] id=${id} title=${JSON.stringify(m.title)}`)
    }
  }

  const onPointerLeave = () => {
    lastHoverLogId = undefined
    lastEmitted = { id: null, ax: Number.NaN, ay: Number.NaN }
    useGalaxyInteractionStore.setState({ hoveredMovieId: null, hoverAnchorCss: null })
    console.log('[Hover] null')
  }

  domElement.addEventListener('pointermove', onPointerMove)
  domElement.addEventListener('pointerdown', onPointerDown)
  domElement.addEventListener('pointerleave', onPointerLeave)

  return () => {
    window.removeEventListener('pointerup', onWindowPointerUp, true)
    window.removeEventListener('pointercancel', onWindowPointerCancel, true)
    primaryPressActive = false
    domElement.removeEventListener('pointermove', onPointerMove)
    domElement.removeEventListener('pointerdown', onPointerDown)
    domElement.removeEventListener('pointerleave', onPointerLeave)
    lastHoverLogId = undefined
    lastEmitted = { id: null, ax: Number.NaN, ay: Number.NaN }
    useGalaxyInteractionStore.setState({
      hoveredMovieId: null,
      selectedMovieId: null,
      hoverAnchorCss: null,
    })
    console.log('[Interaction] detached, cleared hover/select')
  }
}
