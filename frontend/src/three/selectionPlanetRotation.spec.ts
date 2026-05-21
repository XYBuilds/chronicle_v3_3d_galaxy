import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import {
  REFERENCE_RING_PLANE_LOCAL_NORMAL,
  SELECTION_PLANET_SPIN_REVS_PER_SEC_MAX,
  SELECTION_PLANET_SPIN_TILT_DEG_MAX,
  SELECTION_PLANET_WORLD_UP,
  angleFromWorldUpRad,
  seededSelectionPlanetSpinParamsForMovie,
  seededSpinAxisParamsForMovie,
  selectionPlanetBaseQuaternion,
  selectionPlanetOrientedQuaternion,
  selectionPlanetRingPlaneQuaternion,
  selectionPlanetRotationAxisForMovie,
  selectionPlanetSpinAngleRad,
  selectionPlanetSpinAxisWorld,
  selectionPlanetSpinRevsPerSec,
} from './selectionPlanetRotation'

describe('selectionPlanetRotation', () => {
  it('spin axis is unit length and tilted from +Y by seeded 0–45°', () => {
    const movieId = 424_786
    const params = seededSpinAxisParamsForMovie(movieId)
    expect(params.tiltDeg).toBeGreaterThanOrEqual(0)
    expect(params.tiltDeg).toBeLessThanOrEqual(SELECTION_PLANET_SPIN_TILT_DEG_MAX)
    expect(params.azimuthDeg).toBeGreaterThanOrEqual(0)
    expect(params.azimuthDeg).toBeLessThan(360)

    const axis = selectionPlanetSpinAxisWorld(movieId)
    expect(axis.length()).toBeCloseTo(1, 6)
    const tiltRad = THREE.MathUtils.degToRad(params.tiltDeg)
    expect(angleFromWorldUpRad(axis)).toBeCloseTo(tiltRad, 5)
  })

  it('is stable for the same movieId across calls', () => {
    const movieId = 12_345
    const a = selectionPlanetSpinAxisWorld(movieId, new THREE.Vector3())
    const b = selectionPlanetSpinAxisWorld(movieId, new THREE.Vector3())
    expect(a.equals(b)).toBe(true)
    expect(seededSpinAxisParamsForMovie(movieId)).toEqual(seededSpinAxisParamsForMovie(movieId))
    expect(selectionPlanetBaseQuaternion(movieId).equals(selectionPlanetBaseQuaternion(movieId))).toBe(true)
  })

  it('differs across movieIds (sanity)', () => {
    const a = selectionPlanetSpinAxisWorld(1)
    const b = selectionPlanetSpinAxisWorld(2)
    expect(a.equals(b)).toBe(false)
  })

  it('ring plane quaternion maps local +Z to spin axis', () => {
    const movieId = 99_001
    const axis = selectionPlanetSpinAxisWorld(movieId)
    const q = selectionPlanetRingPlaneQuaternion(movieId)
    const mapped = REFERENCE_RING_PLANE_LOCAL_NORMAL.clone().applyQuaternion(q).normalize()
    expect(mapped.x).toBeCloseTo(axis.x, 5)
    expect(mapped.y).toBeCloseTo(axis.y, 5)
    expect(mapped.z).toBeCloseTo(axis.z, 5)
  })

  it('rotationAxisForMovie bundles axis, base quaternion, and seeded revsPerSec', () => {
    const snap = selectionPlanetRotationAxisForMovie(99_001)
    expect(snap.movieId).toBe(99_001)
    expect(snap.spinAxisWorld.length()).toBeCloseTo(1, 6)
    expect(snap.baseQuaternion.equals(selectionPlanetRingPlaneQuaternion(99_001))).toBe(true)
    expect(snap.revsPerSec).toBe(selectionPlanetSpinRevsPerSec(99_001))
    expect(Math.abs(snap.revsPerSec)).toBeLessThanOrEqual(SELECTION_PLANET_SPIN_REVS_PER_SEC_MAX + 1e-9)
  })

  it('seeded spin rate is stable and within [-0.1, 0.1] rev/s', () => {
    const movieId = 55_555
    const a = selectionPlanetSpinRevsPerSec(movieId)
    const b = selectionPlanetSpinRevsPerSec(movieId)
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(-SELECTION_PLANET_SPIN_REVS_PER_SEC_MAX)
    expect(a).toBeLessThanOrEqual(SELECTION_PLANET_SPIN_REVS_PER_SEC_MAX)
    expect(seededSelectionPlanetSpinParamsForMovie(movieId).revsPerSec).toBe(a)
  })

  it('uses RingGeometry local +Z as plane normal before orientation', () => {
    expect(REFERENCE_RING_PLANE_LOCAL_NORMAL.equals(new THREE.Vector3(0, 0, 1))).toBe(true)
    expect(SELECTION_PLANET_WORLD_UP.equals(new THREE.Vector3(0, 1, 0))).toBe(true)
  })

  it('spin angle respects signed revsPerSec', () => {
    expect(selectionPlanetSpinAngleRad(0, 0.05)).toBe(0)
    const fwd = selectionPlanetSpinAngleRad(10, 0.05)
    expect(fwd).toBeCloseTo(10 * Math.PI * 2 * 0.05, 6)
    const rev = selectionPlanetSpinAngleRad(10, -0.05)
    expect(rev).toBeCloseTo(-fwd, 6)
  })

  it('oriented quaternion matches base at t=0 and differs after spin', () => {
    const snap = selectionPlanetRotationAxisForMovie(42)
    const atZero = selectionPlanetOrientedQuaternion(
      snap.baseQuaternion,
      snap.spinAxisWorld,
      0,
      new THREE.Quaternion(),
    )
    expect(atZero.equals(snap.baseQuaternion)).toBe(true)

    const spun = selectionPlanetOrientedQuaternion(
      snap.baseQuaternion,
      snap.spinAxisWorld,
      selectionPlanetSpinAngleRad(12, snap.revsPerSec),
      new THREE.Quaternion(),
    )
    expect(spun.equals(snap.baseQuaternion)).toBe(false)
  })

  it('spin keeps mesh local +Z (pole) fixed in world; old world-axis post-multiply did not', () => {
    const snap = selectionPlanetRotationAxisForMovie(77_007)
    const angle = selectionPlanetSpinAngleRad(8, snap.revsPerSec)
    const poleAtBase = new THREE.Vector3(0, 0, 1).applyQuaternion(snap.baseQuaternion)

    const q = selectionPlanetOrientedQuaternion(
      snap.baseQuaternion,
      snap.spinAxisWorld,
      angle,
      new THREE.Quaternion(),
    )
    const poleAfter = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    expect(poleAfter.dot(poleAtBase)).toBeCloseTo(1, 5)

    const oldTumble = snap.baseQuaternion.clone()
    oldTumble.multiply(new THREE.Quaternion().setFromAxisAngle(snap.spinAxisWorld, angle))
    const poleTumble = new THREE.Vector3(0, 0, 1).applyQuaternion(oldTumble)
    expect(Math.abs(poleTumble.dot(poleAtBase))).toBeLessThan(0.99)
  })
})
