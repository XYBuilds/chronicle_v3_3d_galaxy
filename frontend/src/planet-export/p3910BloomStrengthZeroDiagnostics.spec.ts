import { describe, expect, it, vi } from 'vitest'

vi.mock('@/three/shaders/perlin.frag.glsl', () => ({ default: '' }))
vi.mock('@/three/shaders/perlin.vert.glsl', () => ({ default: '' }))

import { parsePlanetExportRequest } from './request'
import {
  P3910_BLOOM_STRENGTH_ZERO_PARAM,
  p3910BloomStrengthZeroParams,
  p3910BloomStrengthZeroVisualConfigInput,
  p3910ProductionVisualConfigInput,
  parseP3910BloomStrengthZeroRequest,
} from './p3910BloomStrengthZeroDiagnostics'

const base = '?movieId=157336&dataUrl=https%3A%2F%2Fexample.test%2Fgalaxy_data.json.gz&resolution=300&padding=0.08&bloom=on&sizeRoot=3&renderMode=shader'

describe('P39.10 strength-zero diagnostics request', () => {
  it('keeps the fixed zero override at its dedicated URL boundary', () => {
    const request = parseP3910BloomStrengthZeroRequest(`${base}&${P3910_BLOOM_STRENGTH_ZERO_PARAM}=0`)
    expect(request.bloomStrengthZero).toBe(0)
    expect(p3910BloomStrengthZeroParams()).toEqual({ enabled: true, strength: 0, radius: 1, threshold: 0 })
    expect(() => parsePlanetExportRequest(`${base}&${P3910_BLOOM_STRENGTH_ZERO_PARAM}=0`)).toThrow(/unknown request parameter/)
    expect(() => parseP3910BloomStrengthZeroRequest(`${base}&${P3910_BLOOM_STRENGTH_ZERO_PARAM}=0&${P3910_BLOOM_STRENGTH_ZERO_PARAM}=0`)).toThrow(/exactly once/)
  })

  it('keeps the strength-zero input separate from the production visual input', () => {
    const production = p3910ProductionVisualConfigInput(3)
    const diagnostic = p3910BloomStrengthZeroVisualConfigInput(production)
    expect(diagnostic).toContain('p39.10-bloom-on-strength-zero-pure-delta-v1')
    expect(diagnostic).toContain('"strength":0')
    const parsed = JSON.parse(diagnostic) as { productionVisualConfig: string; bloom: { strength: number } }
    expect(parsed.productionVisualConfig).toBe(production)
    expect(parsed.bloom.strength).toBe(0)
  })
})