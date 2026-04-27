import * as THREE from 'three'

import type { XyRange } from '@/types/galaxy'
import type { Movie } from '@/types/galaxy'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

/**
 * Perlin focus: world-space |Δz| from movie center to camera (camera at `movie.z - standoff`, axis-parallel +Z).
 * Absolute — tune here only (no `worldSpan` scaling).
 */
export const FOCUS_PERLIN_CAMERA_STANDOFF = 0.35

/** Writes world-space camera position for Perlin focus. */
export function setFocusCameraPosition(out: THREE.Vector3, movie: Pick<Movie, 'x' | 'y' | 'z'>): THREE.Vector3 {
  return out.set(movie.x, movie.y, movie.z - FOCUS_PERLIN_CAMERA_STANDOFF)
}

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
}

function applyFixedOrientation(camera: THREE.PerspectiveCamera): void {
  camera.rotation.copy(GALAXY_CAMERA_EULER)
}

function sortedPair2(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}

function clampCameraXY(camera: THREE.PerspectiveCamera, xyRange: XyRange, padRatio: number): void {
  const [x0, x1] = sortedPair2(xyRange.x[0], xyRange.x[1])
  const [y0, y1] = sortedPair2(xyRange.y[0], xyRange.y[1])
  const padX = (x1 - x0) * padRatio
  const padY = (y1 - y0) * padRatio
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, x0 - padX, x1 + padX)
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, y0 - padY, y1 + padY)
}

/** Phase 5.1.5 — keep truck / fly-to camera inside `xy_range` with padding (shared with render tick). */
export function clampGalaxyCameraXY(
  camera: THREE.PerspectiveCamera,
  xyRange: XyRange,
  padRatio = 0.08,
): void {
  clampCameraXY(camera, xyRange, padRatio)
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
    camera.position.x += dx * truckPedestalSpeed
    camera.position.y += dy * truckPedestalSpeed
    clampCameraXY(camera, options.xyRange, xyClampPaddingRatio)
    applyFixedOrientation(camera)
  }

  const onWheel = (e: WheelEvent) => {
    if (options.getInputLocked?.()) return
    e.preventDefault()
    const dz = Math.sign(e.deltaY) * zScrollSpeed * Math.min(Math.abs(e.deltaY) / 100, 3)
    const macro = options.getMacroZWheel?.() ?? true
    if (macro) {
      const { zCurrent: prev, zCamDistance } = useGalaxyInteractionStore.getState()
      const next = THREE.MathUtils.clamp(prev + dz, zLo, zHi)
      useGalaxyInteractionStore.setState({ zCurrent: next })
      camera.position.z = next - zCamDistance
    } else {
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

  return () => {
    domElement.removeEventListener('pointerdown', onPointerDown)
    domElement.removeEventListener('pointermove', onPointerMove)
    domElement.removeEventListener('pointerup', onPointerUp)
    domElement.removeEventListener('pointercancel', onPointerUp)
    domElement.removeEventListener('wheel', onWheel)
  }
}
