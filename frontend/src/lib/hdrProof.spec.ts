import { describe, expect, it } from 'vitest'

import {
  HDR_PROOF_CANDIDATE_LINEAR,
  HDR_PROOF_SDR_REFERENCE_LINEAR,
  interpretHdrProofComparison,
  type HdrProofComparison,
} from './hdrProof'

const sample = (leftMax: number, rightMax: number) => ({
  left: [leftMax, leftMax, leftMax] as [number, number, number],
  right: [rightMax, rightMax, rightMax] as [number, number, number],
  rightToLeftRatio: rightMax / leftMax,
})

describe('hdrProof interpretHdrProofComparison', () => {
  it('exports locked linear reference and candidate constants', () => {
    expect(HDR_PROOF_SDR_REFERENCE_LINEAR).toBe(1)
    expect(HDR_PROOF_CANDIDATE_LINEAR).toBe(4)
  })

  it('returns extended-unavailable when configure fails', () => {
    const comparison: HdrProofComparison = {
      extended: null,
      standard: null,
      extendedConfigureOk: false,
    }
    const r = interpretHdrProofComparison(comparison)
    expect(r.verdict).toBe('extended-unavailable')
    expect(r.meetsD1Proof).toBe(false)
  })

  it('passes D1 when extended shows headroom and standard clamps', () => {
    const comparison: HdrProofComparison = {
      extended: { ...sample(0.5, 0.65), rightToLeftRatio: 1.3 },
      standard: { ...sample(0.95, 0.97), rightToLeftRatio: 1.02 },
      extendedConfigureOk: true,
    }
    const r = interpretHdrProofComparison(comparison)
    expect(r.verdict).toBe('hdr-output-likely')
    expect(r.meetsD1Proof).toBe(true)
  })

  it('fails D1 when both modes collapse separation', () => {
    const comparison: HdrProofComparison = {
      extended: sample(0.95, 0.96),
      standard: sample(0.95, 0.96),
      extendedConfigureOk: true,
    }
    const r = interpretHdrProofComparison(comparison)
    expect(r.verdict).toBe('sdr-clamped')
    expect(r.meetsD1Proof).toBe(false)
  })
})
