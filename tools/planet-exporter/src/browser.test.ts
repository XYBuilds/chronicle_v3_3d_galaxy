import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { ExportArgs } from './args.js'
import { metadataFor, parseVisualDiagnostics, type BrowserRender } from './browser.js'
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

const visualDiagnostics = {
  movie_id: 157336,
  genres: ['Drama'],
  rating: 5,
  band_count: 1,
  world_radius: 0.01,
  outer_radius: 0.01,
  size_root: 3,
  padding: 0.08,
  emission: 0.33,
  fixed_lightness: 0.55,
  fixed_chroma: 0.15,
  key_light: { enabled: true, direction: [0.7, 0.7, -0.14], intensity: 1, flat_shading_mix: 0.8 },
  noise: { seed: 123, scale: 2.35, octaves: 4, persistence: 0.52 },
  rotation: { base_quaternion: [0, 0, 0, 1], seeded_spin_axis_world: [0, 1, 0], revs_per_sec: 0.01 },
  camera: { projection: 'orthographic', position: [0, 0, -20], quaternion: [0, 1, 0, 0], direction: [0, 0, 1], left: -10, right: 10, top: 10, bottom: -10, near: 0.01, far: 40 },
}

const render: BrowserRender = {
  png: Buffer.from('png'),
  dataVersion: 'fixture-v1',
  webglRenderer: 'fixture-gpu',
  visualHash,
  visualDiagnostics,
  chromiumVersion: 'fixture-chromium',
}

describe('visual diagnostics parser', () => {
  it('accepts a complete finite diagnostics snapshot', () => {
    expect(parseVisualDiagnostics(JSON.stringify(visualDiagnostics))).toEqual(visualDiagnostics)
  })

  it.each([
    ['missing rotation', { ...visualDiagnostics, rotation: undefined }],
    ['null nested object', { ...visualDiagnostics, key_light: null }],
    ['null numeric value', { ...visualDiagnostics, emission: null }],
    [
      'invalid quaternion tuple',
      {
        ...visualDiagnostics,
        rotation: { ...visualDiagnostics.rotation, base_quaternion: [0, 0, 1] },
      },
    ],
    ['invalid movie id', { ...visualDiagnostics, movie_id: 0 }],
    ['invalid size root', { ...visualDiagnostics, size_root: 5 }],
    ['invalid padding', { ...visualDiagnostics, padding: 0.5 }],
    ['outer radius below world radius', { ...visualDiagnostics, outer_radius: 0.001 }],
    ['invalid band count', { ...visualDiagnostics, band_count: 9 }],
    [
      'invalid noise seed',
      { ...visualDiagnostics, noise: { ...visualDiagnostics.noise, seed: -1 } },
    ],
    [
      'invalid noise octaves',
      { ...visualDiagnostics, noise: { ...visualDiagnostics.noise, octaves: 0 } },
    ],
    [
      'invalid camera frustum',
      { ...visualDiagnostics, camera: { ...visualDiagnostics.camera, far: 0.001 } },
    ],
  ])('rejects %s', (_label, candidate) => {
    expect(() => parseVisualDiagnostics(JSON.stringify(candidate))).toThrow(/visual diagnostics/)
  })

  it('rejects malformed JSON', () => {
    expect(() => parseVisualDiagnostics('{')).toThrow('invalid visual diagnostics JSON')
  })
})

describe('browser render metadata', () => {
  it('SHA-256 hashes the exact page-supplied complete visual configuration and PNG', () => {
    const metadata = metadataFor(args, source, render, 'fixture-commit')
    const expected = createHash('sha256').update(visualHash).digest('hex')
    const expectedPng = createHash('sha256').update(render.png).digest('hex')

    expect(metadata.visual_config_hash).toBe(expected)
    expect(metadata.visual_config_hash).not.toBe(visualHash)
    expect(metadata.png_sha256).toBe(expectedPng)
  })

  it('persists the page-supplied renderer diagnostics without recreating visual values', () => {
    const metadata = metadataFor(args, source, render, 'fixture-commit')

    expect(metadata.visual_diagnostics).toBe(visualDiagnostics)
    expect(metadata.visual_diagnostics).toMatchObject({
      rating: 5,
      emission: 0.33,
      fixed_lightness: 0.55,
      fixed_chroma: 0.15,
      key_light: { intensity: 1 },
      noise: { seed: 123 },
      rotation: { base_quaternion: [0, 0, 0, 1], seeded_spin_axis_world: [0, 1, 0], revs_per_sec: 0.01 },
      camera: { projection: 'orthographic', position: [0, 0, -20] },
    })
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
