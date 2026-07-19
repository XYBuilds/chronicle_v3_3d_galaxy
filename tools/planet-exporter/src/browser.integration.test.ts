import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'
import { assertPureBloomCore, BLOOM_CORE_PROOF } from './bloomProof.js'
import { run } from './cli.js'
import { inspectPng } from './png.js'

const temporaryDirectories: string[] = []

async function rgba(file: string): Promise<{ data: Buffer; width: number; height: number }> {
  const image = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (image.info.channels !== 4) throw new Error('expected RGBA PNG')
  return { data: image.data, width: image.info.width, height: image.info.height }
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
      expect(metadata.visual_diagnostics).toMatchObject({
        bloom: { enabled: bloom === 'on', composition: 'pure-bloom-delta-v1', strength: 0.01, radius: 1, threshold: 0 },
      })
    }
  }, 240_000)

  it('keeps a real Chromium nonzero Bloom core below the doubled-base regression while adding measurable light', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-browser-pure-bloom-'))
    temporaryDirectories.push(directory)
    const fixture = path.resolve(import.meta.dirname, '../fixtures/galaxy.minimal.json')
    const off = path.join(directory, 'off.png')
    const on = path.join(directory, 'on.png')

    for (const argv of [
      ['--movie-id', '1', '--output', off, '--resolution', '128', '--padding', '0.35', '--bloom', 'off', '--render-mode', 'shader', '--data-file', fixture],
      ['--movie-id', '1', '--output', on, '--resolution', '128', '--padding', '0.35', '--bloom', 'on', '--render-mode', 'shader', '--data-file', fixture],
    ]) {
      expect(await run(argv)).toBe(0)
    }

    const stats = assertPureBloomCore(await rgba(off), await rgba(on))
    expect(stats.on_to_off_mean_luma_ratio).toBeLessThanOrEqual(BLOOM_CORE_PROOF.maxOnToOffMeanLumaRatio)
    expect(stats.positive_luma_fraction).toBeGreaterThanOrEqual(BLOOM_CORE_PROOF.minPositiveCoreLumaFraction)
  }, 120_000)

  it('exports Bloom ON strength=0 with byte-identical visible RGB to Bloom OFF', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-browser-zero-bloom-'))
    temporaryDirectories.push(directory)
    const fixture = path.resolve(import.meta.dirname, '../fixtures/galaxy.minimal.json')
    const off = path.join(directory, 'off.png')
    const zero = path.join(directory, 'zero.png')

    for (const argv of [
      ['--movie-id', '1', '--output', off, '--resolution', '128', '--padding', '0.08', '--bloom', 'off', '--render-mode', 'shader', '--data-file', fixture],
      ['--movie-id', '1', '--output', zero, '--resolution', '128', '--padding', '0.08', '--bloom', 'on', '--bloom-strength', '0', '--render-mode', 'shader', '--data-file', fixture],
    ]) {
      expect(await run(argv)).toBe(0)
    }

    expect(await fs.readFile(zero)).toEqual(await fs.readFile(off))
    const metadata = JSON.parse(await fs.readFile(`${zero}.render.json`, 'utf8')) as { visual_diagnostics: { bloom: unknown } }
    expect(metadata.visual_diagnostics.bloom).toEqual({ enabled: true, composition: 'pure-bloom-delta-v1', strength: 0, radius: 1, threshold: 0 })
  }, 120_000)

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