import * as THREE from 'three'

import type { XyRange } from '@/types/galaxy'
import type { Movie } from '@/types/galaxy'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { getOrbitDragDirectionMode, orbitDirectionSign } from '@/utils/orbitDragDirection'

/**
 * Perlin focus: world-space |Δz| from movie center to camera (camera at `movie.z - standoff`, axis-parallel +Z).
 * Absolute — tune here only (no `worldSpan` scaling).
 * P25.1 — ~1.5× on-screen planet vs former `1` (closer camera ≈ larger angular size).
 */
export const FOCUS_PERLIN_CAMERA_STANDOFF = 1 / 1.5

/** Writes world-space camera position for Perlin focus (yaw=0, pitch=0 orbit). */
export function setFocusCameraPosition(out: THREE.Vector3, movie: Pick<Movie, 'x' | 'y' | 'z'>): THREE.Vector3 {
  return setFocusOrbitCameraPosition(out, movie, 0, 0)
}

/** Orbit offset: pivot + spherical coords; radius fixed (P13.3). yaw=0,pitch=0 → camera at pivot.z − r on axis. */
export function setFocusOrbitCameraPosition(
  out: THREE.Vector3,
  pivot: Pick<Movie, 'x' | 'y' | 'z'>,
  yaw: number,
  pitch: number,
  r: number = FOCUS_PERLIN_CAMERA_STANDOFF,
): THREE.Vector3 {
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  return out.set(
    pivot.x + r * cosP * Math.sin(yaw),
    pivot.y + r * sinP,
    pivot.z - r * cosP * Math.cos(yaw),
  )
}

export function applyFocusOrbitLookAt(camera: THREE.PerspectiveCamera, pivot: Pick<Movie, 'x' | 'y' | 'z'>): void {
  camera.lookAt(pivot.x, pivot.y, pivot.z)
}

/** Radians per CSS pixel — orbit drag sensitivity (P13.3). */
export const ORBIT_YAW_SPEED = 0.003
export const ORBIT_PITCH_SPEED = 0.003

export type { OrbitDragDirectionMode } from '@/utils/orbitDragDirection'
export { getOrbitDragDirectionMode, orbitDirectionSign } from '@/utils/orbitDragDirection'

/** Fixed orientation: parallel to Z, facing +world Z (no tilt / orbit). */
export const GALAXY_CAMERA_EULER = new THREE.Euler(0, Math.PI, 0, 'YXZ')

export interface GalaxyCameraControlOptions {
  zRange: number[]
  xyRange: XyRange
  /** World units per pixel (truck X / pedestal Y). */
  truckPedestalSpeed?: number
  /** World Z units per wheel notch (scaled by delta magnitude). */
  zScrollSpeed?: number
  /** Phase 4.5 — block truck / wheel while camera fly-to runs. */
  getInputLocked?: () => boolean
  /**
   * Phase 5.1.5 — when true, scroll wheel updates store `zCurrent` and standoff `camera.position.z`.
   * When false, wheel moves `camera.position.z` directly (e.g. planet close-up).
   */
  getMacroZWheel?: () => boolean
  /** Fraction of each XY axis span used as extra clamp margin beyond `xy_range`. Default 0.08. */
  xyClampPaddingRatio?: number
  /** P13.3 — `'orbit'` = focus selected: rotation only (no XY/Z translation via controls). */
  getCameraMode?: () => 'macro' | 'orbit'
  /** World pivot for orbit drag; null disables orbit branch. */
  getOrbitPivot?: () => THREE.Vector3 | null
}

function applyFixedOrientation(camera: THREE.PerspectiveCamera): void {
  camera.rotation.copy(GALAXY_CAMERA_EULER)
}

function sortedPair2(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}

/** Opt-in: `window.__galaxyCameraDollyPosDebug = true` — dolly / XY clamp 排错日志 */
function dollyPosDebugEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as Window & { __galaxyCameraDollyPosDebug?: boolean }).__galaxyCameraDollyPosDebug === true
  )
}

