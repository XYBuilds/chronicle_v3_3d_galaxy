import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { ExportArgs } from './args.js'
import { chooseDataSource } from './data-source.js'
import { renderPhase41DiagnosticInBrowser } from './phase41Diagnostic.js'

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
    const source = await chooseDataSource(args, path.join(root, 'frontend/public/data/galaxy_assets_manifest.json'))
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
    expect(render.visualDiagnostics.visual_config_payload).toEqual(expect.any(Object))
  }, 120_000)
})