import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { run } from './cli.js'
import { inspectPng } from './png.js'

const temporaryDirectories: string[] = []
const crossEntryBaseline = JSON.parse(
  await fs.readFile(path.resolve(import.meta.dirname, '../fixtures/cross-entry-chromium-baseline.json'), 'utf8'),
) as {
  schema_version: string
  movie_id: number
  resolution: number
  padding: number
  render_mode: string
  blooms: Record<string, {
    png_sha256: string
    visual_config_hash: string
    renderer_snapshot: {
      emission: number
      profileEmission: number
      bloom: { enabled: boolean; strength: number; radius: number; threshold: number }
      profileSource: string
    }
  }>
}

function captureIo(): {
  io: Pick<typeof process, 'stdout' | 'stderr'>
  stdout: () => string
} {
  let stdout = ''
  return {
    io: {
      stdout: { write: (chunk: string | Uint8Array) => { stdout += String(chunk); return true } } as NodeJS.WriteStream,
      stderr: { write: () => true } as NodeJS.WriteStream,
    },
    stdout: () => stdout,
  }
}

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe('Playwright Chromium planet export', () => {
  it('exports Bloom OFF/ON shader and 3000px basic safe transparent PNGs', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-browser-'))
    temporaryDirectories.push(directory)
    const fixture = path.resolve(import.meta.dirname, '../fixtures/galaxy.minimal.json')

    for (const { renderMode, resolution, padding, bloom } of [
      { renderMode: 'shader', resolution: 128, padding: 0.35, bloom: 'off' },
      { renderMode: 'shader', resolution: 128, padding: 0.35, bloom: 'on' },
      { renderMode: 'basic', resolution: 3000, padding: 0.08, bloom: 'off' },
    ] as const) {
      const output = path.join(directory, `planet-${renderMode}-${bloom}.png`)
      const capture = captureIo()
      const exitCode = await run([
        '--movie-id', '1',
        '--output', output,
        '--resolution', String(resolution),
        '--padding', String(padding),
        '--bloom', bloom,
        '--render-mode', renderMode,
        '--data-file', fixture,
      ], capture.io)

      expect(exitCode).toBe(0)
      expect(capture.stdout().trimEnd().split('\n')).toHaveLength(1)
      expect(JSON.parse(capture.stdout())).toEqual({
        output,
        metadata: `${output}.render.json`,
        tmdb_id: 1,
      })

      const inspection = inspectPng(await fs.readFile(output))
      expect(inspection).toMatchObject({ width: resolution, height: resolution, colorType: 6 })
      expect(inspection.alphaPixels).toBeGreaterThan(0)
      expect(inspection.alphaPixels).toBeLessThan(resolution * resolution)
      expect(inspection.bounds).not.toBeNull()
      expect(inspection.bounds?.left).toBeGreaterThan(0)
      expect(inspection.bounds?.top).toBeGreaterThan(0)
      expect(inspection.bounds?.right).toBeLessThan(resolution - 1)
      expect(inspection.bounds?.bottom).toBeLessThan(resolution - 1)

      const metadata = JSON.parse(await fs.readFile(`${output}.render.json`, 'utf8')) as Record<string, unknown>
      expect(metadata).toMatchObject({
        tmdb_id: 1,
        data_version: 'planet-export-fixture-v1',
        resolution,
        padding,
        bloom,
        render_mode: renderMode,
      })
      expect(metadata.chromium_version).toEqual(expect.any(String))
      expect(metadata.webgl_renderer).toEqual(expect.any(String))
      const resolved = metadata.resolved_visual_config as {
        visual: { focus: { bloom: Record<string, unknown> } }
      }
      const diagnostics = metadata.visual_diagnostics as {
        bloom: Record<string, unknown>
        profile_provenance: Record<string, unknown>
        renderer_snapshot: { bloom: Record<string, unknown>; profileSource: string }
      }
      const { composition, ...rendererBloom } = resolved.visual.focus.bloom
      expect(composition).toBe('pure-bloom-delta-v1')
      expect(diagnostics.bloom).toEqual(resolved.visual.focus.bloom)
      expect(diagnostics.renderer_snapshot.bloom).toEqual(rendererBloom)
      expect(diagnostics.renderer_snapshot.profileSource).toBe('active')
      expect(diagnostics.profile_provenance).toMatchObject({
        profile_id: 'planet-export-fixture-2026-08-a',
        source: 'active',
      })
    }
  }, 240_000)

  it('records distinct canonical Bloom identities in real Chromium exports', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-browser-bloom-identity-'))
    temporaryDirectories.push(directory)
    const fixture = path.resolve(import.meta.dirname, '../fixtures/galaxy.minimal.json')
    const outputs = {
      off: path.join(directory, 'off.png'),
      on: path.join(directory, 'on.png'),
    } as const

    for (const [bloom, output] of Object.entries(outputs)) {
      expect(await run([
        '--movie-id', '1', '--output', output, '--resolution', '128', '--padding', '0.35', '--bloom', bloom, '--render-mode', 'shader', '--data-file', fixture,
      ])).toBe(0)
    }

    const offMetadata = JSON.parse(await fs.readFile(`${outputs.off}.render.json`, 'utf8')) as Record<string, unknown>
    const onMetadata = JSON.parse(await fs.readFile(`${outputs.on}.render.json`, 'utf8')) as Record<string, unknown>
    expect(offMetadata.visual_config_hash).not.toBe(onMetadata.visual_config_hash)
    for (const [enabled, metadata] of [[false, offMetadata], [true, onMetadata]] as const) {
      const resolved = metadata.resolved_visual_config as {
        visual: { focus: { bloom: { enabled: boolean } } }
      }
      const diagnostics = metadata.visual_diagnostics as {
        bloom: { enabled: boolean }
        renderer_snapshot: { bloom: { enabled: boolean }; profileSource: string }
      }
      expect(resolved.visual.focus.bloom.enabled).toBe(enabled)
      expect(diagnostics.bloom.enabled).toBe(enabled)
      expect(diagnostics.renderer_snapshot.bloom.enabled).toBe(enabled)
      expect(diagnostics.renderer_snapshot.profileSource).toBe('active')
    }
  }, 120_000)

  it('locks canonical PNG/metadata baselines to the applied renderer snapshot', async () => {
    expect(crossEntryBaseline.schema_version).toBe('planet-export-cross-entry-baseline-v1')
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-cross-entry-baseline-'))
    temporaryDirectories.push(directory)
    const fixture = path.resolve(import.meta.dirname, '../fixtures/galaxy.minimal.json')

    for (const bloom of ['off', 'on'] as const) {
      const expected = crossEntryBaseline.blooms[bloom]!
      const output = path.join(directory, `baseline-${bloom}.png`)
      expect(await run([
        '--movie-id', String(crossEntryBaseline.movie_id),
        '--output', output,
        '--resolution', String(crossEntryBaseline.resolution),
        '--padding', String(crossEntryBaseline.padding),
        '--bloom', bloom,
        '--render-mode', crossEntryBaseline.render_mode,
        '--data-file', fixture,
      ])).toBe(0)

      const png = await fs.readFile(output)
      const metadata = JSON.parse(await fs.readFile(`${output}.render.json`, 'utf8')) as {
        visual_config_hash: string
        png_sha256: string
        visual_diagnostics: {
          visual_config_hash_input: string
          renderer_snapshot: {
            emission: number
            profileEmission: number
            bloom: { enabled: boolean; strength: number; radius: number; threshold: number }
            profileSource: string
            canonicalHashInput: string
          }
        }
      }

      expect(createHash('sha256').update(png).digest('hex')).toBe(expected.png_sha256)
      expect(metadata.png_sha256).toBe(expected.png_sha256)
      expect(metadata.visual_config_hash).toBe(expected.visual_config_hash)
      expect(metadata.visual_diagnostics.renderer_snapshot).toMatchObject(expected.renderer_snapshot)
      expect(metadata.visual_diagnostics.renderer_snapshot.canonicalHashInput).toBe(
        metadata.visual_diagnostics.visual_config_hash_input,
      )
      expect(createHash('sha256').update(metadata.visual_diagnostics.visual_config_hash_input).digest('hex'))
        .toBe(metadata.visual_config_hash)
      expect(metadata.visual_diagnostics.renderer_snapshot.emission).not.toBe(
        metadata.visual_diagnostics.renderer_snapshot.profileEmission,
      )
    }

    expect(crossEntryBaseline.blooms.off!.visual_config_hash).not.toBe(
      crossEntryBaseline.blooms.on!.visual_config_hash,
    )
  }, 120_000)

  it('rejects normal CLI diagnostic Bloom parameters before browser startup', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-browser-diagnostic-reject-'))
    temporaryDirectories.push(directory)
    const output = path.join(directory, 'rejected.png')

    expect(await run([
      '--movie-id', '1', '--output', output, '--resolution', '128', '--bloom', 'on', '--bloom-strength', '0', '--render-mode', 'shader',
    ])).toBe(2)
    await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('classifies an unknown movie as a data failure without artifacts', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-browser-failure-'))
    temporaryDirectories.push(directory)
    const fixture = path.resolve(import.meta.dirname, '../fixtures/galaxy.minimal.json')
    const output = path.join(directory, 'missing.png')
    const capture = captureIo()

    const exitCode = await run([
      '--movie-id', '999',
      '--output', output,
      '--resolution', '64',
      '--data-file', fixture,
    ], capture.io)

    expect(exitCode).toBe(3)
    expect(capture.stdout()).toBe('')
    await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.stat(`${output}.render.json`)).rejects.toMatchObject({ code: 'ENOENT' })
  }, 120_000)
})