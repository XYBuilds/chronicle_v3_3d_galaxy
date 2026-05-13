import { describe, expect, it } from 'vitest'

import { computeIdleZFadeAlpha } from './idleZFade'

describe('computeIdleZFadeAlpha', () => {
  const zC = 2000
  const zW = 30
  const zHi = zC + zW
  const oa = 0.25

  it('returns 1 when mode is 0', () => {
    expect(computeIdleZFadeAlpha(1800, zC, zW, 0, oa, false)).toBe(1)
    expect(computeIdleZFadeAlpha(3000, zC, zW, 0, oa, false)).toBe(1)
  })

  it('returns 1 when exempt', () => {
    expect(computeIdleZFadeAlpha(1800, zC, zW, -1, oa, true)).toBe(1)
    expect(computeIdleZFadeAlpha(3000, zC, zW, 1, oa, true)).toBe(1)
  })

  it('mode 1: only aZ > zHi uses outsideAlpha', () => {
    expect(computeIdleZFadeAlpha(zHi + 1, zC, zW, 1, oa, false)).toBe(oa)
    expect(computeIdleZFadeAlpha(zHi, zC, zW, 1, oa, false)).toBe(1)
    expect(computeIdleZFadeAlpha(zC + zW * 0.5, zC, zW, 1, oa, false)).toBe(1)
  })

  it('mode -1: only aZ < zCurrent uses outsideAlpha', () => {
    expect(computeIdleZFadeAlpha(zC - 1, zC, zW, -1, oa, false)).toBe(oa)
    expect(computeIdleZFadeAlpha(zC, zC, zW, -1, oa, false)).toBe(1)
    expect(computeIdleZFadeAlpha(zHi + 10, zC, zW, -1, oa, false)).toBe(1)
  })

  it('clamps outsideAlpha to [0, 1]', () => {
    expect(computeIdleZFadeAlpha(zHi + 1, zC, zW, 1, 1.5, false)).toBe(1)
    expect(computeIdleZFadeAlpha(zC - 1, zC, zW, -1, -0.2, false)).toBe(0)
  })
})
