import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { computeIdleNearFadeAlpha, IDLE_NEAR_FADE_DEFAULTS } from './idleNearFade'

describe('computeIdleNearFadeAlpha', () => {
  const cam = new THREE.Vector3(0, 0, 0)

  it('returns 1 when disabled', () => {
    const a = computeIdleNearFadeAlpha(cam, 10, 0, 0, 0, 1, 2, 0.05, false)
    expect(a).toBe(1)
  })

  it('returns 1 when exempt', () => {
    const a = computeIdleNearFadeAlpha(cam, 0.1, 0, 0, 1, 1, 2, 0.05, true)
    expect(a).toBe(1)
  })

  it('ramps from minAlpha near camera to 1 past start+width', () => {
    const { startDist, width, minAlpha } = IDLE_NEAR_FADE_DEFAULTS
    const inner = computeIdleNearFadeAlpha(cam, 0, 0, 0, 1, startDist, width, minAlpha, false)
    expect(inner).toBeCloseTo(minAlpha, 5)
    const outer = computeIdleNearFadeAlpha(cam, 100, 0, 0, 1, startDist, width, minAlpha, false)
    expect(outer).toBe(1)
    const mid = computeIdleNearFadeAlpha(cam, startDist + width * 0.5, 0, 0, 1, startDist, width, minAlpha, false)
    expect(mid).toBeGreaterThan(minAlpha)
    expect(mid).toBeLessThan(1)
  })
})
