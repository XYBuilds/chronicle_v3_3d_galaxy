import { describe, expect, it } from 'vitest'

import {
  P416_BLOOM_CANDIDATE,
  P416_BLOOM_CANDIDATE_ID,
  P416_BLOOM_CANDIDATES,
  P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY,
  P416_BLOOM_OFF,
  P416_BLOOM_ON,
  P416_BLOOM_V1_CANDIDATE,
  P416_BLOOM_V2_THRESHOLD_CANDIDATE,
  P416_BLOOM_V3_CONTRAST_CANDIDATE,
  assertP416EvidenceContract,
  assertP416PairOnlyBloomVariation,
  measureP416BloomPair,
  validateP416BloomParams,
} from './p416BloomEvidence.js'

function image(rgb: number): { data: Uint8Array; width: number; height: number } {
  const width = 32
  const height = 32
  const data = new Uint8Array(width * height * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgb
    data[index + 1] = rgb
    data[index + 2] = rgb
    data[index + 3] = 255
  }
  return { data, width, height }
}

const shared = {
  authoritative_data: 'gzip-sha', fixture: 'seed-low', movie_id: 1, camera: { left: -1, right: 1 }, seed: 1,
  rotation: [0, 0, 0, 1], lightness: 0.66, key_light: 0.45, direction: [0.7, 0.4, 0.59],
  flat_shading_mix: 0.8, rating: 6.5, emission: 0.2, curve: 'rating-midrank-cdf-lut-v1',
}

describe('P41.6 Bloom evidence contract', () => {
  it('preserves v1 as the unqualified backward-compatible reproduction candidate', () => {
    expect(() => assertP416EvidenceContract()).not.toThrow()
    expect(P416_BLOOM_CANDIDATE).toBe(P416_BLOOM_V1_CANDIDATE)
    expect(P416_BLOOM_CANDIDATE_ID).toBe(P416_BLOOM_V1_CANDIDATE.candidateId)
    expect(P416_BLOOM_EVIDENCE_RELATIVE_DIRECTORY).toBe(P416_BLOOM_V1_CANDIDATE.evidenceDirectory)
    expect(P416_BLOOM_OFF).toBe(P416_BLOOM_V1_CANDIDATE.bloomOff)
    expect(P416_BLOOM_ON).toBe(P416_BLOOM_V1_CANDIDATE.bloomOn)
    expect(P416_BLOOM_CANDIDATES.v1).toBe(P416_BLOOM_V1_CANDIDATE)
    expect(P416_BLOOM_CANDIDATES['v2-threshold']).toBe(P416_BLOOM_V2_THRESHOLD_CANDIDATE)
    expect(P416_BLOOM_CANDIDATES['v3-contrast']).toBe(P416_BLOOM_V3_CONTRAST_CANDIDATE)
    expect(validateP416BloomParams(P416_BLOOM_OFF, 'off')).toEqual(P416_BLOOM_OFF)
    expect(validateP416BloomParams(P416_BLOOM_ON, 'on')).toEqual(P416_BLOOM_ON)
  })

  it('keeps the v2 thresholded candidate distinct from v1 and explicitly suppresses dark inputs', () => {
    expect(P416_BLOOM_V2_THRESHOLD_CANDIDATE.candidateId).not.toBe(P416_BLOOM_V1_CANDIDATE.candidateId)
    expect(P416_BLOOM_V2_THRESHOLD_CANDIDATE.evidenceDirectory).not.toBe(P416_BLOOM_V1_CANDIDATE.evidenceDirectory)
    expect(P416_BLOOM_V2_THRESHOLD_CANDIDATE.bloomOn).toMatchObject({ enabled: true, threshold: 0.2, strength: 0.025, radius: 0.35 })
    expect(P416_BLOOM_V2_THRESHOLD_CANDIDATE.bloomOn.threshold).toBeGreaterThan(0)
  })

  it('keeps v3 as an isolated brighter-highlight candidate than v2', () => {
    expect(P416_BLOOM_V3_CONTRAST_CANDIDATE.candidateId).not.toBe(P416_BLOOM_V1_CANDIDATE.candidateId)
    expect(P416_BLOOM_V3_CONTRAST_CANDIDATE.candidateId).not.toBe(P416_BLOOM_V2_THRESHOLD_CANDIDATE.candidateId)
    expect(P416_BLOOM_V3_CONTRAST_CANDIDATE.evidenceDirectory).toBe('data/runs/phase41/p41.6-bloom-integration-v3-contrast')
    expect(P416_BLOOM_V3_CONTRAST_CANDIDATE.evidenceDirectory).not.toBe(P416_BLOOM_V1_CANDIDATE.evidenceDirectory)
    expect(P416_BLOOM_V3_CONTRAST_CANDIDATE.evidenceDirectory).not.toBe(P416_BLOOM_V2_THRESHOLD_CANDIDATE.evidenceDirectory)
    expect(P416_BLOOM_V3_CONTRAST_CANDIDATE.bloomOn).toMatchObject({ enabled: true, threshold: 0.3, strength: 0.03, radius: 0.2 })
    expect(P416_BLOOM_V3_CONTRAST_CANDIDATE.bloomOn.threshold).toBeGreaterThan(P416_BLOOM_V2_THRESHOLD_CANDIDATE.bloomOn.threshold)
  })
  it('rejects non-finite and out-of-range Bloom candidates before rendering', () => {
    expect(() => validateP416BloomParams({ ...P416_BLOOM_ON, threshold: Number.NaN }, 'on')).toThrow(/finite/)
    expect(() => validateP416BloomParams({ ...P416_BLOOM_ON, radius: 1.01 }, 'on')).toThrow(/\[0, 1\]/)
    expect(() => validateP416BloomParams({ ...P416_BLOOM_ON, strength: -1 }, 'on')).toThrow(/>= 0/)
  })

  it('records core, saturation, and halo measurements for a valid pair', () => {
    const stats = measureP416BloomPair(image(100), image(102))
    expect(stats.core.on_to_off_mean_luma_ratio).toBeCloseTo(1.02, 8)
    expect(stats.halo_bounds).toMatchObject({ x_min: 0, y_min: 0, pixels: 1024 })
    expect(stats.on_saturated_ratio).toBeGreaterThanOrEqual(0)
  })

  it('permits only the declared Bloom profile to differ in an OFF/ON pair', () => {
    expect(() => assertP416PairOnlyBloomVariation({ ...shared, bloom: P416_BLOOM_OFF }, { ...shared, bloom: P416_BLOOM_ON })).not.toThrow()
    expect(() => assertP416PairOnlyBloomVariation({ ...shared, bloom: P416_BLOOM_OFF }, { ...shared, bloom: P416_BLOOM_ON, camera: { left: -2, right: 2 } })).toThrow(/camera/)
  })
})