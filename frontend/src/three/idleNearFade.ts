import * as THREE from 'three'

/**
 * P26.3 — Camera-distance idle near fade: star alpha ramps from `minAlpha` to 1 by camera–star world distance.
 * **Shipped default:** `IDLE_NEAR_FADE_DEFAULTS.enabled === 1` (fade + idle transparent path on at boot in macro).
 * Set `enabled` to `0` here or at runtime via `window.__galaxyIdleNearFade.enabled = 0` to restore opaque idle + no pick gate.
 * **Focus session** (`selectionPhase !== 'idle'`): `uIdleMacroFadesActive = 0` disables the shader branch regardless of `enabled`.
 */
export const IDLE_NEAR_FADE_DEFAULTS = {
  /** > 0.5 enables shader + idle transparent path + CPU pick gate. */
  enabled: 1,
  /** World units: below this camera–star distance, alpha ramps up from `minAlpha`. */
  startDist: 20.0,
  /** World units: `smoothstep` width from `startDist` to full opacity. */
  width: 10.0,
  /** Lower clamp on idle alpha when inside the fade band. */
  minAlpha: 0.05,
} as const

/**
 * Mirrors `galaxyIdle.vert.glsl` `smoothstep` + `mix` for near-distance fade.
 * When `enabled < 0.5` or `exempt`, returns `1` (no fade / full pick weight).
 */
export function computeIdleNearFadeAlpha(
  cameraWorld: THREE.Vector3,
  starX: number,
  starY: number,
  starZ: number,
  enabled: number,
  startDist: number,
  width: number,
  minAlpha: number,
  exempt: boolean,
): number {
  if (enabled < 0.5 || exempt) return 1
  const dx = cameraWorld.x - starX
  const dy = cameraWorld.y - starY
  const dz = cameraWorld.z - starZ
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const hi = startDist + Math.max(width, 1e-6)
  const t = THREE.MathUtils.smoothstep(dist, startDist, hi)
  return THREE.MathUtils.lerp(minAlpha, 1, t)
}
