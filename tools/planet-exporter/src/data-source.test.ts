import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExportArgs } from './args.js'
import { chooseDataSource, outputMetadataPath, pageDataUrl } from './data-source.js'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-data-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

const baseArgs: ExportArgs = {
  movieId: 1,
  output: 'planet.png',
  resolution: 64,
  padding: 0.08,
  bloom: 'off',
}

describe('planet export data sources', () => {
  it('uses data-file before data-url and manifest', async () => {
    const directory = await temporaryDirectory()
    const dataFile = path.join(directory, 'fixture.json')
    const manifest = path.join(directory, 'manifest.json')
    await fs.writeFile(dataFile, '{"fixture":true}')
    await fs.writeFile(manifest, JSON.stringify({ galaxy_data_gzip_url: 'https://example.test/manifest.json.gz' }))

    const source = await chooseDataSource({
      ...baseArgs,
      dataFile,
      dataUrl: 'https://example.test/explicit.json.gz',
    }, manifest)

    expect(source.kind).toBe('file')
    expect(source.bytes?.toString()).toBe('{"fixture":true}')
    expect(pageDataUrl('http://127.0.0.1:4173/', source)).toBe('http://127.0.0.1:4173/__planet_export_data.json.gz')
  })

  it('uses data-url before reading the manifest', async () => {
    const source = await chooseDataSource({ ...baseArgs, dataUrl: 'https://example.test/explicit.json.gz' }, 'missing.json')
    expect(source).toMatchObject({
      kind: 'url',
      label: 'https://example.test/explicit.json.gz',
      pageUrl: 'https://example.test/explicit.json.gz',
    })
  })

  it('loads the versioned manifest fallback', async () => {
    const directory = await temporaryDirectory()
    const manifest = path.join(directory, 'manifest.json')
    await fs.writeFile(manifest, JSON.stringify({
      galaxy_data_gzip_url: 'https://example.test/versioned.json.gz',
      version: 'fixture-v1',
    }))

    await expect(chooseDataSource(baseArgs, manifest)).resolves.toMatchObject({
      kind: 'manifest',
      version: 'fixture-v1',
      pageUrl: 'https://example.test/versioned.json.gz',
    })
  })

  it('derives the metadata sidecar path from the absolute PNG path', () => {
    expect(outputMetadataPath(path.join('relative', 'planet.png'))).toBe(`${path.resolve('relative', 'planet.png')}.render.json`)
  })
})