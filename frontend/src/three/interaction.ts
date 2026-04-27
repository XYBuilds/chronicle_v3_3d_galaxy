import * as THREE from 'three'

import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'

import { computeActiveMeshScreenRadiusCss, movieZInFocusFactor } from './screenRadius'

/**
 * Legacy Points path (P6.3.1) — kept for benchmarks / docs; production uses {@link attachGalaxyActiveMeshInteraction}.
 */
export function computePointScreenRadiusCss(
  pointSizeAttr: number,
  distCam: number,
  material: THREE.ShaderMaterial,
  inFocus: boolean,
): number {
  const u = material.uniforms
  const uSizeScale = (u.uSizeScale as THREE.Uniform<number>).value
  const uFocusSizeMul = (u.uFocusSizeMul as THREE.Uniform<number>).value
  const uBgSizeMul = (u.uBgSizeMul as THREE.Uniform<number>).value
  const sizeMul = inFocus ? uFocusSizeMul : uBgSizeMul
  const d = Math.max(0.001, distCam)
  return (pointSizeAttr * (500.0 / d) * uSizeScale * sizeMul) * 0.5
}

/** Pixels of movement with primary button held before we treat the gesture as camera pan, not a pick click. */
const CLICK_MAX_MOVE_PX = 6

const _worldProject = new THREE.Vector3()
const _raycaster = new THREE.Raycaster()
const _ndc = new THREE.Vector2()

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

type HoverEmitSnap = { id: number | null; ax: number; ay: number; ringR: number; tipX: number }

function hoverEmitEqual(
  a: HoverEmitSnap,
  id: number | null,
  anchor: { x: number; y: number } | null,
  ringOuter: number | null,
  tipX: number | null,
): boolean {
  const ax = anchor?.x ?? Number.NaN
  const ay = anchor?.y ?? Number.NaN
  const ro = ringOuter ?? Number.NaN
  const tx = tipX ?? Number.NaN
  return (
    a.id === id &&
    Math.abs(a.ax - ax) < 0.25 &&
    Math.abs(a.ay - ay) < 0.25 &&
    Math.abs(a.ringR - ro) < 0.25 &&
    Math.abs(a.tipX - tx) < 0.25
  )
}

const IN_FOCUS_PICK_THRESHOLD = 0.5

/**
 * P8.4 — Raycaster on **active** `InstancedMesh` only; accept hits with `movieZInFocusFactor > 0.5`.
 * Updates hover ring radius + tooltip horizontal offset (store).
 */
export function attachGalaxyActiveMeshInteraction(options: {
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  activeMesh: THREE.InstancedMesh
  movies: Movie[]
  activeMaterial: THREE.ShaderMaterial
}): () => void {
  const { camera, domElement, activeMesh, movies, activeMaterial } = options
  const sizeAttr = activeMesh.geometry.getAttribute('aSize') as THREE.InstancedBufferAttribute | undefined
  console.assert(!!sizeAttr, '[Interaction] active mesh must have aSize InstancedBufferAttribute')
  console.assert(
    activeMesh.count === movies.length,
    `[Interaction] activeMesh.count ${activeMesh.count} must equal movies.length ${movies.length}`,
  )

  let lastEmitted: HoverEmitSnap = { id: null, ax: Number.NaN, ay: Number.NaN, ringR: Number.NaN, tipX: Number.NaN }

  let pressX = 0
  let pressY = 0
  let dragExceededDuringPress = false
  let primaryPressActive = false

  const ndcFromClient = (clientX: number, clientY: number, out: THREE.Vector2) => {
    const rect = domElement.getBoundingClientRect()
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1
    const y = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1)
    out.set(x, y)
  }

  const pickIndex = (clientX: number, clientY: number): number | null => {
    const st = useGalaxyInteractionStore.getState()
    ndcFromClient(clientX, clientY, _ndc)
    _raycaster.setFromCamera(_ndc, camera)
    const hits = _raycaster.intersectObject(activeMesh, false)
    for (const hit of hits) {
      const i = hit.instanceId
      if (i === undefined || i < 0 || i >= movies.length) continue
      const m = movies[i]
      const inf = movieZInFocusFactor(m.z, st.zCurrent, st.zVisWindow)
      if (inf <= IN_FOCUS_PICK_THRESHOLD) continue
      return i
    }
    return null
  }

  const emitHover = (
    id: number | null,
    anchor: { x: number; y: number } | null,
    ringOuter: number | null,
    tipOffsetX: number | null,
  ) => {
    const ro = ringOuter ?? Number.NaN
    const tx = tipOffsetX ?? Number.NaN
    if (hoverEmitEqual(lastEmitted, id, anchor, ringOuter, tipOffsetX)) return
    lastEmitted = {
      id,
      ax: anchor?.x ?? Number.NaN,
      ay: anchor?.y ?? Number.NaN,
      ringR: ro,
      tipX: tx,
    }
    useGalaxyInteractionStore.setState({
      hoveredMovieId: id,
      hoverAnchorCss: anchor,
      hoverRingRadiusCss: ringOuter,
      hoverTooltipOffsetXPx: tipOffsetX,
    })
  }

  const setHoverFromClient = (clientX: number, clientY: number) => {
    const idx = pickIndex(clientX, clientY)
    const st = useGalaxyInteractionStore.getState()
    if (idx === null) {
      emitHover(null, null, null, null)
      return
    }
    const m = movies[idx]
    const anchor = movieToScreenCss(m, camera, domElement)
    const rCss = computeActiveMeshScreenRadiusCss({
      movie: m,
      camera,
      domElement,
      activeMaterial,
      zCurrent: st.zCurrent,
      zVisWindow: st.zVisWindow,
    })
    const ringOuter = rCss > 0 ? rCss + 4 : null
    const tipOffsetX = rCss > 0 ? rCss + 12 : null
    emitHover(m.id, anchor, ringOuter, tipOffsetX)
  }

  const onPointerMove = (e: PointerEvent) => {
    if ((e.buttons & 1) === 1) {
      const d = Math.hypot(e.clientX - pressX, e.clientY - pressY)
      if (d > CLICK_MAX_MOVE_PX) dragExceededDuringPress = true
    }
    setHoverFromClient(e.clientX, e.clientY)
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
  }

  const onWindowPointerCancel = () => {
    if (!primaryPressActive) return
    window.removeEventListener('pointerup', onWindowPointerUp, true)
    window.removeEventListener('pointercancel', onWindowPointerCancel, true)
    primaryPressActive = false
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

  const onPointerLeave = () => {
    lastEmitted = { id: null, ax: Number.NaN, ay: Number.NaN, ringR: Number.NaN, tipX: Number.NaN }
    useGalaxyInteractionStore.setState({
      hoveredMovieId: null,
      hoverAnchorCss: null,
      hoverRingRadiusCss: null,
      hoverTooltipOffsetXPx: null,
    })
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
    lastEmitted = { id: null, ax: Number.NaN, ay: Number.NaN, ringR: Number.NaN, tipX: Number.NaN }
    useGalaxyInteractionStore.setState({
      hoveredMovieId: null,
      selectedMovieId: null,
      hoverAnchorCss: null,
      hoverRingRadiusCss: null,
      hoverTooltipOffsetXPx: null,
    })
  }
}
