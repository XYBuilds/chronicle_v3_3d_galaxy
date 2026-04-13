import * as THREE from 'three'

import type { XyRange } from '@/types/galaxy'

/** Fixed orientation: parallel to Z, facing +world Z (no tilt / orbit). */
export const GALAXY_CAMERA_EULER = new THREE.Euler(0, Math.PI, 0, 'YXZ')

export interface GalaxyCameraControlOptions {
  zRange: number[]
  xyRange: XyRange
  /** World units per pixel (truck X / pedestal Y). */
  truckPedestalSpeed?: number
  /** World Z units per wheel notch (scaled by delta magnitude). */
  zScrollSpeed?: number
}

function applyFixedOrientation(camera: THREE.PerspectiveCamera): void {
  camera.rotation.copy(GALAXY_CAMERA_EULER)
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
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    camera.position.x -= dx * truckPedestalSpeed
    camera.position.y += dy * truckPedestalSpeed
    applyFixedOrientation(camera)
    console.log(
      `[Camera] X: ${camera.position.x.toFixed(4)} Y: ${camera.position.y.toFixed(4)}`,
    )
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const dz = Math.sign(e.deltaY) * zScrollSpeed * Math.min(Math.abs(e.deltaY) / 100, 3)
    camera.position.z += dz
    applyFixedOrientation(camera)
    console.log(`[Camera] Z: ${camera.position.z.toFixed(4)}`)
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
