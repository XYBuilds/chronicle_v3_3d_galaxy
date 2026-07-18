import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { ExportArgs } from './args.js'
import { metadataFor, type BrowserRender } from './browser.js'
import type { DataSource } from './data-source.js'

const args: ExportArgs = {
  movieId: 157336,
  output: '/tmp/planet.png',
  resolution: 3000,
  padding: 0.08,
  bloom: 'on',
  sizeRoot: 3,
  renderMode: 'shader',
}

const source: DataSource = { kind: 'url', label: 'https://example.test/galaxy_data.json.gz', version: 'fixture-v1' }

const visualHash = JSON.stringify({
  planet: JSON.stringify({
    schemaVersion: 3,
    focus: { emission: { modelVersion: 'vote-average-linear-clamped-v1', intensityMin: 0.06, intensityMax: 0.6 } },
    lighting: { keyLightIntensity: 1 },
    color: { pipelineVersion: 'oklch-local-base-linear-emission-fixed-key-single-srgb-v1' },
  }),
  exportSizeRoot: 3,
  supportedExportSizeRoots: [2, 3, 4],
})

const render: BrowserRender = {
  png: Buffer.from('png'),
  dataVersion: 'fixture-v1',
  webglRenderer: 'fixture-gpu',
  visualHash,
  chromiumVersion: 'fixture-chromium',
}

describe('browser render metadata', () => {
  it('SHA-256 hashes the exact page-supplied complete visual configuration', () => {
    const metadata = metadataFor(args, source, render, 'fixture-commit')
    const expected = createHash('sha256').update(visualHash).digest('hex')

    expect(metadata.visual_config_hash).toBe(expected)
    expect(metadata.visual_config_hash).not.toBe(visualHash)
  })

  it('does not rebuild the visual hash from exporter bloom or render-mode arguments', () => {
    const shaderMetadata = metadataFor(args, source, render, 'fixture-commit')
    const basicMetadata = metadataFor(
      { ...args, bloom: 'off', renderMode: 'basic' },
      source,
      render,
      'fixture-commit',
    )

    expect(basicMetadata.visual_config_hash).toBe(shaderMetadata.visual_config_hash)
    expect(shaderMetadata.visual_config_hash).toBe(createHash('sha256').update(visualHash).digest('hex'))
  })
})
