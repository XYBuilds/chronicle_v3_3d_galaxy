import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { CliError, EXIT_CODES, type ExportArgs } from './args.js'

export type DataSource = {
  kind: 'file' | 'url' | 'manifest'
  label: string
  pageUrl?: string
  bytes?: Buffer
  version?: string
  focusEmissionProfile?: ActiveProfilePointer
  profileUrl?: string
  allowLegacyProfile?: boolean
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

type Manifest = {
  galaxy_data_gzip_url?: unknown
  version?: unknown
  data_version?: unknown
  focus_emission_profile?: unknown
  focus_emission_profile_url?: unknown
}

function controlledProfileUrl(raw: unknown, pointer: ActiveProfilePointer, galaxyDataUrl: string): string {
  const value = raw === undefined
    ? new URL(`data/focus-emission-profiles/${pointer.profile_id}.json`, new URL(galaxyDataUrl)).toString()
    : raw
  if (typeof value !== 'string') throw new Error('focus_emission_profile_url invalid')
  let url: URL
  try {
    url = new URL(value)
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

export async function chooseDataSource(args: ExportArgs, manifestPath: string): Promise<DataSource> {
  if (args.dataFile) {
    try {
      return { kind: 'file', label: `file:${args.dataFile}`, bytes: await fs.readFile(args.dataFile), allowLegacyProfile: true }
    } catch (error) {
      throw new CliError(`unable to read --data-file: ${error instanceof Error ? error.message : String(error)}`, EXIT_CODES.data)
    }
  }
  if (args.dataUrl) return { kind: 'url', label: args.dataUrl, pageUrl: args.dataUrl }
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Manifest
    if (typeof manifest.galaxy_data_gzip_url !== 'string') throw new Error('galaxy_data_gzip_url missing')
    const url = new URL(manifest.galaxy_data_gzip_url)
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hash || !/\.json(?:\.gz)?$/i.test(url.pathname)) throw new Error('galaxy_data_gzip_url invalid')
    const pointer = activeProfilePointer(manifest.focus_emission_profile)
    const profileUrl = controlledProfileUrl(manifest.focus_emission_profile_url, pointer, manifest.galaxy_data_gzip_url)
    return {
      kind: 'manifest',
      label: manifest.galaxy_data_gzip_url,
      pageUrl: manifest.galaxy_data_gzip_url,
      version: typeof manifest.data_version === 'string' ? manifest.data_version : typeof manifest.version === 'string' ? manifest.version : undefined,
      focusEmissionProfile: pointer,
      profileUrl,
    }
  } catch (error) {
    throw new CliError(`unable to load data manifest: ${error instanceof Error ? error.message : String(error)}`, EXIT_CODES.data)
  }
}

export function isLegacyProfileCompatibilityFixture(source: DataSource): boolean {
  return source.kind === 'file'
}

export function fileDataPlugin(source: DataSource): Plugin | undefined {
  if (!source.bytes) return undefined
  return {
    name: 'planet-export-file-data',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__planet_export_data.json.gz', (_request, response) => {
        response.statusCode = 200
        response.setHeader('content-type', source.bytes![0] === 0x1f && source.bytes![1] === 0x8b ? 'application/gzip' : 'application/json')
        response.setHeader('cache-control', 'no-store')
        response.end(source.bytes)
      })
    },
  }
}

export function pageDataUrl(serverUrl: string, source: DataSource): string {
  return source.bytes ? new URL('/__planet_export_data.json.gz', serverUrl).toString() : source.pageUrl!
}

export function outputMetadataPath(output: string): string {
  return `${path.resolve(output)}.render.json`
}