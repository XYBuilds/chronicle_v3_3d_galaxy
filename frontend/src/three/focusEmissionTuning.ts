import type { FocusEmissionProfile } from './focusEmission'

export type FocusEmissionRuntimeTuning = {
  exponent: number
  intensityMin: number
  intensityMax: number
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`[FocusEmissionTuning] ${label} must be finite; received ${value}`)
  }
  return value
}

/**
 * Runtime-only remap of the approved rating profile output. The profile itself
 * remains immutable so browser experiments cannot alter production render metadata.
 */
export function validateFocusEmissionRuntimeTuning(
  tuning: FocusEmissionRuntimeTuning,
): FocusEmissionRuntimeTuning {
  const exponent = finite(tuning.exponent, 'exponent')
  const intensityMin = finite(tuning.intensityMin, 'intensityMin')
  const intensityMax = finite(tuning.intensityMax, 'intensityMax')

  if (exponent <= 0) throw new Error('[FocusEmissionTuning] exponent must be > 0')
  if (intensityMin < 0 || intensityMax < intensityMin) {
    throw new Error('[FocusEmissionTuning] intensity endpoints must satisfy 0 <= intensityMin <= intensityMax')
  }
  return { exponent, intensityMin, intensityMax }
}

export function defaultFocusEmissionRuntimeTuning(profile: FocusEmissionProfile): FocusEmissionRuntimeTuning {
  return { exponent: 1, intensityMin: profile.intensityMin, intensityMax: profile.intensityMax }
}

export function remapFocusEmissionIntensity(
  sourceIntensity: number,
  sourceProfile: FocusEmissionProfile,
  tuning: FocusEmissionRuntimeTuning,
): number {
  const source = finite(sourceIntensity, 'sourceIntensity')
  const { intensityMin: sourceMin, intensityMax: sourceMax } = sourceProfile
  const next = validateFocusEmissionRuntimeTuning(tuning)
  const sourceSpan = sourceMax - sourceMin
  if (!(sourceSpan > 0)) throw new Error('[FocusEmissionTuning] source profile intensity range must be positive')

  const normalized = Math.min(1, Math.max(0, (source - sourceMin) / sourceSpan))
  return next.intensityMin + Math.pow(normalized, next.exponent) * (next.intensityMax - next.intensityMin)
}