/**
 * Compile-only check: minimal fixture matches §4 types.
 * Runtime load uses gzip from `public/data` (see `loadGalaxyData.ts`).
 */
import type { GalaxyData } from './galaxy'
import { galaxyMinimalFixture } from './galaxyMinimalFixture'

export const _galaxyDataJsonMatchesSpec = galaxyMinimalFixture satisfies GalaxyData
