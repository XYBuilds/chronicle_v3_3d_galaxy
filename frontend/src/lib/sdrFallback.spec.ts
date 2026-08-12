import { describe, expect, it } from 'vitest'

import type { HdrCapabilitiesReport } from './hdrCapabilities'
import { buildSdrProductionPolicy, deriveFallbackReason } from './sdrFallback'

function baseReport(overrides: Partial<HdrCapabilitiesReport> = {}): HdrCapabilitiesReport {
  return {
    webgl2: true,
    outputColorSpace: 'srgb',
    canvasHdrSupported: false,
    dynamicRangeHigh: false,
    colorGamut: 'srgb',
    webgpuAvailable: true,
    webgpuExtendedToneMapping: false,
    browser: 'chrome',
    os: 'windows',
    osHdr: 'unknown',
    displayHdr: 'sdr',
    apiPath: 'webgl2-srgb',
    matrixRow: 7,
    verdictPre: 'blocked',
    meetsTargetMatrix: false,
    recommendedMode: 'sdr',
    userAgent: 'test',
    probedAt: '2026-01-01T00:00:00.000Z',
    notes: [],
    ...overrides,
  }
}

describe('sdrFallback deriveFallbackReason', () => {
  it('maps SDR display blocked row to hdr-blocked-matrix', () => {
    expect(deriveFallbackReason(baseReport())).toBe('hdr-blocked-matrix')
  })

  it('maps P0 hdr-capable stack to awaiting-phase33', () => {
    expect(
      deriveFallbackReason(
        baseReport({
          displayHdr: 'hdr',
          matrixRow: 1,
          verdictPre: 'experimental',
          meetsTargetMatrix: true,
          recommendedMode: 'hdr-capable',
          webgpuExtendedToneMapping: true,
        }),
      ),
    ).toBe('hdr-capable-awaiting-phase33')
  })

  it('maps experimental without meetsTarget to hdr-experimental-not-shipped', () => {
    expect(
      deriveFallbackReason(
        baseReport({
          displayHdr: 'hdr',
          matrixRow: 8,
          verdictPre: 'experimental',
          meetsTargetMatrix: false,
          recommendedMode: 'sdr',
        }),
      ),
    ).toBe('hdr-experimental-not-shipped')
  })
})

describe('sdrFallback buildSdrProductionPolicy', () => {
  it('always locks galaxy to webgl2-srgb-direct with bloom off', () => {
    const policy = buildSdrProductionPolicy(baseReport())
    expect(policy.galaxyRenderPath).toBe('webgl2-srgb-direct')
    expect(policy.bloomEnabled).toBe(false)
    expect(policy.outputColorSpace).toBe('srgb')
    expect(policy).not.toHaveProperty('hdrProofOverlayIsolated')
  })

  it('preserves matrix metadata for gate reports', () => {
    const policy = buildSdrProductionPolicy(
      baseReport({
        matrixRow: 4,
        verdictPre: 'fallback-sdr',
      }),
    )
    expect(policy.matrixRow).toBe(4)
    expect(policy.verdictPre).toBe('fallback-sdr')
    expect(policy.fallbackReason).toBe('production-default')
  })
})
