import { describe, expect, it } from 'vitest'

import {
  deriveMeetsTargetMatrix,
  deriveRecommendedMode,
  deriveVerdictPre,
  detectBrowserFamily,
  detectOsFamily,
  resolveMatrixRow,
} from './hdrCapabilities'

describe('hdrCapabilities matrix helpers', () => {
  it('detects browser families from UA', () => {
    expect(detectBrowserFamily('Mozilla/5.0 Edg/120.0')).toBe('edge')
    expect(detectBrowserFamily('Mozilla/5.0 Chrome/120.0 Safari/537.36')).toBe('chrome')
    expect(detectBrowserFamily('Mozilla/5.0 Firefox/121.0')).toBe('firefox')
    expect(
      detectBrowserFamily(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      ),
    ).toBe('safari')
  })

  it('detects OS families from UA', () => {
    expect(detectOsFamily('Windows NT 10.0')).toBe('windows')
    expect(detectOsFamily('Macintosh; Intel Mac OS X')).toBe('macos')
  })

  it('maps SDR display to matrix row 7 blocked', () => {
    const row = resolveMatrixRow({
      browser: 'chrome',
      os: 'windows',
      displayHdr: 'sdr',
      apiPath: 'webgl2-srgb',
      webgpuExtendedToneMapping: false,
    })
    expect(row).toBe(7)
    expect(deriveVerdictPre(
      {
        browser: 'chrome',
        os: 'windows',
        displayHdr: 'sdr',
        apiPath: 'webgl2-srgb',
        webgpuExtendedToneMapping: false,
      },
      row,
    )).toBe('blocked')
  })

  it('maps production WebGL2 on Win+Chrome to row 4 fallback-sdr', () => {
    const input = {
      browser: 'chrome' as const,
      os: 'windows' as const,
      displayHdr: 'hdr' as const,
      apiPath: 'webgl2-srgb' as const,
      webgpuExtendedToneMapping: false as const,
    }
    expect(resolveMatrixRow(input)).toBe(4)
    expect(deriveVerdictPre(input, 4)).toBe('fallback-sdr')
    expect(deriveMeetsTargetMatrix(4, false)).toBe(false)
    expect(deriveRecommendedMode(false, 'webgl2-srgb')).toBe('sdr')
  })

  it('maps WebGPU extended P0 row 1 experimental when probe succeeds', () => {
    const input = {
      browser: 'chrome' as const,
      os: 'windows' as const,
      displayHdr: 'hdr' as const,
      apiPath: 'webgpu-extended' as const,
      webgpuExtendedToneMapping: true as const,
    }
    expect(resolveMatrixRow(input)).toBe(1)
    expect(deriveVerdictPre(input, 1)).toBe('experimental')
    expect(deriveMeetsTargetMatrix(1, true)).toBe(true)
    expect(deriveRecommendedMode(true, 'webgl2-srgb')).toBe('hdr-capable')
  })

  it('flags bloom-only path as matrix row 11 blocked', () => {
    const row = resolveMatrixRow({
      browser: 'chrome',
      os: 'windows',
      displayHdr: 'hdr',
      apiPath: 'webgl2-srgb',
      webgpuExtendedToneMapping: false,
      postFxBloomEnabled: true,
    })
    expect(row).toBe(11)
  })
})
