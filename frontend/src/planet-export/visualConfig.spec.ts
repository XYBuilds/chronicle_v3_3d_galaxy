import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE } from '@/three/focusEmission'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '@/three/productionFocusEmissionProfile'
import {
  requireProductionPlanetVisualConfig,
  resolvePlanetVisualConfig,
} from './visualConfig'

const emission = {
  curve: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
  emissionProvenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  emissionSource: 'legacy-fallback' as const,
}

const activeEmission = {
  ...emission,
  emissionProvenance: {
    ...LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
    profile_id: 'rating-emission-2026-08-exporter-test',
  },
  emissionSource: 'active' as const,
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

describe('canonical resolved planet visual configuration', () => {
  it('is stable for the same resolved values and includes the curve and provenance', () => {
    const first = resolvePlanetVisualConfig({ ...emission, bloomEnabled: true })
    const second = resolvePlanetVisualConfig({ ...emission, bloomEnabled: true })

    expect(first.hashInput).toBe(second.hashInput)
    expect(sha256(first.hashInput)).toBe(sha256(second.hashInput))
    expect(first.payload.emission_profile).toEqual({ ...LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE, source: 'legacy-fallback' })
    expect(first.payload.visual).toMatchObject({
      focus: { emission: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE, bloom: { enabled: true } },
      lighting: { keyLightIntensity: 10, flatShadingMix: 1 },
    })
  })

  it.each([
    ['lightness', { lightness: 0.5 }],
    ['key light', { keyLightIntensity: 2 }],
    ['direction', { direction: [0, 1, 0] as [number, number, number] }],
    ['flat shaping', { flatShadingMix: 0.5 }],
    ['Bloom', { bloomEnabled: false }],
  ])('changes hash when %s changes', (_name, override) => {
    const baseline = resolvePlanetVisualConfig({ ...emission, bloomEnabled: true })
    const changed = resolvePlanetVisualConfig({ ...emission, bloomEnabled: true, ...override })
    expect(changed.hashInput).not.toBe(baseline.hashInput)
  })

  it('does not choose a production profile when a caller has not resolved one', () => {
    expect(() => resolvePlanetVisualConfig({
      bloomEnabled: true,
      emissionProvenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
      emissionSource: 'legacy-fallback',
    } as never)).toThrow()
  })

  it('requires an intact active canonical state at the production boundary', () => {
    const config = resolvePlanetVisualConfig({ ...activeEmission, bloomEnabled: true })

    expect(requireProductionPlanetVisualConfig(config)).toBe(config)
    expect(() => requireProductionPlanetVisualConfig(
      { ...config, hashInput: `${config.hashInput}tampered` },
    )).toThrow(/identity is inconsistent/)
    expect(() => requireProductionPlanetVisualConfig(
      { ...config, emissionProvenance: { ...config.emissionProvenance, profile_id: 'different-active-profile' } },
    )).toThrow(/provenance|identity/)
  })

  it('rejects legacy and diagnostic states from the production boundary', () => {
    const legacy = resolvePlanetVisualConfig({ ...emission, bloomEnabled: false })
    const diagnostic = resolvePlanetVisualConfig({
      ...activeEmission,
      emissionSource: 'diagnostic-override',
      overrideProvenance: 'phase41-diagnostic-override',
      bloomEnabled: false,
    })

    expect(() => requireProductionPlanetVisualConfig(legacy)).toThrow(/active emission profile/)
    expect(() => requireProductionPlanetVisualConfig(diagnostic)).toThrow(/active emission profile|diagnostic overrides/)
    expect(() => requireProductionPlanetVisualConfig(undefined as never)).toThrow(/canonical resolved visual config/)
  })
})