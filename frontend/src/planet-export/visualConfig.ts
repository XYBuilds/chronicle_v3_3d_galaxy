import { perlinBloomVisualConfigInput, type PerlinBloomParams } from '@/three/perlinBloomContract'
import { PLANET_EXPORT_SIZE_ROOTS, type PlanetExportSizeRoot } from './sizing'

/** Stable complete visual-config input supplied by the export page to metadata generation. */
export function planetExportVisualConfigInput(
  planetVisualConfigInput: string,
  exportSizeRoot: PlanetExportSizeRoot,
  bloomParams?: PerlinBloomParams,
): string {
  return JSON.stringify({
    planet: planetVisualConfigInput,
    perlinBloom: perlinBloomVisualConfigInput(bloomParams),
    exportSizeRoot,
    supportedExportSizeRoots: PLANET_EXPORT_SIZE_ROOTS,
  })
}