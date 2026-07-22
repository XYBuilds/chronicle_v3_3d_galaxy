import { describe, expect, it } from 'vitest'

import { LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE } from '@/three/focusEmission'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '@/three/productionFocusEmissionProfile'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import { parsePlanetExportRequest } from './request'
import { parsePhase41DiagnosticRequest, resolvePhase41DiagnosticRequest } from './phase41DiagnosticRequest'
import {
  PHASE41_DIAGNOSTIC_MARKER,
  assertPhase41MatrixTransition,
  assertPhase41RatingRow,
  parsePhase41DiagnosticOverride,
  phase41EmissionForRating,
  resolvePhase41VisualProfile,
  type Phase41MatrixSnapshot,
} from './phase41DiagnosticProfile'
import { resolvePlanetVisualConfig } from './visualConfig'

const request = `?movieId=7&dataUrl=https%3A%2F%2Fexample.test%2Fgalaxy_data.json.gz&resolution=300&padding=0.08&bloom=off&renderMode=shader`

const legacyEmission = {
  curve: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
  provenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  source: 'legacy-fallback' as const,
}

const canonicalEmission = {
  curve: legacyEmission.curve,
  emissionProvenance: legacyEmission.provenance,
  emissionSource: legacyEmission.source,
}

function snapshot(
  rating: number,
  emission: number,
  override?: Parameters<typeof resolvePhase41VisualProfile>[0],
): Phase41MatrixSnapshot {
  return {
    rating,
    emission,
    profile: resolvePhase41VisualProfile(override, true, legacyEmission),
    camera: { position: [0, 0, -20] },
    seed: 7,
    rotation: [0, 0, 0, 1],
  }
}

