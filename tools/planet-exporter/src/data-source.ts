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
}

type Manifest = { galaxy_data_gzip_url?: unknown; version?: unknown }

export async function chooseDataSource(args: ExportArgs, manifestPath: string): Promise<DataSource> {
  if (args.dataFile) {
    try {
      return { kind: 'file', label: `file:${args.dataFile}`, bytes: await fs.readFile(args.dataFile) }
    } catch (error) {
      throw new CliError(`unable to read --data-file: ${error instanceof Error ? error.message : String(error)}`, EXIT_CODES.data)
    }
  }
  if (args.dataUrl) return { kind: 'url', label: args.dataUrl, pageUrl: args.dataUrl }
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Manifest
    if (typeof manifest.galaxy_data_gzip_url !== 'string') throw new Error('galaxy_data_gzip_url missing')
    const url = new URL(manifest.galaxy_data_gzip_url)
    if (!/^https?:$/.test(url.protocol) || !/\.json(?:\.gz)?$/i.test(url.pathname)) throw new Error('galaxy_data_gzip_url invalid')
    return { kind: 'manifest', label: manifest.galaxy_data_gzip_url, pageUrl: manifest.galaxy_data_gzip_url, version: typeof manifest.version === 'string' ? manifest.version : undefined }
  } catch (error) {
    throw new CliError(`unable to load data manifest: ${error instanceof Error ? error.message : String(error)}`, EXIT_CODES.data)
  }
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