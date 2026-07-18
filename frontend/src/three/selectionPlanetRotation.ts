import * as THREE from 'three'

/** Local planet pole before its seeded base orientation is applied. */
export const SELECTION_PLANET_LOCAL_SPIN_AXIS = new THREE.Vector3(0, 0, 1)

/** World +Y — vertical; spin axis is Y tilted by seeded cone (0–45°, any azimuth). */
export const SELECTION_PLANET_WORLD_UP = new THREE.Vector3(0, 1, 0)

/** Max |spin rate| (rev/s); seeded speed lies in [-MAX, +MAX] (P32.6). */
export const SELECTION_PLANET_SPIN_REVS_PER_SEC_MAX = 0.1

/** Seeded tilt from world +Y (degrees, inclusive 0…45). */
export const SELECTION_PLANET_SPIN_TILT_DEG_MAX = 45

export type SeededSelectionPlanetSpinParams = SeededSpinAxisParams & {
  /** Signed rev/s in [-{@link SELECTION_PLANET_SPIN_REVS_PER_SEC_MAX}, +MAX]; sign = direction. */
  revsPerSec: number
}

/** Mulberry32 PRNG in [0, 1) — stable per integer seed. */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type SeededSpinAxisParams = {
  /** Degrees off world +Y, in [0, 45]. */
  tiltDeg: number
  /** Azimuth around +Y in degrees, in [0, 360). */
  azimuthDeg: number
}

/** Deterministic axis + signed spin rate from `movieId` (stable per session). */
export function seededSelectionPlanetSpinParamsForMovie(movieId: number): SeededSelectionPlanetSpinParams {
  const rnd = mulberry32((movieId >>> 0) ^ 0x9e3779b9)
  return {
    tiltDeg: rnd() * SELECTION_PLANET_SPIN_TILT_DEG_MAX,
    azimuthDeg: rnd() * 360,
    revsPerSec: (rnd() * 2 - 1) * SELECTION_PLANET_SPIN_REVS_PER_SEC_MAX,
  }
}

/** Deterministic spin cone from `movieId` (tilt 0–45°, direction 0–360°). */
export function seededSpinAxisParamsForMovie(movieId: number): SeededSpinAxisParams {
  const { tiltDeg, azimuthDeg } = seededSelectionPlanetSpinParamsForMovie(movieId)
  return { tiltDeg, azimuthDeg }
}

/** Seeded signed spin rate (rev/s) in [-0.1, 0.1]; negative = reverse about pole. */
export function selectionPlanetSpinRevsPerSec(movieId: number): number {
  return seededSelectionPlanetSpinParamsForMovie(movieId).revsPerSec
}

/**
 * Unit world spin axis: +Y tilted by seeded {@link SeededSpinAxisParams}.
 */
export function selectionPlanetSpinAxisWorld(movieId: number, target?: THREE.Vector3): THREE.Vector3 {
  const { tiltDeg, azimuthDeg } = seededSpinAxisParamsForMovie(movieId)
  const tiltRad = THREE.MathUtils.degToRad(tiltDeg)
  const azimuthRad = THREE.MathUtils.degToRad(azimuthDeg)
  const sinT = Math.sin(tiltRad)
  const cosT = Math.cos(tiltRad)
  return (target ?? new THREE.Vector3()).set(
    sinT * Math.sin(azimuthRad),
    cosT,
    sinT * Math.cos(azimuthRad),
  ).normalize()
}

/**
 * Quaternion orienting the planet-local pole (+Z) to its seeded world spin axis.
 */
export function selectionPlanetBaseOrientationQuaternion(
  movieId: number,
  target?: THREE.Quaternion,
): THREE.Quaternion {
  const axis = selectionPlanetSpinAxisWorld(movieId, new THREE.Vector3())
  const out = target ?? new THREE.Quaternion()
  return out.setFromUnitVectors(SELECTION_PLANET_LOCAL_SPIN_AXIS, axis)
}

/** Baseline mesh orientation for deterministic planet-local spin. */
export function selectionPlanetBaseQuaternion(
  movieId: number,
  target?: THREE.Quaternion,
): THREE.Quaternion {
  return selectionPlanetBaseOrientationQuaternion(movieId, target)
}

export type SelectionPlanetRotationAxis = {
  movieId: number
  /** Unit world-space axis for slow spin (32.6). */
  spinAxisWorld: THREE.Vector3
  /** Baseline mesh orientation for deterministic local-pole spin (reset on movie change). */
  baseQuaternion: THREE.Quaternion
  /** Seeded signed spin rate (rev/s), ∈ [-0.1, 0.1]. */
  revsPerSec: number
}

/** Snapshot axis + baseline orientation + spin rate for a movie (pure, no mesh mutation). */
export function selectionPlanetRotationAxisForMovie(movieId: number): SelectionPlanetRotationAxis {
  const seeded = seededSelectionPlanetSpinParamsForMovie(movieId)
  return {
    movieId,
    spinAxisWorld: selectionPlanetSpinAxisWorld(movieId),
    baseQuaternion: selectionPlanetBaseQuaternion(movieId),
    revsPerSec: seeded.revsPerSec,
  }
}

/** Spin angle (rad) from elapsed seconds at signed `revsPerSec` (rev/s). */
export function selectionPlanetSpinAngleRad(elapsedSec: number, revsPerSec: number): number {
  return elapsedSec * Math.PI * 2 * revsPerSec
}

const scratchSpinDelta = new THREE.Quaternion()

/**
 * P32.6 — Spin in place about the planet pole (local +Z after `baseQuaternion` = world spin axis).
 * Uses post-multiply in mesh-local frame; premultiplying a world-axis delta would tumble (翻滚).
 */
export function selectionPlanetOrientedQuaternion(
  baseQuaternion: THREE.Quaternion,
  _spinAxisWorld: THREE.Vector3,
  angleRad: number,
  target?: THREE.Quaternion,
): THREE.Quaternion {
  const out = target ?? new THREE.Quaternion()
  scratchSpinDelta.setFromAxisAngle(SELECTION_PLANET_LOCAL_SPIN_AXIS, angleRad)
  out.copy(baseQuaternion).multiply(scratchSpinDelta)
  return out
}

/** Angle (rad) between unit vector and world +Y. */
export function angleFromWorldUpRad(axis: THREE.Vector3): number {
  return Math.acos(THREE.MathUtils.clamp(axis.dot(SELECTION_PLANET_WORLD_UP), -1, 1))
}
