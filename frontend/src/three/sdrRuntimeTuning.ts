import { IDLE_NEAR_FADE_DEFAULTS } from './idleNearFade'
import { IDLE_Z_FADE_DEFAULTS } from './idleZFade'
import { COSMOS_UNIVERSE_BG_DEFAULT } from './universeBackground'

/** Focus enter duration — shared by camera, zCurrent drift, and macro-fade blend (P32.3). */
export const FOCUS_SELECT_MS = 700

/** Focus exit duration — shared by camera and macro-fade blend (P32.3). */
export const FOCUS_DESELECT_MS = 450

/** Phase 32.4 — shipped SDR defaults (SSOT for boot + `reset()`). */
export const SDR_RUNTIME_DEFAULTS = {
  universeBgHex: COSMOS_UNIVERSE_BG_DEFAULT,
  idleNearFade: IDLE_NEAR_FADE_DEFAULTS,
  idleZFade: IDLE_Z_FADE_DEFAULTS,
  focusTransitionMs: {
    select: FOCUS_SELECT_MS,
    deselect: FOCUS_DESELECT_MS,
  },
} as const

export type NumericUniform = { value: number }

export type IdleNearFadeUniformBag = {
  uIdleNearFadeEnabled: NumericUniform
  uIdleNearFadeStartDist: NumericUniform
  uIdleNearFadeWidth: NumericUniform
  uIdleNearFadeMinAlpha: NumericUniform
}

export type IdleZFadeUniformBag = {
  uIdleZFadeMode: NumericUniform
  uIdleZFadeOutsideAlpha: NumericUniform
}

export function applyIdleNearFadeDefaults(bag: IdleNearFadeUniformBag): void {
  const d = IDLE_NEAR_FADE_DEFAULTS
  bag.uIdleNearFadeEnabled.value = d.enabled
  bag.uIdleNearFadeStartDist.value = d.startDist
  bag.uIdleNearFadeWidth.value = d.width
  bag.uIdleNearFadeMinAlpha.value = d.minAlpha
}

export function applyIdleZFadeDefaults(bag: IdleZFadeUniformBag): void {
  const d = IDLE_Z_FADE_DEFAULTS
  bag.uIdleZFadeMode.value = d.mode
  bag.uIdleZFadeOutsideAlpha.value = d.outsideAlpha
}

export type SdrRuntimeTuningLogSnapshot = {
  universeBgHex: string
  universeBgSource: string
  idleNearFade: {
    enabled: number
    startDist: number
    width: number
    minAlpha: number
  }
  idleZFade: {
    mode: number
    outsideAlpha: number
  }
  macroFadeBlend: number
  selectionPhase: string
  focusProgress: number
}

export function formatSdrRuntimeTuningLog(snapshot: SdrRuntimeTuningLogSnapshot): string {
  const near = snapshot.idleNearFade
  const z = snapshot.idleZFade
  const d = SDR_RUNTIME_DEFAULTS
  return (
    '[Galaxy] SDR runtime tuning (Phase 32.4) | ' +
    `universeBg=${snapshot.universeBgHex} source=${snapshot.universeBgSource} default=${d.universeBgHex} | ` +
    `nearFade enabled=${near.enabled > 0.5 ? 1 : 0} start=${near.startDist.toFixed(1)} width=${near.width.toFixed(1)} minA=${near.minAlpha.toFixed(3)} ` +
    `(defaults start=${d.idleNearFade.startDist} width=${d.idleNearFade.width} minA=${d.idleNearFade.minAlpha}) | ` +
    `zFade mode=${z.mode} outsideA=${z.outsideAlpha.toFixed(3)} (defaults mode=${d.idleZFade.mode} outsideA=${d.idleZFade.outsideAlpha}) | ` +
    `macroFadeBlend=${snapshot.macroFadeBlend.toFixed(4)} phase=${snapshot.selectionPhase} focusProgress=${snapshot.focusProgress.toFixed(4)} ` +
    `(SELECT_MS=${d.focusTransitionMs.select} DESELECT_MS=${d.focusTransitionMs.deselect}) | ` +
    'primary: __galaxyUniverseBg __galaxyIdleNearFade __galaxyIdleZFade __galaxyIdleMacroFade; auxiliary: __galaxyColor'
  )
}
