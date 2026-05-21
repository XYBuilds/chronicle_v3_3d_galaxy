import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { GALAXY_CAMERA_EULER } from './camera'
import { computeTierLabelAzimuthRad } from './FocusSizeReferenceRings'
import { selectionPlanetRingPlaneQuaternion } from './selectionPlanetRotation'

describe('computeTierLabelAzimuthRad', () => {
  it('default focus camera: label anchor in world −X / −Z quadrant at ~45°', () => {
    const pivot = new THREE.Vector3(10, 20, 1990)
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camera.rotation.copy(GALAXY_CAMERA_EULER)
    camera.position.set(pivot.x, pivot.y, pivot.z - 1)
    camera.updateMatrixWorld(true)

    const ringQuat = selectionPlanetRingPlaneQuaternion(424_786)
    const th = computeTierLabelAzimuthRad(pivot, ringQuat, camera)

    const anchorLocal = new THREE.Vector3(Math.cos(th), Math.sin(th), 0)
    const anchorWorld = anchorLocal.clone().applyQuaternion(ringQuat)

    expect(anchorWorld.x).toBeLessThan(-0.2)
    expect(anchorWorld.z).toBeLessThan(-0.2)
    const xzAngle = Math.atan2(-anchorWorld.z, anchorWorld.x)
    expect(xzAngle).toBeCloseTo((3 * Math.PI) / 4, 1)
  })
})
