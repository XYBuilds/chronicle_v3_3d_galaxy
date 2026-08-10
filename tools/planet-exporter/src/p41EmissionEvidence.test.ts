import { describe, expect, it } from 'vitest'

import {
  RATING_MIDRANK_CDF_LUT_INTENSITY_MAX,
  RATING_MIDRANK_CDF_LUT_INTENSITY_MIN,
  RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT,
  RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
  generateRatingMidrankCdfLutProfile,
} from '../../../frontend/src/three/focusEmission.js'

import {
  P41_EMISSION_ALLOWED_VARIATION_FIELDS,
  P41_EMISSION_AUTHORITATIVE_DATA,
  P41_EMISSION_BLOOM_OFF,
  P41_EMISSION_CURVE,
  P41_EMISSION_FIXED_PROFILE,
  P41_EMISSION_FIXTURE_ROWS,
  P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE,
  P41_EMISSION_HISTORICAL_CURVE,
  P41_EMISSION_MIDRANK_CDF_LUT_DIAGNOSTIC_CANDIDATE,
  P41_PRODUCTION_EMISSION_PROFILE,
  P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS,
  P41_MIDRANK_CDF_LUT_EVIDENCE_RELATIVE_DIRECTORY,
  assertP41EmissionCurveInvariants,
  assertP41EmissionEvidenceContract,
  assertP41EmissionRatingOnlyVariation,
  assertP41MidrankCdfLutEvidenceManifest,
  createP41MidrankCdfLutEvidenceManifest,
  profileWithoutRatingAndEmission,
  serializeP41MidrankCdfLutEvidenceManifest,
} from './p41EmissionEvidence.js'
import { PHASE41_CONTROLLED_RATINGS } from './phase41Baseline.js'
import { PLANET_VISUAL_DEFAULTS } from '../../../frontend/src/three/planetVisualDefaults.js'
import {
  PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT,
  PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
} from '../../../frontend/src/three/productionFocusEmissionProfile.js'


function fixtureLutProfile() {
  return generateRatingMidrankCdfLutProfile([4, 5.5, 6, 6, 6.5, 7.5, 8.5])
}

const FIXTURE_GIT_COMMIT = 'a'.repeat(40)

