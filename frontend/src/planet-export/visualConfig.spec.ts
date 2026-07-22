import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE } from '@/three/focusEmission'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '@/three/productionFocusEmissionProfile'
import { resolvePlanetVisualConfig } from './visualConfig'

const emission = {
  curve: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
  emissionProvenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  emissionSource: 'legacy-fallback' as const,
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
})