function clampCameraXY(camera: THREE.PerspectiveCamera, xyRange: XyRange, padRatio: number): void {
  const [x0, x1] = sortedPair2(xyRange.x[0], xyRange.x[1])
  const [y0, y1] = sortedPair2(xyRange.y[0], xyRange.y[1])
  const padX = (x1 - x0) * padRatio
  const padY = (y1 - y0) * padRatio
  const bx = camera.position.x
  const by = camera.position.y
  const xmin = x0 - padX
  const xmax = x1 + padX
  const ymin = y0 - padY
  const ymax = y1 + padY
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, xmin, xmax)
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, ymin, ymax)
  if (dollyPosDebugEnabled()) {
    const ddx = camera.position.x - bx
    const ddy = camera.position.y - by
    const moved = Math.abs(ddx) > 1e-8 || Math.abs(ddy) > 1e-8
    if (moved) {
      const mag = Math.hypot(ddx, ddy)
      const row = {
        source: 'clampCameraXY',
        before: { x: bx, y: by },
        after: { x: camera.position.x, y: camera.position.y },
        delta: { x: ddx, y: ddy, mag },
        bounds: { xmin, xmax, ymin, ymax },
        padRatio,
      }
      if (mag > 0.15) {
        console.warn('[Camera][dolly-pos-debug] large XY clamp', row)
      } else {
        console.log('[Camera][dolly-pos-debug] XY clamp', row)
      }
    }
  }
}

/** Phase 5.1.5 — keep truck / fly-to camera inside `xy_range` with padding (shared with render tick). */
export function clampGalaxyCameraXY(
  camera: THREE.PerspectiveCamera,
  xyRange: XyRange,
  padRatio = 0.08,
): void {
  clampCameraXY(camera, xyRange, padRatio)
}

/** Phase 17.3 — default standoff; must stay aligned with `galaxyInteractionStore` initial `zCamDistance`. */
export const GALAXY_ZCAM_DISTANCE_DEFAULT = 30

const ZCAM_DOLLY_MIN = 2
const DOLLY_SPEED_MUL = 5 // P17.3 dolly; P17.4 production default (× zScroll wheel scaling, see Phase 17.3 report)

const _dollyVBefore = new THREE.Vector3()
const _dollyVAfter = new THREE.Vector3()
const _ndcXY = { x: 0, y: 0 }
const _dollyRaycaster = new THREE.Raycaster()
const _dollyNdcVec = new THREE.Vector2()
const _zPlane = new THREE.Plane()
const _zPlaneNormal = new THREE.Vector3(0, 0, 1)

function clientToNdc(clientX: number, clientY: number, rect: DOMRect, out: { x: number; y: number }): void {
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  out.x = ((clientX - rect.left) / w) * 2 - 1
  out.y = -(((clientY - rect.top) / h) * 2 - 1)
}

/**
 * Intersection of camera ray (NDC) with horizontal plane z = worldZ (galaxy macro plane).
 * Uses Raycaster so ray direction matches Three + fixed galaxy orientation.
 * @returns true if ray is parallel / miss (degenerate)
 */
function rayIntersectHorizonAtZ(
  ndcX: number,
  ndcY: number,
  camera: THREE.PerspectiveCamera,
  worldZ: number,
  out: THREE.Vector3,
): boolean {
  _dollyNdcVec.set(ndcX, ndcY)
  _dollyRaycaster.setFromCamera(_dollyNdcVec, camera)
  _zPlane.set(_zPlaneNormal, -worldZ)
  const hit = _dollyRaycaster.ray.intersectPlane(_zPlane, out)
  return hit === null
}

/** True when focus is in a field that should receive Space for typing (not dolly-arm). */
function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  const role = target.getAttribute('role')
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true
  return false
}

