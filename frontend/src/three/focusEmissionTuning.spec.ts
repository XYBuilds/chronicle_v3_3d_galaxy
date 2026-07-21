import { describe, expect, it } from 'vitest'

import {
  defaultFocusEmissionRuntimeTuning,
  remapFocusEmissionIntensity,
  validateFocusEmissionRuntimeTuning,
} from './focusEmissionTuning'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from './productionFocusEmissionProfile'

describe('focusEmissionTuning', () => {
  const profile = PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE

  it('starts from the approved profile endpoints with an identity exponent', () => {
    expect(defaultFocusEmissionRuntimeTuning(profile)).toEqual({
      exponent: 1,
      intensityMin: profile.intensityMin,
      intensityMax: profile.intensityMax,
    })
  })

  it('remaps the approved profile output without mutating the source profile', () => {
    const tuning = { exponent: 2, intensityMin: 0.1, intensityMax: 1.1 }
    expect(remapFocusEmissionIntensity(profile.intensityMin, profile, tuning)).toBe(0.1)
    expect(remapFocusEmissionIntensity(profile.intensityMax, profile, tuning)).toBe(1.1)
    expect(remapFocusEmissionIntensity((profile.intensityMin + profile.intensityMax) / 2, profile, tuning)).toBeCloseTo(0.35)
    expect(profile.intensityMin).toBe(0.005)
    expect(profile.intensityMax).toBe(0.65)
  })

  it('rejects invalid runtime values before a shader uniform can be changed', () => {
    for (const tuning of [
      { exponent: 0, intensityMin: 0, intensityMax: 1 },
      { exponent: -1, intensityMin: 0, intensityMax: 1 },
      { exponent: 1, intensityMin: -0.1, intensityMax: 1 },
      { exponent: 1, intensityMin: 1, intensityMax: 0.5 },
      { exponent: Number.NaN, intensityMin: 0, intensityMax: 1 },
    ]) {
      expect(() => validateFocusEmissionRuntimeTuning(tuning)).toThrow(/FocusEmissionTuning/)
    }
  })
})