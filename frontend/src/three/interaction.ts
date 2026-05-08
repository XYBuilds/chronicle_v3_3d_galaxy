import * as THREE from 'three'

import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import type { Movie } from '@/types/galaxy'

import type { SelectionPlanetHandle } from './planet'
import {
  computeActiveMeshScreenRadiusCss,
  computeWorldSphereScreenRadiusCss,
  getSelectionMaskPickSet,
  pickClosestActiveMovieAlongRay,
  rayPositiveSphereFirstT,
} from './screenRadius'

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
  const uActiveSizeMul = (u.uActiveSizeMul as THREE.Uniform<number>).value
  const uBgSizeMul = (u.uBgSizeMul as THREE.Uniform<number>).value
  const sizeMul = inFocus ? uActiveSizeMul : uBgSizeMul
  const d = Math.max(0.001, distCam)
  return (pointSizeAttr * (500.0 / d) * uSizeScale * sizeMul) * 0.5
}

/** Pixels of movement with primary button held before we treat the gesture as camera pan, not a pick click. */
const CLICK_MAX_MOVE_PX = 6

const _worldProject = new THREE.Vector3()
const _raycaster = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _pickCameraWorldPos = new THREE.Vector3()

/** Project world position to viewport CSS pixels (client coordinates). */
function worldToScreenCss(
  world: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
): { x: number; y: number } {
  _worldProject.copy(world)
  _worldProject.project(camera)
  const rect = domElement.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  const x = (_worldProject.x * 0.5 + 0.5) * w + rect.left
  const y = (-_worldProject.y * 0.5 + 0.5) * h + rect.top
  return { x, y }
}

type HoverEmitSnap = { id: number | null; ax: number; ay: number; planetR: number }

function hoverEmitEqual(
  a: HoverEmitSnap,
  id: number | null,
  anchor: { x: number; y: number } | null,
  planetRadiusCss: number | null,
): boolean {
  const ax = anchor?.x ?? Number.NaN
  const ay = anchor?.y ?? Number.NaN
  const pr = planetRadiusCss ?? Number.NaN
  return (
    a.id === id &&
    Math.abs(a.ax - ax) < 0.25 &&
    Math.abs(a.ay - ay) < 0.25 &&
    Math.abs(a.planetR - pr) < 0.25
  )
}

/**
 * P8.4 — Hover / click use **ray–world-sphere** picks matching active shader `sActive` (InstancedMesh
 * `Raycaster` ignores vertex scale). Hover: cursor on visible active sphere. Click: same + `inFocus > 0.5` slab gate.
 */
