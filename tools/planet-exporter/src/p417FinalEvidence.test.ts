import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT,
  PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
} from '../../../frontend/src/three/productionFocusEmissionProfile.js'
import { PLANET_VISUAL_DEFAULTS } from '../../../frontend/src/three/planetVisualDefaults.js'

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { scripts: Record<string, string> }

describe('P41.7 final evidence generator contract', () => {
  it('exposes the production evidence command at the approved 3000px human-Gate resolution surface', () => {
    expect(packageJson.scripts['evidence:p41.7']).toBe('tsx scripts/generate-p417-final-evidence.ts')
    expect(packageJson.scripts['evidence:p41.7']).not.toContain('phase41Diagnostic')
  })

  it('binds every generated artifact to the approved production CDF/LUT and visual defaults', () => {
    expect(PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.modelVersion).toBe('rating-midrank-cdf-lut-v1')
    expect(PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE).not.toMatchObject({
      modelVersion: 'vote-average-anchored-smoothstep-v1',
    })
    expect(PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT).toMatchObject({
      interpolation: 'linear',
      curveSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(PLANET_VISUAL_DEFAULTS.focus.bloom.composition).toBe('pure-bloom-delta-v1')
    expect(createHash('sha256').update(PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE.samples.join(',')).digest('hex')).toEqual(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    )
  })
})
