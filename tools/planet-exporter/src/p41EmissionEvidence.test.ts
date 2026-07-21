import { describe, expect, it } from 'vitest'

import {
  P41_EMISSION_ALLOWED_VARIATION_FIELDS,
  P41_EMISSION_AUTHORITATIVE_DATA,
  P41_EMISSION_BLOOM_OFF,
  P41_EMISSION_CURVE,
  P41_EMISSION_FIXED_PROFILE,
  P41_EMISSION_FIXTURE_ROWS,
  P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE,
  P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE,
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

  it('pins the historical baseline and declares the diagnostic CDF/LUT boundary', () => {
    expect(P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE).toMatchObject({
      candidateId: 'anchored-smoothstep-historical-baseline',
      status: 'candidate-no-go',
      evidenceDirectory: 'data/runs/phase41/p41.5-emission-curve-bloom-off',
    })
    expect(P41_EMISSION_AUTHORITATIVE_DATA).toEqual({
      relativePath: 'frontend/public/data/galaxy_data.json.gz',
      sha256: 'eb15d597479f4f46792c440ae6478ddade9ba1bd95cc623d0dd135e680c60cad',
      dataVersion: '2026.07.18.daily.113',
      movieCount: 61531,
    })
    expect(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE).toMatchObject({
      candidateId: 'rating-midrank-cdf-lut-v1',
      status: 'declared-not-implemented',
      scope: 'diagnostic-only',
      ratingMin: 0,
      ratingMax: 10,
      lut: { sampleStep: 0.05, sampleCount: 201, interpolation: 'linear' },
      intensityMin: 0.005,
      intensityMax: 0.65,
    })
    expect(P41_EMISSION_ALLOWED_VARIATION_FIELDS).toEqual(['rating', 'emission'])
    expect(P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE.prohibitedUntilLaterPhase).toContain('production PLANET_VISUAL_DEFAULTS change')
  })

  it('rejects curve drift and leaves only declared row variables comparable', () => {
    expect(() => assertP41EmissionCurveInvariants({ ...P41_EMISSION_CURVE, ratingHighAnchor: 8.3 })).toThrow('anchors must be 4.5/8.2')
    expect(profileWithoutRatingAndEmission({ rating: 4.5, emission: 0.005, camera: 'fixed' })).toEqual({ camera: 'fixed' })
  })
})