/** P17.3 — dolly-to-cursor: change standoff and pan X/Y so the z = zCurrent plane point under the cursor stays fixed. */
function dollyToCursor(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  clientX: number,
  clientY: number,
  dz: number,
  xyRange: XyRange,
  xyClampPad: number,
): void {
  const rect = domElement.getBoundingClientRect()
  clientToNdc(clientX, clientY, rect, _ndcXY)
  const { zCurrent, zCamDistance: prevR } = useGalaxyInteractionStore.getState()

  camera.updateMatrixWorld(true)

  const camX0 = camera.position.x
  const camY0 = camera.position.y
  const camZ0 = camera.position.z

  const singularHitBefore = rayIntersectHorizonAtZ(_ndcXY.x, _ndcXY.y, camera, zCurrent, _dollyVBefore)

  const baseSpeed = DOLLY_SPEED_MUL * Math.max(prevR / 30, 0.5)
  /** Small prevR (强变焦): 减小每步 ΔR，锚点 XY 补偿单帧不会过大 */
  const nearEase = THREE.MathUtils.clamp(prevR / 14, 0.22, 1)
  const speed = baseSpeed * nearEase
  // 局部缩放仅允许推近，standoff 不超过默认机位（不允许 dolly 拉得比 default 更远）
  const nextR = THREE.MathUtils.clamp(prevR + dz * speed, ZCAM_DOLLY_MIN, GALAXY_ZCAM_DISTANCE_DEFAULT)
  useGalaxyInteractionStore.setState({ zCamDistance: nextR })
  camera.position.z = zCurrent - nextR
  camera.updateMatrixWorld(true)

  const singularHitAfter = rayIntersectHorizonAtZ(_ndcXY.x, _ndcXY.y, camera, zCurrent, _dollyVAfter)
  const panDx = _dollyVBefore.x - _dollyVAfter.x
  const panDy = _dollyVBefore.y - _dollyVAfter.y
  camera.position.x += panDx
  camera.position.y += panDy

  const camXAfterPan = camera.position.x
  const camYAfterPan = camera.position.y

  clampGalaxyCameraXY(camera, xyRange, xyClampPad)

  if (dollyPosDebugEnabled()) {
    const clampDx = camera.position.x - camXAfterPan
    const clampDy = camera.position.y - camYAfterPan
    const panMag = Math.hypot(panDx, panDy)
    const row = {
      client: { x: clientX, y: clientY },
      canvasRect: { w: rect.width, h: rect.height, left: rect.left, top: rect.top },
      ndc: { x: _ndcXY.x, y: _ndcXY.y },
      zCurrent,
      prevR,
      nextR,
      dzWheelNotch: dz,
      dollySpeed: { base: baseSpeed, nearEase, applied: speed },
      camBefore: { x: camX0, y: camY0, z: camZ0 },
      singularHitBefore,
      singularHitAfter,
      worldPlaneHitBefore: _dollyVBefore.toArray(),
      worldPlaneHitAfter: _dollyVAfter.toArray(),
      anchorPanDelta: { x: panDx, y: panDy, mag: panMag },
      camAfterPan: { x: camXAfterPan, y: camYAfterPan },
      camAfterClamp: { x: camera.position.x, y: camera.position.y },
      clampDelta: { x: clampDx, y: clampDy, mag: Math.hypot(clampDx, clampDy) },
      xyClampPad,
    }
    if (singularHitBefore || singularHitAfter) {
      console.warn('[Camera][dolly-pos-debug] dollyToCursor (singular ray — unstable anchor)', row)
    } else if (panMag > 2 || Math.hypot(clampDx, clampDy) > 0.2) {
      console.warn('[Camera][dolly-pos-debug] dollyToCursor (large delta)', row)
    } else {
      console.log('[Camera][dolly-pos-debug] dollyToCursor', row)
    }
  }
}

/**
 * Truck (pointer X → world X) + pedestal (pointer Y → world Y) + wheel → world Z.
 * Rotation is locked; only `camera.position` changes.
 */
