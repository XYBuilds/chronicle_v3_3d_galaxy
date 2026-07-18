import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import {
  SELECTION_PLANET_LOCAL_SPIN_AXIS,
  SELECTION_PLANET_SPIN_REVS_PER_SEC_MAX,
  SELECTION_PLANET_SPIN_TILT_DEG_MAX,
  SELECTION_PLANET_WORLD_UP,
  angleFromWorldUpRad,
  seededSelectionPlanetSpinParamsForMovie,
  seededSpinAxisParamsForMovie,
  selectionPlanetBaseOrientationQuaternion,
  selectionPlanetBaseQuaternion,
  selectionPlanetOrientedQuaternion,
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

  it('preserves the pre-retirement seeded orientation and runtime spin contract', () => {
    const movieId = 424_786
    const snap = selectionPlanetRotationAxisForMovie(movieId)

    expect(snap.spinAxisWorld.toArray()).toEqual([
      expect.closeTo(0.09688351814490896, 12),
      expect.closeTo(0.9382273205616752, 12),
      expect.closeTo(0.33217928722833484, 12),
    ])
    expect(snap.baseQuaternion.toArray()).toEqual([
      expect.closeTo(-0.5747933551400661, 12),
      expect.closeTo(0.05935448822674205, 12),
      0,
      expect.closeTo(0.8161431514226947, 12),
    ])
    expect(snap.revsPerSec).toBeCloseTo(0.0628012948203832, 14)

    const elapsedSec = 8
    expect(selectionPlanetSpinAngleRad(elapsedSec, snap.revsPerSec)).toBeCloseTo(3.1567373830982812, 14)
    const runtimeOrientation = selectionPlanetOrientedQuaternion(
      snap.baseQuaternion,
      snap.spinAxisWorld,
      selectionPlanetSpinAngleRad(elapsedSec, snap.revsPerSec),
    )
    expect(runtimeOrientation.toArray()).toEqual([
      expect.closeTo(0.06370528986790619, 12),
      expect.closeTo(0.574327426150518, 12),
      expect.closeTo(0.8161197524214503, 12),
      expect.closeTo(-0.00618007457221384, 12),
    ])
  })

  it('differs across movieIds (sanity)', () => {
    const a = selectionPlanetSpinAxisWorld(1)
    const b = selectionPlanetSpinAxisWorld(2)
    expect(a.equals(b)).toBe(false)
  })

  it('base orientation maps the planet-local pole to the spin axis', () => {
    const movieId = 99_001
    const axis = selectionPlanetSpinAxisWorld(movieId)
    const q = selectionPlanetBaseOrientationQuaternion(movieId)
    const mapped = SELECTION_PLANET_LOCAL_SPIN_AXIS.clone().applyQuaternion(q).normalize()
    expect(mapped.x).toBeCloseTo(axis.x, 5)
    expect(mapped.y).toBeCloseTo(axis.y, 5)
    expect(mapped.z).toBeCloseTo(axis.z, 5)
  })

  it('rotationAxisForMovie bundles axis, base quaternion, and seeded revsPerSec', () => {
    const snap = selectionPlanetRotationAxisForMovie(99_001)
    expect(snap.movieId).toBe(99_001)
    expect(snap.spinAxisWorld.length()).toBeCloseTo(1, 6)
    expect(snap.baseQuaternion.equals(selectionPlanetBaseOrientationQuaternion(99_001))).toBe(true)
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

  it('uses the planet-local +Z pole before seeded base orientation', () => {
    expect(SELECTION_PLANET_LOCAL_SPIN_AXIS.equals(new THREE.Vector3(0, 0, 1))).toBe(true)
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
    const poleAtBase = SELECTION_PLANET_LOCAL_SPIN_AXIS.clone().applyQuaternion(snap.baseQuaternion)

    const q = selectionPlanetOrientedQuaternion(
      snap.baseQuaternion,
      snap.spinAxisWorld,
      angle,
      new THREE.Quaternion(),
    )
    const poleAfter = SELECTION_PLANET_LOCAL_SPIN_AXIS.clone().applyQuaternion(q)
    expect(poleAfter.dot(poleAtBase)).toBeCloseTo(1, 5)

    const oldTumble = snap.baseQuaternion.clone()
    oldTumble.multiply(new THREE.Quaternion().setFromAxisAngle(snap.spinAxisWorld, angle))
    const poleTumble = SELECTION_PLANET_LOCAL_SPIN_AXIS.clone().applyQuaternion(oldTumble)
    expect(Math.abs(poleTumble.dot(poleAtBase))).toBeLessThan(0.99)
  })
})
