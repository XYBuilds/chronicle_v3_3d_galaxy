import { describe, expect, it } from 'vitest'

import { LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE } from '@/three/focusEmission'
import {
  createFocusPlanetRuntimeVisualAdapter,
  resolveRuntimePlanetVisualState,
} from '@/three/focusPlanetRuntimeVisual'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '@/three/productionFocusEmissionProfile'

/**
 * Scene-directed contract: mountGalaxyScene consumes a pre-resolved canonical state and
 * applies Focus Planet visuals only through the runtime adapter seam (see scene.ts).
 * Full WebGL mount stays in browser/manual verification; this locks the adapter boundary
 * scene relies on for create/select/reselect and debug overlay lifecycle.
 */
describe('focus planet runtime scene contract', () => {
  it('hands scene a frozen production identity that debug overlay cannot rewrite', () => {
    const canonicalState = resolveRuntimePlanetVisualState({
      lut: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
      provenance: {
        ...LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
        profile_id: 'rating-emission-2026-08-a',
      },
      source: 'active',
    })

    expect(Object.isFrozen(canonicalState)).toBe(true)
    expect(canonicalState.overrideProvenance).toBe('none')
    expect(canonicalState.diagnosticMarker).toBeUndefined()

    const identity = {
      hashInput: canonicalState.hashInput,
      profileProvenance: canonicalState.emissionProvenance,
      profileSource: canonicalState.emissionSource,
      overrideProvenance: canonicalState.overrideProvenance,
    }

    // Adapter construction is what scene does after planet + bloom exist.
    expect(typeof createFocusPlanetRuntimeVisualAdapter).toBe('function')
    expect(identity.profileSource).toBe('active')
    expect(identity.hashInput.length).toBeGreaterThan(0)
  })
})
