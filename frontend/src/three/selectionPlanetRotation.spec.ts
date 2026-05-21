import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { seededRingPlaneQuaternion } from './FocusSizeReferenceRings'
import {
  REFERENCE_RING_PLANE_LOCAL_NORMAL,
  selectionPlanetBaseQuaternion,
  selectionPlanetRotationAxisForMovie,
  selectionPlanetSpinAxisWorld,
} from './selectionPlanetRotation'

describe('selectionPlanetRotation', () => {
  it('spin axis is unit length and matches ring plane normal transform', () => {
    const movieId = 424_786
    const axis = selectionPlanetSpinAxisWorld(movieId)
    expect(axis.length()).toBeCloseTo(1, 6)

    const expected = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(seededRingPlaneQuaternion(movieId))
      .normalize()
    expect(axis.x).toBeCloseTo(expected.x, 6)
    expect(axis.y).toBeCloseTo(expected.y, 6)
    expect(axis.z).toBeCloseTo(expected.z, 6)
  })

  it('is stable for the same movieId across calls', () => {
    const movieId = 12_345
    const a = selectionPlanetSpinAxisWorld(movieId, new THREE.Vector3())
    const b = selectionPlanetSpinAxisWorld(movieId, new THREE.Vector3())
    expect(a.equals(b)).toBe(true)
    expect(selectionPlanetBaseQuaternion(movieId).equals(selectionPlanetBaseQuaternion(movieId))).toBe(true)
  })

  it('differs across movieIds (sanity)', () => {
    const a = selectionPlanetSpinAxisWorld(1)
    const b = selectionPlanetSpinAxisWorld(2)
    expect(a.equals(b)).toBe(false)
  })

  it('rotationAxisForMovie bundles axis and base quaternion', () => {
    const snap = selectionPlanetRotationAxisForMovie(99_001)
    expect(snap.movieId).toBe(99_001)
    expect(snap.spinAxisWorld.length()).toBeCloseTo(1, 6)
    expect(snap.baseQuaternion.equals(seededRingPlaneQuaternion(99_001))).toBe(true)
  })

  it('uses RingGeometry local +Z as plane normal', () => {
    expect(REFERENCE_RING_PLANE_LOCAL_NORMAL.equals(new THREE.Vector3(0, 0, 1))).toBe(true)
  })
})
