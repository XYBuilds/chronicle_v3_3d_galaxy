import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import {
  TIER_LABEL_ANCHOR_WORLD_NEG_X,
  TIER_LABEL_ANCHOR_WORLD_NEG_Z,
  computeTierLabelAzimuthRad,
} from './FocusSizeReferenceRings'
import { selectionPlanetRingPlaneQuaternion } from './selectionPlanetRotation'

describe('computeTierLabelAzimuthRad', () => {
  it('anchor is world (−X,−Z) 45° projected onto ring plane (independent of camera)', () => {
    const ringQuat = selectionPlanetRingPlaneQuaternion(424_786)
    const th = computeTierLabelAzimuthRad(ringQuat)

    const anchorLocal = new THREE.Vector3(Math.cos(th), Math.sin(th), 0)
    const anchorWorld = anchorLocal.clone().applyQuaternion(ringQuat)

    const expected = new THREE.Vector3()
      .addVectors(TIER_LABEL_ANCHOR_WORLD_NEG_X, TIER_LABEL_ANCHOR_WORLD_NEG_Z)
      .normalize()
    const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(ringQuat)
    const project = (v: THREE.Vector3, out: THREE.Vector3) => {
      const d = v.dot(planeNormal)
      out.copy(v).addScaledVector(planeNormal, -d)
      return out.normalize()
    }
    project(expected, expected)

    expect(anchorWorld.dot(expected)).toBeCloseTo(1, 3)
    expect(anchorWorld.x).toBeLessThan(0)
    expect(anchorWorld.z).toBeLessThan(0)
  })
})
