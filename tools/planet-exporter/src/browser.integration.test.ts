import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { run } from './cli.js'
import { inspectPng } from './png.js'

const temporaryDirectories: string[] = []

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
  it('exports two safe transparent PNGs in sequence', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-browser-'))
    temporaryDirectories.push(directory)
    const fixture = path.resolve(import.meta.dirname, '../fixtures/galaxy.minimal.json')

    for (const sequence of [1, 2]) {
      const output = path.join(directory, `planet-${sequence}.png`)
      const capture = captureIo()
      const exitCode = await run([
        '--movie-id', '1',
        '--output', output,
        '--resolution', '128',
        '--padding', '0.08',
        '--bloom', 'off',
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
      expect(inspection).toMatchObject({ width: 128, height: 128, colorType: 6 })
      expect(inspection.alphaPixels).toBeGreaterThan(0)
      expect(inspection.alphaPixels).toBeLessThan(128 * 128)
      expect(inspection.bounds).not.toBeNull()
      expect(inspection.bounds?.left).toBeGreaterThan(0)
      expect(inspection.bounds?.top).toBeGreaterThan(0)
      expect(inspection.bounds?.right).toBeLessThan(127)
      expect(inspection.bounds?.bottom).toBeLessThan(127)

      const metadata = JSON.parse(await fs.readFile(`${output}.render.json`, 'utf8')) as Record<string, unknown>
      expect(metadata).toMatchObject({
        tmdb_id: 1,
        data_version: 'planet-export-fixture-v1',
        resolution: 128,
        padding: 0.08,
        bloom: 'off',
      })
      expect(metadata.chromium_version).toEqual(expect.any(String))
      expect(metadata.webgl_renderer).toEqual(expect.any(String))
    }
  }, 240_000)

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