export function attachGalaxyCameraControls(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  options: GalaxyCameraControlOptions,
): () => void {
  const truckPedestalSpeed = options.truckPedestalSpeed ?? 0.02
  const zScrollSpeed = options.zScrollSpeed ?? 0.15
  const xyClampPaddingRatio = options.xyClampPaddingRatio ?? 0.08
  const [zLo, zHi] = sortedPair2(options.zRange[0], options.zRange[1])

  if (options.zRange.length !== 2) {
    throw new Error('[Camera] zRange must be [z_min, z_max]')
  }
  if (options.xyRange.x.length !== 2 || options.xyRange.y.length !== 2) {
    throw new Error('[Camera] xyRange.x / xyRange.y must each be [min, max]')
  }

  applyFixedOrientation(camera)

  let dragging = false
  let lastX = 0
  let lastY = 0

  const onPointerDown = (e: PointerEvent) => {
    if (options.getInputLocked?.()) return
    if (e.button !== 0) return
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    domElement.setPointerCapture(e.pointerId)
  }

  const onPointerUp = (e: PointerEvent) => {
    dragging = false
    try {
      domElement.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (options.getInputLocked?.()) return
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    const mode = options.getCameraMode?.() ?? 'macro'
    // Focus orbit: no truck/pedestal (keeps planet screen size/position from fixed standoff); only yaw/pitch.
    if (mode === 'orbit') {
      if (options.getOrbitPivot?.()) {
        const orbitDragSign = orbitDirectionSign(getOrbitDragDirectionMode())
        const dyaw = -dx * ORBIT_YAW_SPEED * orbitDragSign
        const dpitch = -dy * ORBIT_PITCH_SPEED * orbitDragSign
        const { yaw: y0, pitch: p0 } = useGalaxyInteractionStore.getState().focusOrbit
        const pitchNext = THREE.MathUtils.clamp(
          p0 + dpitch,
          -Math.PI / 2 + 0.05,
          Math.PI / 2 - 0.05,
        )
        useGalaxyInteractionStore.setState({ focusOrbit: { yaw: y0 + dyaw, pitch: pitchNext } })
      }
      return
    }
    camera.position.x += dx * truckPedestalSpeed
    camera.position.y += dy * truckPedestalSpeed
    clampCameraXY(camera, options.xyRange, xyClampPaddingRatio)
    applyFixedOrientation(camera)
  }

  let spaceDollyHeld = false

  const resetZCamDistanceToDefault = () => {
    const { zCurrent } = useGalaxyInteractionStore.getState()
    useGalaxyInteractionStore.setState({ zCamDistance: GALAXY_ZCAM_DISTANCE_DEFAULT })
    camera.position.z = zCurrent - GALAXY_ZCAM_DISTANCE_DEFAULT
    applyFixedOrientation(camera)
    console.log('[Camera] P17.3 zCamDistance reset to default', GALAXY_ZCAM_DISTANCE_DEFAULT)
  }

  /** Opt-in: `window.__galaxyCameraSpaceDollyDebug = true` — logs Space keydown/keyup (P17.3 排错). */
  const spaceDollyDebugEnabled = () =>
    typeof window !== 'undefined' &&
    (window as Window & { __galaxyCameraSpaceDollyDebug?: boolean }).__galaxyCameraSpaceDollyDebug === true

  const isSpaceKeyEvent = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' ' || e.key === 'Space'

  /** P17.3 — Hold Space + wheel = dolly; Space not a WheelEvent modifier — track explicitly. */
  const onWindowKeyDownSpace = (e: KeyboardEvent) => {
    if (!isSpaceKeyEvent(e)) return
    if (spaceDollyDebugEnabled()) {
      console.log('[Camera][Space dolly debug] keydown', {
        key: JSON.stringify(e.key),
        code: e.code,
        repeat: e.repeat,
        inputLocked: options.getInputLocked?.(),
        editableTarget: isEditableKeyboardTarget(e.target),
      })
    }
    if (e.repeat) return
    if (options.getInputLocked?.()) return
    if (isEditableKeyboardTarget(e.target)) return
    spaceDollyHeld = true
    e.preventDefault()
  }

  /** P17.3 — Space 松开：若此前武装过 dolly，则复位默认机位距离。 */
  const onWindowKeyUpSpace = (e: KeyboardEvent) => {
    if (!isSpaceKeyEvent(e)) return
    if (spaceDollyDebugEnabled()) {
      console.log('[Camera][Space dolly debug] keyup', {
        key: JSON.stringify(e.key),
        code: e.code,
        hadArmedDolly: spaceDollyHeld,
        zCamDistance: useGalaxyInteractionStore.getState().zCamDistance,
      })
    }
    const hadArmed = spaceDollyHeld
    spaceDollyHeld = false
    if (!hadArmed) return
    if (spaceDollyDebugEnabled()) console.log('[Camera][Space dolly debug] → resetZCamDistanceToDefault()')
    resetZCamDistanceToDefault()
  }

  /** Avoid stuck Space after Alt-Tab: lose focus → treat as release + reset. */
  const onWindowBlurSpace = () => {
    if (!spaceDollyHeld) return
    spaceDollyHeld = false
    resetZCamDistanceToDefault()
  }

  if (import.meta.env.DEV) {
    console.info(
      '[Camera] P17.3 Space+dolly | debug: __galaxyCameraSpaceDollyDebug | XY jump debug: __galaxyCameraDollyPosDebug',
    )
    console.info(
      '[Camera] P22.8 orbit drag:',
      getOrbitDragDirectionMode(),
      '| default inverted; ?orbitDrag=normal|inverted | window.__galaxyOrbitDragMode',
    )
  }

  const onWheel = (e: WheelEvent) => {
    if (options.getInputLocked?.()) return
    // Ctrl+滚轮交给浏览器页面缩放；不拦截、不改 zCurrent / zCamDistance
    if (e.ctrlKey) return
    e.preventDefault()
    // Focus orbit: fixed camera–pivot distance (Perlin vote scale); no timeline Z / dolly.
    if (options.getCameraMode?.() === 'orbit') {
      return
    }
    const dz = Math.sign(e.deltaY) * zScrollSpeed * Math.min(Math.abs(e.deltaY) / 100, 3)
    const macro = options.getMacroZWheel?.() ?? true
    if (spaceDollyHeld && macro) {
      // P17.3 — Dolly-to-cursor（focus 态 macro=false → 不进入，与 P13.3 wheel noop 一致）
      dollyToCursor(camera, domElement, e.clientX, e.clientY, dz, options.xyRange, xyClampPaddingRatio)
    } else if (macro) {
      const { zCurrent: prev, zCamDistance } = useGalaxyInteractionStore.getState()
      const next = THREE.MathUtils.clamp(prev + dz, zLo, zHi)
      useGalaxyInteractionStore.setState({ zCurrent: next })
      camera.position.z = next - zCamDistance
    } else {
      // 非 macro（focus 特写等）：P13.3 滚轮微调 Z；Space+wheel 在此 noop（不做 dolly）
      if (spaceDollyHeld) return
      camera.position.z += dz
    }
    applyFixedOrientation(camera)
  }

  domElement.style.touchAction = 'none'
  domElement.addEventListener('pointerdown', onPointerDown)
  domElement.addEventListener('pointermove', onPointerMove)
  domElement.addEventListener('pointerup', onPointerUp)
  domElement.addEventListener('pointercancel', onPointerUp)
  domElement.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onWindowKeyDownSpace, true)
  window.addEventListener('keyup', onWindowKeyUpSpace)
  window.addEventListener('blur', onWindowBlurSpace)

  return () => {
    domElement.removeEventListener('pointerdown', onPointerDown)
    domElement.removeEventListener('pointermove', onPointerMove)
    domElement.removeEventListener('pointerup', onPointerUp)
    domElement.removeEventListener('pointercancel', onPointerUp)
    domElement.removeEventListener('wheel', onWheel)
    window.removeEventListener('keydown', onWindowKeyDownSpace, true)
    window.removeEventListener('keyup', onWindowKeyUpSpace)
    window.removeEventListener('blur', onWindowBlurSpace)
    if (spaceDollyHeld) {
      spaceDollyHeld = false
      resetZCamDistanceToDefault()
    }
  }
}
