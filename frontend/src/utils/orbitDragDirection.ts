/** P22.8 — focus orbit pointer-drag direction (A/B); product default is inverted. */
export type OrbitDragDirectionMode = 'normal' | 'inverted'

export function orbitDirectionSign(mode: OrbitDragDirectionMode): number {
  return mode === 'inverted' ? -1 : 1
}

/** Pure resolver for tests — window override wins over query when valid. */
export function resolveOrbitDragDirectionModeFromInputs(
  windowOverride: string | undefined,
  queryValue: string | null,
): OrbitDragDirectionMode {
  if (windowOverride === 'inverted' || windowOverride === 'normal') return windowOverride
  if (queryValue === 'inverted' || queryValue === 'normal') return queryValue
  return 'inverted'
}

/**
 * P22.8 — `window.__galaxyOrbitDragMode` ('inverted' | 'normal') overrides URL when set.
 * URL: `?orbitDrag=inverted|normal`. Omitted or invalid → `inverted`; use `?orbitDrag=normal` for legacy drag feel.
 */
export function getOrbitDragDirectionMode(): OrbitDragDirectionMode {
  if (typeof window === 'undefined') return 'inverted'
  const win = window as Window & { __galaxyOrbitDragMode?: string }
  const q = new URLSearchParams(window.location.search).get('orbitDrag')
  return resolveOrbitDragDirectionModeFromInputs(win.__galaxyOrbitDragMode, q)
}
