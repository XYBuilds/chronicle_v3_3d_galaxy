/**
 * Compile-only check: subsample `public/data/galaxy_data.json` matches §4 types.
 * Not imported by the app bundle (Phase 3.3 loader will fetch at runtime).
 */
import galaxyDataJson from '../../public/data/galaxy_data.json'
import type { GalaxyData } from './galaxy'

export const _galaxyDataJsonMatchesSpec = galaxyDataJson satisfies GalaxyData
