export const FOCUS_EMISSION_MODEL_VERSION = 'vote-average-anchored-smoothstep-v1' as const

export type FocusEmissionCurve = {
  modelVersion: typeof FOCUS_EMISSION_MODEL_VERSION
  ratingLowAnchor: number
  ratingHighAnchor: number
  intensityMin: number
  intensityMax: number
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`[FocusEmission] ${label} must be finite; received ${value}`)
  }
  return value
}

/** Validates the versioned Focus rating-to-emission production contract. */
export function validateFocusEmissionCurve(curve: FocusEmissionCurve): FocusEmissionCurve {
  if (curve.modelVersion !== FOCUS_EMISSION_MODEL_VERSION) {
    throw new Error(`[FocusEmission] modelVersion must equal ${FOCUS_EMISSION_MODEL_VERSION}; received ${String(curve.modelVersion)}`)
  }
  const ratingLowAnchor = finite(curve.ratingLowAnchor, 'ratingLowAnchor')
  const ratingHighAnchor = finite(curve.ratingHighAnchor, 'ratingHighAnchor')
  const intensityMin = finite(curve.intensityMin, 'intensityMin')
  const intensityMax = finite(curve.intensityMax, 'intensityMax')

  if (ratingLowAnchor < 0 || ratingHighAnchor > 10 || ratingLowAnchor >= ratingHighAnchor) {
    throw new Error('[FocusEmission] rating anchors must satisfy 0 <= ratingLowAnchor < ratingHighAnchor <= 10')
  }
  if (intensityMin < 0 || intensityMax < 0 || intensityMin > intensityMax) {
    throw new Error('[FocusEmission] intensity endpoints must be non-negative with intensityMin <= intensityMax')
  }

  return { modelVersion: FOCUS_EMISSION_MODEL_VERSION, ratingLowAnchor, ratingHighAnchor, intensityMin, intensityMax }
}

/**
 * Maps a finite TMDB vote average to the fixed Focus emission interval.
 * Ratings are clamped to curve anchors before the smoothstep transfer.
 */
export function focusEmissionIntensityFromVoteAverage(voteAverage: number, curve: FocusEmissionCurve): number {
  const rating = finite(voteAverage, 'voteAverage')
  const validated = validateFocusEmissionCurve(curve)
  const t = Math.min(
    1,
    Math.max(0, (rating - validated.ratingLowAnchor) / (validated.ratingHighAnchor - validated.ratingLowAnchor)),
  )
  const smoothstep = t * t * (3 - 2 * t)
  return validated.intensityMin + smoothstep * (validated.intensityMax - validated.intensityMin)
}