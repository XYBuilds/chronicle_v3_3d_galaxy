import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import {
  applyMacroFadeBlend,
  computeIdleMacroFadesBlendForPhase,
  computeIdleNearFadeAlpha,
  IDLE_NEAR_FADE_DEFAULTS,
} from './idleNearFade'

describe('computeIdleMacroFadesBlendForPhase', () => {
  it('is 1 in idle and 0 in selected', () => {
    expect(computeIdleMacroFadesBlendForPhase('idle', 0, true)).toBe(1)
    expect(computeIdleMacroFadesBlendForPhase('selected', 1, true)).toBe(0)
  })

  it('fades out on selecting from macro (1→0 as progress 0→1)', () => {
    expect(computeIdleMacroFadesBlendForPhase('selecting', 0, true)).toBe(1)
    expect(computeIdleMacroFadesBlendForPhase('selecting', 1, true)).toBe(0)
    expect(computeIdleMacroFadesBlendForPhase('selecting', 0.5, true)).toBeCloseTo(0.5, 5)
  })

  it('stays off on focus neighbor switch', () => {
    expect(computeIdleMacroFadesBlendForPhase('selecting', 0, false)).toBe(0)
    expect(computeIdleMacroFadesBlendForPhase('selecting', 0.5, false)).toBe(0)
  })

  it('fades in on deselecting (0→1 as progress 1→0)', () => {
    expect(computeIdleMacroFadesBlendForPhase('deselecting', 1, true)).toBe(0)
    expect(computeIdleMacroFadesBlendForPhase('deselecting', 0, true)).toBe(1)
    expect(computeIdleMacroFadesBlendForPhase('deselecting', 0.5, true)).toBeCloseTo(0.5, 5)
  })
})

describe('applyMacroFadeBlend', () => {
  it('returns 1 when blend is 0', () => {
    expect(applyMacroFadeBlend(0.2, 0)).toBe(1)
  })

  it('returns faded alpha when blend is 1', () => {
    expect(applyMacroFadeBlend(0.2, 1)).toBeCloseTo(0.2, 5)
  })

  it('lerps toward 1 for partial blend', () => {
    expect(applyMacroFadeBlend(0.2, 0.5)).toBeCloseTo(0.6, 5)
  })
})

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
