import * as THREE from 'three'

import { seededRingPlaneQuaternion } from './FocusSizeReferenceRings'

/**
 * Local normal of {@link THREE.RingGeometry} / {@link FocusSizeReferenceRings} group
 * before `seededRingPlaneQuaternion` is applied (ring lies in local XY, normal +Z).
 */
export const REFERENCE_RING_PLANE_LOCAL_NORMAL = new THREE.Vector3(0, 0, 1)

/**
 * P32.5 — Stable focus visual orientation shared with size reference rings (seeded by `movieId`).
 */
export function selectionPlanetBaseQuaternion(
  movieId: number,
  target?: THREE.Quaternion,
): THREE.Quaternion {
  return (target ?? new THREE.Quaternion()).copy(seededRingPlaneQuaternion(movieId))
}

/**
 * P32.5 — World-space spin axis for the selected Perlin planet: reference-ring plane normal.
 * Matches `FocusSizeReferenceRings` coplanar orientation; stable per `movieId` within a session.
 */
export function selectionPlanetSpinAxisWorld(movieId: number, target?: THREE.Vector3): THREE.Vector3 {
  const out = target ?? new THREE.Vector3()
  const q = seededRingPlaneQuaternion(movieId)
  return out.copy(REFERENCE_RING_PLANE_LOCAL_NORMAL).applyQuaternion(q).normalize()
}

export type SelectionPlanetRotationAxis = {
  movieId: number
  /** Unit world-space axis for slow spin (32.6). */
  spinAxisWorld: THREE.Vector3
  /** Baseline mesh orientation aligned with reference rings (reset on movie change). */
  baseQuaternion: THREE.Quaternion
}

/** Snapshot axis + baseline orientation for a movie (pure, no mesh mutation). */
export function selectionPlanetRotationAxisForMovie(movieId: number): SelectionPlanetRotationAxis {
  return {
    movieId,
    spinAxisWorld: selectionPlanetSpinAxisWorld(movieId),
    baseQuaternion: selectionPlanetBaseQuaternion(movieId),
  }
}