export function attachGalaxyActiveMeshInteraction(options: {
  camera: THREE.PerspectiveCamera
  domElement: HTMLElement
  activeMesh: THREE.InstancedMesh
  movies: Movie[]
  activeMaterial: THREE.ShaderMaterial
  /** P11.6 — focus 态优先用 `lastRadius` 包围球 vs active 射线球取最近命中；GPU 位移顶点不可靠故不用 mesh raycast。 */
  selectionPlanet?: SelectionPlanetHandle
}): () => void {
  const { camera, domElement, activeMesh, movies, activeMaterial, selectionPlanet } = options
  const maskPickFromState = () => {
    const s = useGalaxyInteractionStore.getState()
    return getSelectionMaskPickSet(s.selectedMovieId, s.focusNeighborIds, s.searchMode, s.selectionIds)
  }
  const unsubMaskPick = useGalaxyInteractionStore.subscribe((state, prev) => {
    if (
      state.searchMode === prev.searchMode &&
      state.selectionIds === prev.selectionIds &&
      state.selectedMovieId === prev.selectedMovieId &&
      state.focusNeighborIds === prev.focusNeighborIds &&
      state.focusNeighborRadius === prev.focusNeighborRadius
    ) {
      return
    }
    const maskSize =
      state.selectedMovieId !== null ? (state.focusNeighborIds?.length ?? 0) : (state.selectionIds?.length ?? 0)
    console.log('[Interaction] selectionMaskPickSet refreshed | mode=', state.selectedMovieId !== null ? 2 : state.searchMode, '| size=', maskSize)
  })
  const sizeAttr = activeMesh.geometry.getAttribute('aSize') as THREE.InstancedBufferAttribute | undefined
  console.assert(!!sizeAttr, '[Interaction] active mesh must have aSize InstancedBufferAttribute')
  console.assert(
    activeMesh.count === movies.length,
    `[Interaction] activeMesh.count ${activeMesh.count} must equal movies.length ${movies.length}`,
  )

  let lastEmitted: HoverEmitSnap = { id: null, ax: Number.NaN, ay: Number.NaN, planetR: Number.NaN }

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

  const rayFromClient = (clientX: number, clientY: number) => {
    ndcFromClient(clientX, clientY, _ndc)
    _raycaster.setFromCamera(_ndc, camera)
    return _raycaster.ray
  }

  const pickCameraWorldZ = () => {
    camera.updateMatrixWorld()
    return camera.getWorldPosition(_pickCameraWorldPos).z
  }

  /**
   * P11.6 — `selectedMovieId != null` 且 Perlin 包围球沿射线近于 active 命中时，视为焦点星交互（tooltip / 点击保持 focus）。
   */
  const focusPlanetBeatsActiveAlongRay = (
    clientX: number,
    clientY: number,
    requireSlabInteraction: boolean,
  ): boolean => {
    if (!selectionPlanet?.mesh.visible) return false
    const st = useGalaxyInteractionStore.getState()
    const selId = st.selectedMovieId
    if (selId === null) return false
    const mf = movies.find((m) => m.id === selId)
    if (!mf) return false
    const ray = rayFromClient(clientX, clientY)
    const R = selectionPlanet.lastRadius
    const tFocus = rayPositiveSphereFirstT(ray, mf.x, mf.y, mf.z, R)
    if (tFocus === null) return false
    const selectionMaskPickSet = maskPickFromState()
    const pickedActive = pickClosestActiveMovieAlongRay({
      ray,
      movies,
      activeMaterial,
      zCurrent: st.zCurrent,
      zVisWindow: st.zVisWindow,
      requireSlabInteraction,
      selectionMaskPickSet,
      cameraWorldZ: pickCameraWorldZ(),
      nearCullExemptMovieId: st.selectedMovieId,
    })
    if (pickedActive === null) return true
    return tFocus < pickedActive.t
  }

  const pickAlongRay = (clientX: number, clientY: number, requireSlabInteraction: boolean) => {
    const st = useGalaxyInteractionStore.getState()
    const ray = rayFromClient(clientX, clientY)
    const selectionMaskPickSet = maskPickFromState()
    return pickClosestActiveMovieAlongRay({
      ray,
      movies,
      activeMaterial,
      zCurrent: st.zCurrent,
      zVisWindow: st.zVisWindow,
      requireSlabInteraction,
      selectionMaskPickSet,
      cameraWorldZ: pickCameraWorldZ(),
      nearCullExemptMovieId: st.selectedMovieId,
    })
  }

  const emitHover = (
    id: number | null,
    anchor: { x: number; y: number } | null,
    planetRadiusCss: number | null,
  ) => {
    const pr = planetRadiusCss ?? Number.NaN
    if (hoverEmitEqual(lastEmitted, id, anchor, planetRadiusCss)) return
    lastEmitted = {
      id,
      ax: anchor?.x ?? Number.NaN,
      ay: anchor?.y ?? Number.NaN,
      planetR: pr,
    }
    useGalaxyInteractionStore.setState({
      hoveredMovieId: id,
      hoverAnchorCss: anchor,
      hoverPlanetRadiusCss: planetRadiusCss,
    })
  }

  const setHoverFromClient = (clientX: number, clientY: number) => {
    const st = useGalaxyInteractionStore.getState()
    if (focusPlanetBeatsActiveAlongRay(clientX, clientY, false)) {
      const selId = st.selectedMovieId
      const sp = selectionPlanet
      if (selId === null || !sp) return
      const mf = movies.find((m) => m.id === selId)
      if (!mf) return
      _worldProject.set(mf.x, mf.y, mf.z)
      const anchor = worldToScreenCss(_worldProject, camera, domElement)
      const rCss = computeWorldSphereScreenRadiusCss({
        cx: mf.x,
        cy: mf.y,
        cz: mf.z,
        rWorld: sp.lastRadius,
        camera,
        domElement,
      })
      const planetRadiusCss = rCss > 0 ? rCss : null
      emitHover(mf.id, anchor, planetRadiusCss)
      return
    }
    const picked = pickAlongRay(clientX, clientY, false)
    if (picked === null) {
      emitHover(null, null, null)
      return
    }
    const m = movies[picked.index]
    _worldProject.set(m.x, m.y, m.z)
    const anchor = worldToScreenCss(_worldProject, camera, domElement)
    const selectionMaskPickSet = maskPickFromState()
    const rCss = computeActiveMeshScreenRadiusCss({
      movie: m,
      camera,
      domElement,
      activeMaterial,
      zCurrent: st.zCurrent,
      zVisWindow: st.zVisWindow,
      selectionMaskPickSet,
    })
    const planetRadiusCss = rCss > 0 ? rCss : null
    emitHover(m.id, anchor, planetRadiusCss)
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
    if (focusPlanetBeatsActiveAlongRay(e.clientX, e.clientY, true)) {
      return
    }
    const picked = pickAlongRay(e.clientX, e.clientY, true)
    // P13.3 — blank click in focus: do not clear selectedMovieId (only ESC / drawer / search X).
    if (picked === null && useGalaxyInteractionStore.getState().selectedMovieId !== null) {
      return
    }
    const id = picked === null ? null : movies[picked.index].id
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
    lastEmitted = { id: null, ax: Number.NaN, ay: Number.NaN, planetR: Number.NaN }
    useGalaxyInteractionStore.setState({
      hoveredMovieId: null,
      hoverAnchorCss: null,
      hoverPlanetRadiusCss: null,
    })
  }

  const onPointerEnter = (e: PointerEvent) => {
    setHoverFromClient(e.clientX, e.clientY)
  }

  domElement.addEventListener('pointerenter', onPointerEnter)
  domElement.addEventListener('pointermove', onPointerMove)
  domElement.addEventListener('pointerdown', onPointerDown)
  domElement.addEventListener('pointerleave', onPointerLeave)

  return () => {
    unsubMaskPick()
    window.removeEventListener('pointerup', onWindowPointerUp, true)
    window.removeEventListener('pointercancel', onWindowPointerCancel, true)
    primaryPressActive = false
    domElement.removeEventListener('pointerenter', onPointerEnter)
    domElement.removeEventListener('pointermove', onPointerMove)
    domElement.removeEventListener('pointerdown', onPointerDown)
    domElement.removeEventListener('pointerleave', onPointerLeave)
    lastEmitted = { id: null, ax: Number.NaN, ay: Number.NaN, planetR: Number.NaN }
    useGalaxyInteractionStore.setState({
      hoveredMovieId: null,
      selectedMovieId: null,
      focusNeighborIds: null,
      hoverAnchorCss: null,
      hoverPlanetRadiusCss: null,
    })
  }
}
