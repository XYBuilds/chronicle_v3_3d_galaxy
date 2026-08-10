import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { ExportArgs } from './args.js'
import { chooseDataSource } from './data-source.js'
import { renderP3910BloomStrengthZeroInBrowser } from './p3910BloomStrengthZero.js'

const root = path.resolve(import.meta.dirname, '../../..')
const fixture = path.resolve(import.meta.dirname, '../fixtures/galaxy.minimal.json')
const temporaryDirectories: string[] = []

async function p3910Fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'p3910-strength-zero-'))
  temporaryDirectories.push(directory)
  const source = await readFile(fixture, 'utf8')
  const output = path.join(directory, 'galaxy.p3910.minimal.json')
  await writeFile(output, source.replace('"id": 1', '"id": 157336'), 'utf8')
  return output
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const args: ExportArgs = {
  movieId: 157336,
  output: path.join(process.cwd(), 'unused.png'),
  resolution: 128,
  padding: 0.08,
  bloom: 'on',
  sizeRoot: 3,
  renderMode: 'shader',
}

describe('P39.10 strength-zero Vite entry', () => {
  it('serves a dedicated page with the historical Bloom-zero evidence contract', async () => {
    const renderArgs = { ...args, dataFile: await p3910Fixture() }
    const source = await chooseDataSource(renderArgs, path.join(root, 'frontend/public/data/galaxy_assets_manifest.json'))
    const render = await renderP3910BloomStrengthZeroInBrowser(renderArgs, source, root)
    const bloom = render.visualDiagnostics.bloom as Record<string, unknown>
    const payload = render.visualDiagnostics.visual_config_payload as Record<string, unknown>
    const compatibility = render.visualDiagnostics.legacy_compatibility as Record<string, unknown>
    const derivation = render.visualDiagnostics.emission_derivation as Record<string, unknown>
    const snapshot = render.visualDiagnostics.renderer_snapshot as Record<string, unknown>

    expect(render.png.byteLength).toBeGreaterThan(0)
    expect(bloom).toMatchObject({ enabled: true, strength: 0, radius: 1, threshold: 0 })
    expect(compatibility).toMatchObject({
      proof: 'p39.11-frozen-profile-fixture',
      evidenceIdentity: 'p39.10-bloom-on-strength-zero-pure-delta-v1',
    })
    expect(compatibility.historicalVisualHash).toContain('p39.10-bloom-on-strength-zero-pure-delta-v1')
    expect(payload.legacy_compatibility).toEqual(compatibility)
    expect(derivation).toMatchObject({
      kind: 'legacy-power',
      modelVersion: 'vote-average-power-clamped-v1',
      exponent: 2,
    })
    expect(snapshot).toMatchObject({
      canonicalHashInput: render.visualHash,
      profileSource: 'legacy-fallback',
      legacyCompatibility: compatibility,
      emissionDerivation: derivation,
      emission: render.visualDiagnostics.emission,
      bloom: { enabled: true, strength: 0, radius: 1, threshold: 0 },
    })
  }, 120_000)
})