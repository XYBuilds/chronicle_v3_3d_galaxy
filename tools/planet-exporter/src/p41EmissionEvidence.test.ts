import { describe, expect, it } from 'vitest'

import {
  P41_EMISSION_BLOOM_OFF,
  P41_EMISSION_CURVE,
  P41_EMISSION_FIXED_PROFILE,
  P41_EMISSION_FIXTURE_ROWS,
  assertP41EmissionCurveInvariants,
  assertP41EmissionEvidenceContract,
  profileWithoutRatingAndEmission,
} from './p41EmissionEvidence.js'
import { PHASE41_CONTROLLED_RATINGS } from './phase41Baseline.js'

describe('P41.5 emission evidence contract', () => {
  it('freezes required matrix axes and approved Bloom-OFF shaping', () => {
    assertP41EmissionEvidenceContract()
    expect(PHASE41_CONTROLLED_RATINGS).toEqual([4, 4.5, 5.5, 6.5, 7.5, 8.2, 9.5])
    expect(P41_EMISSION_FIXTURE_ROWS).toContain('high-rating-low-votes')
    expect(P41_EMISSION_BLOOM_OFF.enabled).toBe(false)
    expect(P41_EMISSION_FIXED_PROFILE).toMatchObject({ lightness: 0.66, keyLightIntensity: 0.45, flatShadingMix: 0.8 })
  })

  it('rejects curve drift and leaves only declared row variables comparable', () => {
    expect(() => assertP41EmissionCurveInvariants({ ...P41_EMISSION_CURVE, ratingHighAnchor: 8.3 })).toThrow('anchors must be 4.5/8.2')
    expect(profileWithoutRatingAndEmission({ rating: 4.5, emission: 0.005, camera: 'fixed' })).toEqual({ camera: 'fixed' })
  })
})