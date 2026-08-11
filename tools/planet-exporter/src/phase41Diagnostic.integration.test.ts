import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { ExportArgs } from './args.js'
import { chooseDataSource } from './data-source.js'
import {
  PHASE41_DIAGNOSTIC_MARKER,
  renderPhase41DiagnosticInBrowser,
} from './phase41Diagnostic.js'

const root = path.resolve(import.meta.dirname, '../../..')
const fixture = path.resolve(import.meta.dirname, '../fixtures/galaxy.minimal.json')

const args: ExportArgs = {
  movieId: 1,
  output: path.join(process.cwd(), 'unused.png'),
  resolution: 128,
  padding: 0.08,
  bloom: 'off',
  sizeRoot: 3,
  renderMode: 'shader',
  dataFile: fixture,
}

describe('Phase 41 Vite diagnostic entry', () => {
  it('serves the isolated page and returns a self-consistent no-override sidecar', async () => {
    const source = await chooseDataSource(args)
    const render = await renderPhase41DiagnosticInBrowser(args, source, root)
    const profile = render.visualDiagnostics.phase41_resolved_profile as Record<string, unknown>
    const bloom = render.visualDiagnostics.bloom as Record<string, unknown>

    expect(render.png.byteLength).toBeGreaterThan(0)
    expect(profile.overrideProvenance).toBe('none')
    expect(profile.resolvedVisualConfigInput).toBe(render.visualHash)
    expect(profile.bloom).toEqual({
      enabled: bloom.enabled,
      strength: bloom.strength,
      radius: bloom.radius,
      threshold: bloom.threshold,
    })
    expect(render.visualDiagnostics.visual_config_hash_input).toBe(render.visualHash)
    expect(render.visualDiagnostics.visual_config_payload).toEqual(expect.objectContaining({
      diagnostic_marker: PHASE41_DIAGNOSTIC_MARKER,
    }))
    expect(render.visualDiagnostics.renderer_snapshot).toEqual(expect.objectContaining({
      canonicalHashInput: render.visualHash,
      diagnosticMarker: PHASE41_DIAGNOSTIC_MARKER,
      overrideProvenance: 'none',
    }))
  }, 120_000)

  it('routes marked overrides through canonical application and renderer readback', async () => {
    const source = await chooseDataSource(args)
    const render = await renderPhase41DiagnosticInBrowser(args, source, root, {
      diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
      lightness: 0.5,
      keyLightIntensity: 2,
      direction: [0, 1, 0],
      flatShadingMix: 0.25,
    })
    const profile = render.visualDiagnostics.phase41_resolved_profile as Record<string, unknown>
    const snapshot = render.visualDiagnostics.renderer_snapshot as Record<string, unknown>
    const focus = snapshot.focus as Record<string, unknown>
    const lighting = snapshot.lighting as Record<string, unknown>

    expect(profile.overrideProvenance).toBe('phase41-diagnostic-override')
    expect(profile.diagnosticMarker).toBe(PHASE41_DIAGNOSTIC_MARKER)
    expect(snapshot).toMatchObject({
      canonicalHashInput: render.visualHash,
      diagnosticMarker: PHASE41_DIAGNOSTIC_MARKER,
      overrideProvenance: 'phase41-diagnostic-override',
    })
    expect(focus.lightness).toBe(0.5)
    expect(lighting).toMatchObject({
      direction: [0, 1, 0],
      keyLightIntensity: 2,
      flatShadingMix: 0.25,
    })
    expect(render.visualDiagnostics.fixed_lightness).toBe(focus.lightness)
    expect((render.visualDiagnostics.key_light as Record<string, unknown>).intensity)
      .toBe(lighting.keyLightIntensity)
  }, 120_000)
})