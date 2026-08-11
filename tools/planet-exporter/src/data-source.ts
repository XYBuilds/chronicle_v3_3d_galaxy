import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { CliError, EXIT_CODES, type ExportArgs } from './args.js'
import { createLocalActiveProfileFixture } from './localActiveProfileFixture.js'

export type DataSource = {
  kind: 'file' | 'url' | 'manifest'
  label: string
  pageUrl?: string
  bytes?: Buffer
  /** Local fake-adapter profile bytes for integration evidence; never used for network publication. */
  profileBytes?: Buffer
  version?: string
  focusEmissionProfile?: ActiveProfilePointer
  profileUrl?: string
  manifestUrl?: string
}

export type ActiveProfilePointer = {
  profile_id: string
  period: string
  model_version: string
  curve_sha256: string
  source_data_version: string
  source_movie_count: number
  status: 'active'
  activated_at: string
}

export type ChooseDataSourceOptions = {
  fetchText?: (url: string) => Promise<string>
}

type Manifest = {
  galaxy_data_gzip_url?: unknown
  data_version?: unknown
  focus_emission_profile?: unknown
  focus_emission_profile_url?: unknown
}

function controlledProfileUrl(raw: unknown, pointer: ActiveProfilePointer): string {
  if (typeof raw !== 'string') throw new Error('focus_emission_profile_url missing')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('focus_emission_profile_url invalid')
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith(`/focus-emission-profiles/${pointer.profile_id}.json`)) {
    throw new Error('focus_emission_profile_url invalid')
  }
  return url.toString()
}

function activeProfilePointer(raw: unknown): ActiveProfilePointer {
  if (raw === null || Array.isArray(raw) || typeof raw !== 'object') throw new Error('focus_emission_profile missing')
  const pointer = raw as Record<string, unknown>
  const allowed = new Set(['profile_id', 'period', 'model_version', 'curve_sha256', 'source_data_version', 'source_movie_count', 'status', 'activated_at'])
  if (Object.keys(pointer).some((key) => !allowed.has(key))) throw new Error('focus_emission_profile has unknown field')
  if (
    typeof pointer.profile_id !== 'string' || pointer.profile_id.trim() !== pointer.profile_id || !/^[a-z0-9][a-z0-9-]{2,127}$/.test(pointer.profile_id)
    || typeof pointer.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(pointer.period)
    || pointer.model_version !== 'rating-midrank-cdf-lut-v1'
    || typeof pointer.curve_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(pointer.curve_sha256)
    || typeof pointer.source_data_version !== 'string' || pointer.source_data_version.trim() !== pointer.source_data_version || !pointer.source_data_version
    || !Number.isSafeInteger(pointer.source_movie_count) || (pointer.source_movie_count as number) <= 0
    || pointer.status !== 'active'
    || typeof pointer.activated_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(pointer.activated_at) || !Number.isFinite(Date.parse(pointer.activated_at))
  ) throw new Error('focus_emission_profile invalid')
  return pointer as ActiveProfilePointer
}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.text()
}

function dataSourceFromProductionManifest(manifest: Manifest, manifestUrl: string): DataSource {
  if (typeof manifest.galaxy_data_gzip_url !== 'string') throw new Error('galaxy_data_gzip_url missing')
  const url = new URL(manifest.galaxy_data_gzip_url)
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hash || !/\.json(?:\.gz)?$/i.test(url.pathname)) {
    throw new Error('galaxy_data_gzip_url invalid')
  }
  if (typeof manifest.data_version !== 'string' || !manifest.data_version.trim()) throw new Error('data_version missing')
  const pointer = activeProfilePointer(manifest.focus_emission_profile)
  const profileUrl = controlledProfileUrl(manifest.focus_emission_profile_url, pointer)
  return {
    kind: 'manifest',
    label: manifestUrl,
    pageUrl: manifest.galaxy_data_gzip_url,
    version: manifest.data_version.trim(),
    focusEmissionProfile: pointer,
    profileUrl,
    manifestUrl,
  }
}

export async function chooseDataSource(
  args: ExportArgs,
  options: ChooseDataSourceOptions = {},
): Promise<DataSource> {
  if (args.dataFile) {
    try {
      const profile = createLocalActiveProfileFixture()
      return {
        kind: 'file',
        label: `file:${args.dataFile}`,
        bytes: await fs.readFile(args.dataFile),
        profileBytes: profile.bytes,
        focusEmissionProfile: profile.pointer,
      }
    } catch (error) {
      throw new CliError(`unable to read --data-file: ${error instanceof Error ? error.message : String(error)}`, EXIT_CODES.data)
    }
  }
  if (!args.manifestUrl) {
    throw new CliError('choose exactly one release input: --manifest-url URL or --data-file FILE', EXIT_CODES.data)
  }
  try {
    const fetchText = options.fetchText ?? defaultFetchText
    const raw = await fetchText(args.manifestUrl)
    const manifest = JSON.parse(raw) as Manifest
    return dataSourceFromProductionManifest(manifest, args.manifestUrl)
  } catch (error) {
    throw new CliError(`unable to load production manifest: ${error instanceof Error ? error.message : String(error)}`, EXIT_CODES.data)
  }
}

export function fileDataPlugin(source: DataSource): Plugin | undefined {
  if (!source.bytes && !source.profileBytes) return undefined
  return {
    name: 'planet-export-file-data',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__planet_export_data.json.gz', (_request, response) => {
        if (!source.bytes) {
          response.statusCode = 404
          response.end()
          return
        }
        response.statusCode = 200
        response.setHeader('content-type', source.bytes[0] === 0x1f && source.bytes[1] === 0x8b ? 'application/gzip' : 'application/json')
        response.setHeader('cache-control', 'no-store')
        response.end(source.bytes)
      })
      server.middlewares.use('/__planet_export_profile/focus-emission-profiles', (request, response) => {
        if (!source.profileBytes || !source.focusEmissionProfile || request.url !== `/${source.focusEmissionProfile.profile_id}.json`) {
          response.statusCode = 404
          response.end()
          return
        }
        response.statusCode = 200
        response.setHeader('content-type', 'application/json')
        response.setHeader('cache-control', 'no-store')
        response.end(source.profileBytes)
      })
    },
  }
}

export function pageDataUrl(serverUrl: string, source: DataSource): string {
  return source.bytes ? new URL('/__planet_export_data.json.gz', serverUrl).toString() : source.pageUrl!
}

/** Fakes only the immutable HTTP boundary for local evidence; production still requires manifest URLs. */
export function pageProfileUrl(serverUrl: string, source: DataSource): string | undefined {
  if (!source.profileBytes || !source.focusEmissionProfile) return source.profileUrl
  return new URL(`/__planet_export_profile/focus-emission-profiles/${source.focusEmissionProfile.profile_id}.json`, serverUrl).toString()
}

export function outputMetadataPath(output: string): string {
  return `${path.resolve(output)}.render.json`
}