describe('P41.5 emission evidence contract', () => {
  it('freezes required matrix axes and approved Bloom-OFF shaping', () => {
    assertP41EmissionEvidenceContract()
    expect(PHASE41_CONTROLLED_RATINGS).toEqual([4, 4.5, 5.5, 6.5, 7.5, 8.2, 9.5])
    expect(P41_MIDRANK_CDF_LUT_CONTROLLED_RATINGS).toEqual([4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.2, 9.5])
    expect(P41_MIDRANK_CDF_LUT_EVIDENCE_RELATIVE_DIRECTORY).toBe('data/runs/phase41/p41.5-midrank-cdf-lut-bloom-off')
    expect(P41_EMISSION_FIXTURE_ROWS).toContain('high-rating-low-votes')
    expect(P41_EMISSION_BLOOM_OFF.enabled).toBe(false)
    expect(P41_EMISSION_FIXED_PROFILE).toMatchObject({
      lightness: PLANET_VISUAL_DEFAULTS.focus.lightness,
      keyLightIntensity: PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity,
      flatShadingMix: PLANET_VISUAL_DEFAULTS.lighting.flatShadingMix,
    })
  })

  it('embeds the human-approved CDF/LUT production profile without a gzip runtime dependency', () => {
    expect(P41_PRODUCTION_EMISSION_PROFILE).toEqual(PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE)
    expect(P41_EMISSION_CURVE).toEqual(PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE)
    expect(P41_PRODUCTION_EMISSION_PROFILE).toMatchObject({
      modelVersion: 'rating-midrank-cdf-lut-v1', ratingMin: 0, ratingMax: 10, sampleStep: 0.05, intensityMin: 0.005, intensityMax: 0.65,
    })
    expect(P41_PRODUCTION_EMISSION_PROFILE.samples).toHaveLength(201)
    expect(PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT).toMatchObject({
      profileManifest: 'data/runs/phase41/p41.5-midrank-cdf-lut-bloom-off/profile.manifest.json',
      curveSha256: 'd3c434c9ccb4e2e520edc4d5a8e1cb7a2d7842d42800cd225ab6482fbaa91d6d',
      interpolation: 'linear',
      authoritativeData: P41_EMISSION_AUTHORITATIVE_DATA,
    })
  })
  it('pins the historical baseline and records the CDF/LUT promotion separately from its diagnostic provenance', () => {
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
      curveModelVersion: 'rating-midrank-cdf-lut-v1',
      status: 'historical-evidence-promoted-to-production',
      scope: 'p41.5-diagnostic-provenance',
      productionProfileId: 'rating-midrank-cdf-lut-v1',
      diagnosticOverride: {
        requiredMarker: 'phase41-visual-diagnostic-v1',
        productionDefaults: 'isolated',
      },
      ratingMin: 0,
      ratingMax: 10,
      lut: { sampleStep: 0.05, sampleCount: 201, interpolation: 'linear' },
      intensityMin: 0.005,
      intensityMax: 0.65,
    })
    expect(P41_EMISSION_ALLOWED_VARIATION_FIELDS).toEqual(['rating', 'emission'])
    expect(P41_PRODUCTION_EMISSION_PROFILE.modelVersion).toBe('rating-midrank-cdf-lut-v1')
  })

  it('creates a byte-stable manifest that binds the LUT, source, fixed profile, and hashes', () => {
    const first = createP41MidrankCdfLutEvidenceManifest(fixtureLutProfile(), FIXTURE_GIT_COMMIT)
    const second = createP41MidrankCdfLutEvidenceManifest(fixtureLutProfile(), FIXTURE_GIT_COMMIT)

    assertP41MidrankCdfLutEvidenceManifest(first)
    assertP41MidrankCdfLutEvidenceManifest(JSON.parse(serializeP41MidrankCdfLutEvidenceManifest(first)))
    expect(serializeP41MidrankCdfLutEvidenceManifest(first)).toBe(serializeP41MidrankCdfLutEvidenceManifest(second))
    expect(first).toMatchObject({
      candidateId: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
      authoritativeData: P41_EMISSION_AUTHORITATIVE_DATA,
      movieCount: 61531,
      gitCommit: FIXTURE_GIT_COMMIT,
      curve: {
        modelVersion: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
        sampleStep: RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
        intensityMin: RATING_MIDRANK_CDF_LUT_INTENSITY_MIN,
        intensityMax: RATING_MIDRANK_CDF_LUT_INTENSITY_MAX,
      },
      fixedProfile: P41_EMISSION_FIXED_PROFILE,
    })
    expect(first.curve.samples).toHaveLength(RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT)
    expect(first.hashes).toEqual({
      authoritativeDataSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      curveSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      fixedProfileSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('rejects invalid fixed-profile, source, LUT, and hash drift before evidence generation', () => {
    const manifest = createP41MidrankCdfLutEvidenceManifest(fixtureLutProfile(), FIXTURE_GIT_COMMIT)

    expect(() => assertP41MidrankCdfLutEvidenceManifest({
      ...manifest,
      fixedProfile: { ...manifest.fixedProfile, bloom: { ...manifest.fixedProfile.bloom, enabled: true } },
    })).toThrow(/fixed visual profile|Bloom OFF/)
    expect(() => assertP41MidrankCdfLutEvidenceManifest({
      ...manifest,
      movieCount: manifest.movieCount + 1,
    })).toThrow(/movie count/)
    expect(() => assertP41MidrankCdfLutEvidenceManifest({
      ...manifest,
      gitCommit: 'not-a-commit',
    })).toThrow(/Git commit/)
    expect(() => assertP41MidrankCdfLutEvidenceManifest({
      ...manifest,
      curve: { ...manifest.curve, samples: manifest.curve.samples.slice(1) },
    })).toThrow(/samples length/)
    expect(() => assertP41MidrankCdfLutEvidenceManifest({
      ...manifest,
      hashes: { ...manifest.hashes, curveSha256: '0'.repeat(64) },
    })).toThrow(/curve hash/)
  })

  it('permits only declared rating and emission matrix variation', () => {
    const baseline = { rating: 5, emission: 0.1, bloom: P41_EMISSION_BLOOM_OFF, seed: 42, camera: 'fixed' }
    const candidate = { ...baseline, rating: 6, emission: 0.2 }

    expect(() => assertP41EmissionRatingOnlyVariation(baseline, candidate)).not.toThrow()
    expect(() => assertP41EmissionRatingOnlyVariation(baseline, { ...candidate, camera: 'moved' })).toThrow(/undeclared variation in camera/)
    expect(() => assertP41EmissionRatingOnlyVariation(baseline, { ...candidate, bloom: { ...P41_EMISSION_BLOOM_OFF, enabled: true } })).toThrow(/undeclared variation in bloom/)
  })

  it('keeps the P41.5 smoothstep evidence entry explicitly bound to the historical curve', () => {
    expect(P41_EMISSION_HISTORICAL_CURVE.modelVersion).toBe('vote-average-anchored-smoothstep-v1')
    expect(P41_EMISSION_HISTORICAL_CURVE).not.toEqual(PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE)
    expect(P41_EMISSION_HISTORICAL_BASELINE_CANDIDATE).toMatchObject({
      status: 'candidate-no-go',
      evidenceDirectory: 'data/runs/phase41/p41.5-emission-curve-bloom-off',
    })
  })

  it('rejects a production LUT profile drift and leaves only declared row variables comparable', () => {
    expect(() => assertP41EmissionCurveInvariants({ ...P41_EMISSION_CURVE, samples: P41_EMISSION_CURVE.samples.slice(1) })).toThrow(/samples length|production LUT/)
    expect(profileWithoutRatingAndEmission({ rating: 4.5, emission: 0.005, camera: 'fixed' })).toEqual({ camera: 'fixed' })
  })
})