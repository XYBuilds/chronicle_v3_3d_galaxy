import { PLANET_EXPORT_SIZE_ROOTS, type PlanetExportSizeRoot } from './sizing'

/**
 * Normal exporter config intentionally has no diagnostic override channel.
 * Size roots remain a validated framing concern, not a visual profile fork.
 */
export function planetExportVisualConfigInput(
  planetVisualConfigInput: string,
  exportSizeRoot: PlanetExportSizeRoot,
): string {
  // Framing is deliberately excluded: production visual config is shared by site,
  // normal exporter, and diagnostics when no explicit diagnostic profile exists.
  void exportSizeRoot
  return planetVisualConfigInput
}

export const PLANET_EXPORT_SUPPORTED_SIZE_ROOTS = PLANET_EXPORT_SIZE_ROOTS