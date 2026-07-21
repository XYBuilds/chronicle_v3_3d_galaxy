import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const script = readFileSync(fileURLToPath(new URL('../scripts/generate-p417-final-evidence.ts', import.meta.url)), 'utf8')

describe('P41.7 final evidence generator contract', () => {
  it('renders only normal production exports at the 3000px human-Gate resolution', () => {
    expect(script).toContain('const productionGateResolution = 3000')
    expect(script).toContain("const command = 'npm run evidence:p41.7 -w planet-exporter'")
    expect(script).toContain('renderInBrowser(args, source, root)')
    expect(script).not.toContain('renderPhase41DiagnosticInBrowser')
    expect(script).toContain('diagnostic_override: null')
  })

  it('binds every generated artifact to the approved production CDF/LUT and visual hash', () => {
    expect(script).toContain('PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE')
    expect(script).toContain('PRODUCTION_FOCUS_EMISSION_CDF_LUT_CONTRACT')
    expect(script).toContain('productionEmissionDiagnostics(diagnostics, renderedRating)')
    expect(script).toContain('production_visual_config_sha256')
    expect(script).toContain('raw_png_resolution')
    expect(script).not.toContain('vote-average-anchored-smoothstep-v1')
  })
})