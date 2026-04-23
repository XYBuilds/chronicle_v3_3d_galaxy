import * as THREE from 'three'

import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'

/**
 * P6.3.1 — 屏幕空间圆盘拾取（CPU）必须与 `point.vert.glsl` 中 `gl_PointSize` 的公式**逐行同构**。
 * 若只改 GLSL 侧点大小/视距/尺寸系数，必须同步改 `computePointScreenRadiusCss`（及本文件中的命中判定）。
 *
 * 顶点里：`gl_PointSize = size * uPixelRatio * (500.0 / dist) * uSizeScale * mix(uBgSizeMul, uFocusSizeMul, inFocus);`
 * CSS 半径（与 uPixelRatio 相消）：`radiusCssPx = size * (500 / distCam) * uSizeScale * mix(...) / 2`
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

function movieInZFocusSlab(z: number, zCurrent: number, zVisWindow: number): boolean {
  const zHi = zCurrent + zVisWindow
  return z >= zCurrent && z <= zHi
}

const _worldProject = new THREE.Vector3()
const _modelView = new THREE.Vector3()

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
 * 屏幕空间圆盘拾取（P6.3.1），更新 `hoveredMovieId` / `selectedMovieId`。
 * Click 忽略被判定为相机动拖移的手势（超过 {@link CLICK_MAX_MOVE_PX} 的主键位移）。
 *
 * Phase 5.1.7 — 仅 `z ∈ [zCurrent, zCurrent+zVisWindow]` 的层可 hover/click；同一屏幕位置多颗星重叠时选 **front-most**（`distCam` 最小，与深度缓冲一致）。背景层点不参与拾取。
 */
export function attachGalaxyPointsInteraction(options: {
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  points: THREE.Points
  movies: Movie[]
  material: THREE.ShaderMaterial
}): () => void {
  const { camera, domElement, points, movies, material } = options
  const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  const sizeAttr = points.geometry.getAttribute('size') as THREE.BufferAttribute | undefined
  console.assert(!!posAttr, '[Interaction] points.geometry must have position attribute')
  console.assert(!!sizeAttr, '[Interaction] points.geometry must have size attribute')
  console.assert(
    posAttr!.count === movies.length,
    `[Interaction] position count ${posAttr?.count} must equal movies.length ${movies.length}`,
  )
  console.assert(
    sizeAttr!.count === movies.length,
    `[Interaction] size count ${sizeAttr?.count} must equal movies.length ${movies.length}`,
  )

  let lastEmitted: HoverEmitSnap = { id: null, ax: Number.NaN, ay: Number.NaN }

  let pressX = 0
  let pressY = 0
  let dragExceededDuringPress = false
  let primaryPressActive = false

  const pickIndex = (clientX: number, clientY: number): number | null => {
    const { zCurrent, zVisWindow } = useGalaxyInteractionStore.getState()
    let bestIdx: number | null = null
    let bestDistCam = Number.POSITIVE_INFINITY
    for (let i = 0; i < movies.length; i++) {
      const m = movies[i]
      if (!movieInZFocusSlab(m.z, zCurrent, zVisWindow)) continue
      _modelView.set(m.x, m.y, m.z)
      _modelView.applyMatrix4(points.matrixWorld)
      _modelView.applyMatrix4(camera.matrixWorldInverse)
      if (_modelView.z >= 0) continue
      const distCam = Math.max(0.001, -_modelView.z)
      const pSize = sizeAttr!.getX(i)
      const rCss = computePointScreenRadiusCss(pSize, distCam, material, true)
      const { x: sx, y: sy } = movieToScreenCss(m, camera, domElement)
      const dx = clientX - sx
      const dy = clientY - sy
      if (dx * dx + dy * dy > rCss * rCss) continue
      if (distCam < bestDistCam) {
        bestDistCam = distCam
        bestIdx = i
      }
    }
    return bestIdx
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
  }

  const onPointerLeave = () => {
    lastEmitted = { id: null, ax: Number.NaN, ay: Number.NaN }
    useGalaxyInteractionStore.setState({ hoveredMovieId: null, hoverAnchorCss: null })
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
    lastEmitted = { id: null, ax: Number.NaN, ay: Number.NaN }
    useGalaxyInteractionStore.setState({
      hoveredMovieId: null,
      selectedMovieId: null,
      hoverAnchorCss: null,
    })
  }
}
