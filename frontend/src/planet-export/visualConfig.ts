import { resolvePlanetVisualState } from '../three/planetVisualState/resolve.js'
import type {
  PlanetVisualProfileSource,
  PlanetVisualState,
  PlanetVisualStateInput,
} from '../three/planetVisualState/types.js'
import type { FocusEmissionProfileProvenance } from '../types/galaxy.js'

export type PlanetEmissionVisualProvenance = FocusEmissionProfileProvenance & {
  source: PlanetVisualProfileSource
}

export type ResolvedPlanetVisualConfigInput = PlanetVisualStateInput
export type ResolvedPlanetVisualConfig = PlanetVisualState

/** Compatibility adapter for existing exporter and diagnostic callers during seam migration. */
export function resolvePlanetVisualConfig(
  input: ResolvedPlanetVisualConfigInput,
): ResolvedPlanetVisualConfig {
  return resolvePlanetVisualState(input)
}

/**
 * Compatibility overload preserves frozen P39 evidence call sites. New renderer paths pass the
 * resolved payload object, rather than composing strings at the caller.
 */
export function planetExportVisualConfigInput(config: ResolvedPlanetVisualConfig): string
export function planetExportVisualConfigInput(legacyVisualInput: string, exportSizeRoot: number): string
export function planetExportVisualConfigInput(
  config: ResolvedPlanetVisualConfig | string,
  exportSizeRoot?: number,
): string {
  if (typeof config === 'string') {
    void exportSizeRoot
    return config
  }
  return config.hashInput
}

/** Backward-compatible name for consumers that only need the stable resolved hash input. */
export function resolvedPlanetVisualHashInput(config: ResolvedPlanetVisualConfig): string {
  return config.hashInput
}