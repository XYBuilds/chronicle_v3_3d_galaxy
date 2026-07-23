import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIRECTORY = path.resolve(scriptDirectory, '..', 'public', 'data')
const MANIFEST_FILE = 'galaxy_assets_manifest.json'
const R2_BACKED_FILES = [
  'galaxy_data.json',
  'galaxy_data.json.gz',
  'galaxy_search_index.json',
  'galaxy_search_index.json.gz',
]

function assert(condition, message) {
  if (!condition) throw new Error(`[pages-deploy-assets] ${message}`)
}

function parseManifest(manifestPath) {
  assert(fs.statSync(manifestPath).isFile(), `manifest must be a file: ${manifestPath}`)

  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`[pages-deploy-assets] invalid manifest JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  assert(manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest must be an object')
  for (const key of ['galaxy_data_gzip_url', 'galaxy_search_index_gzip_url']) {
    const value = manifest[key]
    assert(typeof value === 'string' && value.trim(), `manifest ${key} is required before stripping local data`)
    let url
    try {
      url = new URL(value)
    } catch {
      throw new Error(`[pages-deploy-assets] manifest ${key} must be an absolute URL`)
    }
    assert(['https:', 'http:'].includes(url.protocol), `manifest ${key} must use http(s)`)
  }

  return manifest
}

/**
 * Keep Pages deploys small: the application consumes galaxy payloads from the verified R2
 * manifest, while these local copies exist only as intermediate pipeline artifacts.
 */
export function preparePagesDeployAssets(dataDirectory = DEFAULT_DATA_DIRECTORY) {
  assert(fs.existsSync(dataDirectory), `data directory is missing: ${dataDirectory}`)
  const manifestPath = path.join(dataDirectory, MANIFEST_FILE)
  const manifest = parseManifest(manifestPath)
  const removed = []

  for (const filename of R2_BACKED_FILES) {
    const filePath = path.join(dataDirectory, filename)
    if (!fs.existsSync(filePath)) continue
    const stat = fs.statSync(filePath)
    assert(stat.isFile(), `R2-backed asset must be a file: ${filePath}`)
    fs.rmSync(filePath)
    removed.push({ filename, bytes: stat.size })
  }

  console.log('[pages-deploy-assets]', {
    dataDirectory,
    manifest: MANIFEST_FILE,
    dataVersion: manifest.data_version ?? null,
    removed,
  })

  return { manifest, removed }
}

function parseDataDirectory(argv) {
  if (argv.length === 0) return DEFAULT_DATA_DIRECTORY
  assert(argv.length === 2 && argv[0] === '--data-dir' && argv[1], 'usage: node prepare-pages-deploy.mjs [--data-dir <path>]')
  return path.resolve(argv[1])
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null
if (invokedPath === fileURLToPath(import.meta.url)) {
  preparePagesDeployAssets(parseDataDirectory(process.argv.slice(2)))
}