describe('Phase 41 diagnostic profile', () => {
  it('rejects profile fields and markers at the normal production request boundary', () => {
    expect(() => parsePlanetExportRequest(`${request}&diagnostic_only=${PHASE41_DIAGNOSTIC_MARKER}`)).toThrow(/unknown request parameter/)
    expect(() => parsePlanetExportRequest(`${request}&profile=%7B%7D`)).toThrow(/unknown request parameter/)
    expect(() => parsePlanetExportRequest(`${request}&bloomStrength=0`)).toThrow(/unknown request parameter/)
  })

  it('requires the marker and rejects unknown, non-finite, malformed, and unsafe values', () => {
    expect(() => parsePhase41DiagnosticRequest(request)).toThrow(/diagnostic_only/)
    expect(() => parsePhase41DiagnosticRequest(`${request}&diagnostic_only=wrong`)).toThrow(/diagnostic_only/)
    expect(() => parsePhase41DiagnosticRequest(`${request}&diagnostic_only=${PHASE41_DIAGNOSTIC_MARKER}&profile={}&profile={}`)).toThrow(/profile must appear at most once/)
    expect(() => parsePhase41DiagnosticOverride({ diagnostic_only: PHASE41_DIAGNOSTIC_MARKER })).toThrow(/must declare at least one visual field/)
    expect(parsePhase41DiagnosticOverride({ diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, flatShadingMix: 0.5 }).flatShadingMix).toBe(0.5)
    expect(() => parsePhase41DiagnosticOverride({ diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, direction: [0, 0, 0] })).toThrow(/zero vector/)
    expect(() => parsePhase41DiagnosticOverride({ diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, direction: [0, 0] })).toThrow(/3-vector/)
    expect(() => parsePhase41DiagnosticOverride({ diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, bloom: { enabled: true, strength: Number.NaN, radius: 1, threshold: 0 } })).toThrow(/finite/)
    expect(() => parsePhase41DiagnosticOverride({ diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, emissionCurve: { modelVersion: 'vote-average-anchored-smoothstep-v1', ratingLowAnchor: 8, ratingHighAnchor: 4, intensityMin: 0, intensityMax: 1 } })).toThrow(/ratingLowAnchor/)
    expect(() => parsePhase41DiagnosticOverride({ diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, emissionCurve: { modelVersion: 'vote-average-power-clamped-v1', exponent: 2, intensityMin: 2, intensityMax: 1 } })).toThrow(/unknown field/)
    expect(() => parsePhase41DiagnosticRequest(`${request}&diagnostic_only=${PHASE41_DIAGNOSTIC_MARKER}&profile=${encodeURIComponent(JSON.stringify({ diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, bloom: { enabled: true, strength: 0.01, radius: 1, threshold: 0 } }))}`)).toThrow(/bloom.enabled/)
  })

  it('uses the approved CDF/LUT production model and matches the resolved Bloom state across all three surfaces', () => {
    const production = resolvePhase41VisualProfile(undefined, true, legacyEmission)
    const diagnostic = resolvePhase41DiagnosticRequest(parsePhase41DiagnosticRequest(`${request}&diagnostic_only=${PHASE41_DIAGNOSTIC_MARKER}`), legacyEmission)
    const normalExporter = resolvePlanetVisualConfig({ ...canonicalEmission, bloomEnabled: false })
    expect(legacyEmission.curve).toMatchObject({
      modelVersion: 'rating-midrank-cdf-lut-v1', ratingMin: 0, ratingMax: 10, sampleStep: 0.05, intensityMin: 0.005, intensityMax: 0.65,
    })
    expect(PLANET_VISUAL_DEFAULTS.focus.emissionTuning).toEqual({ exponent: 3, intensityMin: 0.005, intensityMax: 0.66 })
    expect(PLANET_VISUAL_DEFAULTS.focus.lightness).toBe(0.66)
    expect(PLANET_VISUAL_DEFAULTS.lighting).toMatchObject({
      keyLightIntensity: 10,
      flatShadingMix: 1,
      direction: [0.700665949127905, 0.4003805423588029, 0.5905612999792342],
    })
    expect(PLANET_VISUAL_DEFAULTS.focus.bloom).toMatchObject({ strength: 1, radius: 1, threshold: 10 })
    expect(production.flatShadingMix).toBe(PLANET_VISUAL_DEFAULTS.lighting.flatShadingMix)
    expect(legacyEmission.curve.samples).toHaveLength(201)
    expect(production.curve).toEqual(legacyEmission.curve)
    expect(production.overrideProvenance).toBe('none')
    expect(production.resolvedVisualConfigInput).toBe(resolvePlanetVisualConfig({ ...canonicalEmission, bloomEnabled: true }).hashInput)
    expect(diagnostic.resolvedVisualConfigInput).toBe(resolvePlanetVisualConfig({ ...canonicalEmission, bloomEnabled: false }).hashInput)
    expect(diagnostic.resolvedVisualConfigInput).toBe(normalExporter.hashInput)
    expect(diagnostic.bloom.enabled).toBe(false)
    expect(resolvePlanetVisualConfig({ ...canonicalEmission, bloomEnabled: true }).hashInput).not.toBe(resolvePlanetVisualConfig({ ...canonicalEmission, bloomEnabled: false }).hashInput)
  })

  it.each([
    ['lightness', { lightness: 0.5 }],
    ['key light', { keyLightIntensity: 2 }],
    ['direction', { direction: [0, 1, 0] as [number, number, number] }],
    ['flat shaping', { flatShadingMix: 0.5 }],
    ['Bloom', { bloom: { enabled: true, strength: 0, radius: 1, threshold: 0 } }],
  ])('makes a Phase 41 %s override change the canonical renderer identity', (_name, override) => {
    const baseline = resolvePhase41VisualProfile(undefined, true, legacyEmission)
    const changed = resolvePhase41VisualProfile({ diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, ...override }, true, legacyEmission)
    expect(changed.resolvedVisualConfigInput).not.toBe(baseline.resolvedVisualConfigInput)
    expect(changed.visualConfig.hashInput).toBe(changed.resolvedVisualConfigInput)
  })

  it('keeps historical smoothstep and alternate CDF profiles isolated behind the diagnostic marker', () => {
    const curve = parsePhase41DiagnosticOverride({
      diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
      emissionCurve: { modelVersion: 'vote-average-anchored-smoothstep-v1', ratingLowAnchor: 4.5, ratingHighAnchor: 8.2, intensityMin: 0.005, intensityMax: 0.65 },
    }).emissionCurve!
    expect(phase41EmissionForRating(4.5, curve)).toBe(0.005)
    expect(phase41EmissionForRating(8.2, curve)).toBe(0.65)
    expect(resolvePhase41VisualProfile({ diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, emissionCurve: curve }, true, legacyEmission).overrideProvenance).toBe('phase41-diagnostic-override')
    expect(legacyEmission.curve.modelVersion).toBe('rating-midrank-cdf-lut-v1')
  })

  it('accepts an isolated CDF/LUT diagnostic profile without replacing production defaults', () => {
    const lut = Array.from({ length: 201 }, (_, index) => 0.005 + index / 200 * 0.645)
    const profile = parsePhase41DiagnosticOverride({
      diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
      emissionCurve: { modelVersion: 'rating-midrank-cdf-lut-v1', ratingMin: 0, ratingMax: 10, sampleStep: 0.05, samples: lut, intensityMin: 0.005, intensityMax: 0.65 },
    }).emissionCurve!
    expect(profile.modelVersion).toBe('rating-midrank-cdf-lut-v1')
    expect(phase41EmissionForRating(6.0, profile)).toBe(lut[120])
    expect(legacyEmission.curve.modelVersion).toBe('rating-midrank-cdf-lut-v1')
  })
  it('permits declared override variables without freezing the canonical resolved hash across candidates', () => {
    const baseline = snapshot(4.5, 0.1)
    const rating = snapshot(5.5, 0.2)
    const key = snapshot(4.5, 0.1, { diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, keyLightIntensity: 2 })
    const bloom = snapshot(4.5, 0.1, { diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, bloom: { enabled: true, strength: 0, radius: 1, threshold: 0 } })
    const flat = snapshot(4.5, 0.1, { diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, flatShadingMix: 0.5 })

    expect(() => assertPhase41RatingRow(baseline, rating)).not.toThrow()
    for (const [candidate, variable] of [[key, 'keyLightIntensity'], [bloom, 'bloom'], [flat, 'flatShadingMix']] as const) {
      expect(candidate.profile.visualConfig.hashInput).not.toBe(baseline.profile.visualConfig.hashInput)
      expect(candidate.profile.productionVisualConfigInput).toBe(candidate.profile.visualConfig.hashInput)
      expect(candidate.profile.resolvedVisualConfigInput).toBe(candidate.profile.visualConfig.hashInput)
      expect(() => assertPhase41MatrixTransition(baseline, candidate, [variable])).not.toThrow()
    }
    expect(() => assertPhase41MatrixTransition(baseline, bloom, ['rating'])).toThrow(/undeclared variable bloom/)
    expect(() => assertPhase41RatingRow(baseline, { ...rating, camera: { position: [1, 0, -20] } })).toThrow(/undeclared variable camera/)
    expect(() => assertPhase41MatrixTransition(baseline, { ...baseline, profile: { ...baseline.profile, chroma: 0.2 } }, ['rating'])).toThrow(/fixed production field/)
    expect(() => assertPhase41MatrixTransition(baseline, rating, [])).toThrow(/declare one or more unique/)
    expect(() => assertPhase41RatingRow(baseline, { ...baseline })).toThrow(/must change both/)
  })
})