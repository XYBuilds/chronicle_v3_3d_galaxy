import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExportArgs } from './args.js'
import { chooseDataSource, isLegacyProfileCompatibilityFixture, outputMetadataPath, pageDataUrl } from './data-source.js'

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

  it('treats every explicit file source as a legacy compatibility fixture, never a URL source', async () => {
    const directory = await temporaryDirectory()
    const dataFile = path.join(directory, 'fixture.json')
    await fs.writeFile(dataFile, '{"fixture":true}')

    const chosenFile = await chooseDataSource({ ...baseArgs, dataFile }, path.join(directory, 'missing-manifest.json'))
    expect(isLegacyProfileCompatibilityFixture(chosenFile)).toBe(true)
    expect(isLegacyProfileCompatibilityFixture({ kind: 'file', label: 'historical fixture', bytes: Buffer.from('{}') })).toBe(true)
    expect(isLegacyProfileCompatibilityFixture({ kind: 'url', label: 'https://example.test/data.json.gz', pageUrl: 'https://example.test/data.json.gz' })).toBe(false)
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
      focus_emission_profile: {
        profile_id: 'rating-emission-2026-07-a', period: '2026-07', model_version: 'rating-midrank-cdf-lut-v1',
        curve_sha256: 'a'.repeat(64), source_data_version: 'fixture-v1', source_movie_count: 1,
        status: 'active', activated_at: '2026-07-22T00:00:00.000Z',
      },
    }))

    await expect(chooseDataSource(baseArgs, manifest)).resolves.toMatchObject({
      kind: 'manifest',
      version: 'fixture-v1',
      pageUrl: 'https://example.test/versioned.json.gz',
    })
  })


  it.each([
    ['missing pointer', undefined],
    ['unknown pointer field', { profile_id: 'rating-emission-2026-07-a', period: '2026-07', model_version: 'rating-midrank-cdf-lut-v1', curve_sha256: 'a'.repeat(64), source_data_version: 'fixture-v1', source_movie_count: 1, status: 'active', activated_at: '2026-07-22T00:00:00.000Z', extra: true }],
    ['invalid activation time', { profile_id: 'rating-emission-2026-07-a', period: '2026-07', model_version: 'rating-midrank-cdf-lut-v1', curve_sha256: 'a'.repeat(64), source_data_version: 'fixture-v1', source_movie_count: 1, status: 'active', activated_at: 'not-an-iso-time' }],
  ])('fails closed for manifest %s', async (_label, focus_emission_profile) => {
    const directory = await temporaryDirectory()
    const manifest = path.join(directory, 'manifest.json')
    await fs.writeFile(manifest, JSON.stringify({ galaxy_data_gzip_url: 'https://example.test/versioned.json.gz', focus_emission_profile }))
    await expect(chooseDataSource(baseArgs, manifest)).rejects.toThrow(/focus_emission_profile/)
  })
  it('derives the metadata sidecar path from the absolute PNG path', () => {
    expect(outputMetadataPath(path.join('relative', 'planet.png'))).toBe(`${path.resolve('relative', 'planet.png')}.render.json`)
  })
})