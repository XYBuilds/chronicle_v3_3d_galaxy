import * as THREE from 'three'

/**
 * P27 — Timeline Z idle alpha (hard edge, no ramp):
 * - mode **1**: idle stars with release year **aZ > zCurrent + zVisWindow** multiply alpha by `outsideAlpha`.
 * - mode **0**: off (multiplier 1).
 * - mode **-1**: idle stars with **aZ < zCurrent** multiply alpha by `outsideAlpha`.
 *
 * Matches `galaxyIdle.vert.glsl`. Default `mode: 0` at boot. Tune via `window.__galaxyIdleZFade`.
 */
export const IDLE_Z_FADE_DEFAULTS = {
  /** 1 = future side of slab; 0 = off; -1 = past side of slab (before zCurrent). */
  mode: -1,
  /** Alpha multiplier on the chosen outside region (0…1). */
  outsideAlpha: 0.5,
} as const

/**
 * Z idle alpha multiplier vs slab. When `mode === 0` or `exempt`, returns `1`.
 */
export function computeIdleZFadeAlpha(
  aZ: number,
  zCurrent: number,
  zVisWindow: number,
  mode: number,
  outsideAlpha: number,
  exempt: boolean,
): number {
  if (Math.abs(mode) < 0.5 || exempt) return 1
  const zHi = zCurrent + zVisWindow
  const a = THREE.MathUtils.clamp(outsideAlpha, 0, 1)
  if (mode > 0.5) {
    return aZ > zHi ? a : 1
  }
  return aZ < zCurrent ? a : 1
}
