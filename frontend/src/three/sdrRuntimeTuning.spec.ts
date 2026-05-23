import { describe, expect, it } from 'vitest'

import { IDLE_NEAR_FADE_DEFAULTS } from './idleNearFade'
import { IDLE_Z_FADE_DEFAULTS } from './idleZFade'
import { COSMOS_UNIVERSE_BG_DEFAULT } from './universeBackground'
import {
  applyIdleNearFadeDefaults,
  applyIdleZFadeDefaults,
  FOCUS_DESELECT_MS,
  FOCUS_SELECT_MS,
  formatSdrRuntimeTuningLog,
  SDR_RUNTIME_DEFAULTS,
} from './sdrRuntimeTuning'

describe('sdrRuntimeTuning', () => {
  it('SDR_RUNTIME_DEFAULTS mirrors module SSOT constants', () => {
    expect(SDR_RUNTIME_DEFAULTS.universeBgHex).toBe(COSMOS_UNIVERSE_BG_DEFAULT)
    expect(SDR_RUNTIME_DEFAULTS.idleNearFade).toEqual(IDLE_NEAR_FADE_DEFAULTS)
    expect(SDR_RUNTIME_DEFAULTS.idleZFade).toEqual(IDLE_Z_FADE_DEFAULTS)
    expect(SDR_RUNTIME_DEFAULTS.focusTransitionMs.select).toBe(FOCUS_SELECT_MS)
    expect(SDR_RUNTIME_DEFAULTS.focusTransitionMs.deselect).toBe(FOCUS_DESELECT_MS)
  })

  it('applyIdleNearFadeDefaults and applyIdleZFadeDefaults restore uniforms', () => {
    const nearBag = {
      uIdleNearFadeEnabled: { value: 0 },
      uIdleNearFadeStartDist: { value: 99 },
      uIdleNearFadeWidth: { value: 99 },
      uIdleNearFadeMinAlpha: { value: 0.99 },
    }
    const zBag = {
      uIdleZFadeMode: { value: 1 },
      uIdleZFadeOutsideAlpha: { value: 0.99 },
    }
    applyIdleNearFadeDefaults(nearBag)
    applyIdleZFadeDefaults(zBag)
    expect(nearBag.uIdleNearFadeEnabled.value).toBe(IDLE_NEAR_FADE_DEFAULTS.enabled)
    expect(nearBag.uIdleNearFadeStartDist.value).toBe(IDLE_NEAR_FADE_DEFAULTS.startDist)
    expect(zBag.uIdleZFadeMode.value).toBe(IDLE_Z_FADE_DEFAULTS.mode)
    expect(zBag.uIdleZFadeOutsideAlpha.value).toBe(IDLE_Z_FADE_DEFAULTS.outsideAlpha)
  })

  it('formatSdrRuntimeTuningLog includes key fields', () => {
    const line = formatSdrRuntimeTuningLog({
      universeBgHex: '#000103',
      universeBgSource: 'default',
      idleNearFade: { enabled: 1, startDist: 20, width: 10, minAlpha: 0.1 },
      idleZFade: { mode: -1, outsideAlpha: 0.5 },
      macroFadeBlend: 1,
      selectionPhase: 'idle',
      focusProgress: 0,
    })
    expect(line).toContain('SDR runtime tuning')
    expect(line).toContain('macroFadeBlend=1.0000')
    expect(line).toContain('__galaxyUniverseBg')
  })
})
