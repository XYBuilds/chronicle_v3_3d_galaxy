import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportArgs } from './args.js'
import { chooseDataSource, outputMetadataPath, pageDataUrl, pageProfileUrl } from './data-source.js'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-data-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
  vi.unstubAllGlobals()
})

const pointer = {
  profile_id: 'rating-emission-2026-07-a',
  period: '2026-07',
  model_version: 'rating-midrank-cdf-lut-v1',
  curve_sha256: 'a'.repeat(64),
  source_data_version: 'fixture-v1',
  source_movie_count: 1,
  status: 'active' as const,
  activated_at: '2026-07-22T00:00:00.000Z',
}

const profileUrl = 'https://assets.example.test/galaxy/focus-emission-profiles/rating-emission-2026-07-a.json'
const manifestUrl = 'https://example.test/data/galaxy_assets_manifest.json'

const baseArgs: ExportArgs = {
  movieId: 1,
  output: 'planet.png',
  resolution: 64,
  padding: 0.08,
  bloom: 'off',
  sizeRoot: 3,
  renderMode: 'shader',
}

function productionManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    galaxy_data_gzip_url: 'https://assets.example.test/galaxy/releases/v1/galaxy_data.json.gz',
    data_version: 'fixture-v1',
    focus_emission_profile: pointer,
    focus_emission_profile_url: profileUrl,
    ...overrides,
  }
}

describe('planet export data sources', () => {
  it('uses explicit offline --data-file without consulting a tracked manifest', async () => {
    const directory = await temporaryDirectory()
    const dataFile = path.join(directory, 'fixture.json')
    await fs.writeFile(dataFile, '{"fixture":true}')

    const source = await chooseDataSource({ ...baseArgs, dataFile })

    expect(source.kind).toBe('file')
    expect(source.bytes?.toString()).toBe('{"fixture":true}')
    expect(source.focusEmissionProfile).toMatchObject({
      status: 'active',
      profile_id: 'planet-export-fixture-2026-08-a',
      source_data_version: 'planet-export-fixture-v1',
    })
    expect(source.profileBytes?.toString()).toContain('"schema_version":"rating-emission-profile-v1"')
    expect(pageDataUrl('http://127.0.0.1:4173/', source)).toBe('http://127.0.0.1:4173/__planet_export_data.json.gz')
  })

  it('routes fake-adapter immutable profile bytes only to their active profile path', () => {
    const source = {
      kind: 'manifest' as const, label: 'local fake adapter', bytes: Buffer.from('{}'), profileBytes: Buffer.from('{}'),
      focusEmissionProfile: {
        profile_id: 'rating-emission-2026-07-a', period: '2026-07', model_version: 'rating-midrank-cdf-lut-v1',
        curve_sha256: 'a'.repeat(64), source_data_version: 'fixture-v1', source_movie_count: 1,
        status: 'active' as const, activated_at: '2026-07-22T00:00:00.000Z',
      },
      profileUrl: 'https://assets.example.test/galaxy/focus-emission-profiles/rating-emission-2026-07-a.json',
    }
    expect(pageProfileUrl('http://127.0.0.1:4173/', source)).toBe('http://127.0.0.1:4173/__planet_export_profile/focus-emission-profiles/rating-emission-2026-07-a.json')
  })

  it('loads and validates an explicit production --manifest-url', async () => {
    const body = JSON.stringify(productionManifest())
    const fetchText = vi.fn(async () => body)

    await expect(chooseDataSource({ ...baseArgs, manifestUrl }, { fetchText })).resolves.toMatchObject({
      kind: 'manifest',
      label: manifestUrl,
      pageUrl: 'https://assets.example.test/galaxy/releases/v1/galaxy_data.json.gz',
      version: 'fixture-v1',
      focusEmissionProfile: pointer,
      profileUrl,
      manifestUrl,
    })
    expect(fetchText).toHaveBeenCalledWith(manifestUrl)
  })

  it('rejects production manifests that omit required release fields', async () => {
    await expect(chooseDataSource(
      { ...baseArgs, manifestUrl },
      { fetchText: async () => JSON.stringify(productionManifest({ data_version: undefined })) },
    )).rejects.toThrow(/data_version/)

    await expect(chooseDataSource(
      { ...baseArgs, manifestUrl },
      { fetchText: async () => JSON.stringify(productionManifest({ focus_emission_profile_url: undefined })) },
    )).rejects.toThrow(/focus_emission_profile_url/)
  })

  it('uses the manifest immutable URL only when it exactly names the active pointer profile', async () => {
    await expect(chooseDataSource(
      { ...baseArgs, manifestUrl },
      { fetchText: async () => JSON.stringify(productionManifest()) },
    )).resolves.toMatchObject({
      kind: 'manifest', focusEmissionProfile: pointer, profileUrl,
    })

    await expect(chooseDataSource(
      { ...baseArgs, manifestUrl },
      {
        fetchText: async () => JSON.stringify(productionManifest({
          focus_emission_profile_url: 'https://assets.example.test/galaxy/focus-emission-profiles/rating-emission-2026-07-b.json',
        })),
      },
    )).rejects.toThrow(/focus_emission_profile_url/)
  })

  it.each([
    ['missing pointer', undefined],
    ['unknown pointer field', { ...pointer, extra: true }],
    ['invalid activation time', { ...pointer, activated_at: 'not-an-iso-time' }],
  ])('fails closed for manifest %s', async (_label, focus_emission_profile) => {
    await expect(chooseDataSource(
      { ...baseArgs, manifestUrl },
      { fetchText: async () => JSON.stringify(productionManifest({ focus_emission_profile })) },
    )).rejects.toThrow(/focus_emission_profile/)
  })

  it('fails closed when neither production nor offline release input is selected', async () => {
    await expect(chooseDataSource(baseArgs)).rejects.toThrow(/--manifest-url|--data-file/)
  })

  it('derives the metadata sidecar path from the absolute PNG path', () => {
    expect(outputMetadataPath(path.join('relative', 'planet.png'))).toBe(`${path.resolve('relative', 'planet.png')}.render.json`)
  })
})
