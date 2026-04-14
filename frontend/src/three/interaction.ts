import * as THREE from 'three'

import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Meta, Movie } from '@/types/galaxy'

/** Pixels of movement with primary button held before we treat the gesture as camera pan, not a pick click. */
const CLICK_MAX_MOVE_PX = 6

function computePointsThreshold(
  meta: Pick<Meta, 'xy_range' | 'z_range' | 'count'>,
  movieCount: number,
): number {
  const xr = meta.xy_range.x
  const yr = meta.xy_range.y
  const zr = meta.z_range
  console.assert(xr.length === 2 && yr.length === 2 && zr.length === 2, '[Interaction] meta ranges must be [min,max]')
  console.assert(
    meta.count === movieCount,
    `[Interaction] meta.count (${meta.count}) should equal movies.length (${movieCount})`,
  )
  const span = Math.max(xr[1] - xr[0], yr[1] - yr[0], zr[1] - zr[0])
  const n = Math.max(1, movieCount)
  const avgSpacing = span / Math.sqrt(n)
  const t = THREE.MathUtils.clamp(avgSpacing * 0.75, span * 1e-4, span * 0.08)
  console.log(
    `[Interaction] Points pick threshold (world): ${t.toFixed(6)} | span=${span.toFixed(4)} avgSpacing≈${avgSpacing.toFixed(6)}`,
  )
  return t
}

function ndcFromClient(domElement: HTMLElement, clientX: number, clientY: number): THREE.Vector2 {
  const rect = domElement.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  const x = ((clientX - rect.left) / w) * 2 - 1
  const y = -((clientY - rect.top) / h) * 2 + 1
  return new THREE.Vector2(x, y)
}

/**
 * Raycaster against `THREE.Points`: updates `hoveredMovieId` / `selectedMovieId` in Zustand.
 * Click-select ignores gestures that were camera pans (primary drag beyond {@link CLICK_MAX_MOVE_PX}).
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
  raycaster.params.Points = { threshold: computePointsThreshold(meta, movies.length) }

  const ndc = new THREE.Vector2()
  let lastHoverId: number | null | undefined

  let pressX = 0
  let pressY = 0
  let dragExceededDuringPress = false
  let primaryPressActive = false

  const pickIndex = (clientX: number, clientY: number): number | null => {
    ndc.copy(ndcFromClient(domElement, clientX, clientY))
    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObject(points, false)
    if (hits.length === 0) return null
    const idx = hits[0].index
    if (idx === undefined || idx < 0 || idx >= movies.length) return null
    return idx
  }

  const setHoverFromClient = (clientX: number, clientY: number) => {
    const idx = pickIndex(clientX, clientY)
    const id = idx === null ? null : movies[idx].id
    if (id === lastHoverId) return
    lastHoverId = id
    useGalaxyInteractionStore.setState({ hoveredMovieId: id })
    if (id === null) {
      console.log('[Hover] null')
    } else {
      const m = movies[idx!]
      console.log(`[Hover] id=${id} title=${JSON.stringify(m.title)}`)
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
    lastHoverId = undefined
    useGalaxyInteractionStore.setState({ hoveredMovieId: null })
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
    lastHoverId = undefined
    useGalaxyInteractionStore.setState({ hoveredMovieId: null, selectedMovieId: null })
    console.log('[Interaction] detached, cleared hover/select')
  }
}
