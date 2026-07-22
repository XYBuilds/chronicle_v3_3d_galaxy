import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'

type ActivePointer = { profile_id: string; period: string; model_version: string; curve_sha256: string; source_data_version: string; source_movie_count: number; status: 'active'; activated_at: string }
type GalaxyAssetsManifest = { focus_emission_profile?: ActivePointer }
type LoaderModule = { loadFocusEmissionProfile: (options: unknown) => Promise<{ lut: { samples: number[] }; provenance: { profile_id: string; curve_sha256: string; source_data_version: string; source_movie_count: number }; source: string }> }

const frontendRoot = path.resolve(import.meta.dirname, '..')

type Args = { profile: string; manifest: string; output: string }

function parseArgs(): Args {
  const read = (name: string): string => {
    const index = process.argv.indexOf(name)
    const value = process.argv[index + 1]
    if (index < 0 || !value) throw new Error(`missing ${name}`)
    return value
  }
  return { profile: read('--profile'), manifest: read('--manifest'), output: read('--output') }
}

async function main(): Promise<void> {
  const args = parseArgs()
  const [profileBytes, manifestText] = await Promise.all([fs.readFile(args.profile), fs.readFile(args.manifest, 'utf8')])
  const manifest = JSON.parse(manifestText) as GalaxyAssetsManifest
  const pointer = manifest.focus_emission_profile
  if (!pointer) throw new Error('active profile pointer is required')
  const requests: string[] = []
  const server = createServer((request, response) => {
    const expected = `/p426/focus-emission-profiles/${pointer.profile_id}.json`
    if (request.url !== expected) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(profileBytes)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('local profile server did not bind')
  const profileUrl = `http://127.0.0.1:${address.port}/p426/focus-emission-profiles/${pointer.profile_id}.json`
  const vite = await createViteServer({ root: frontendRoot, configFile: path.join(frontendRoot, 'vite.config.ts'), server: { middlewareMode: true } })
  try {
    const loader = await vite.ssrLoadModule('/src/lib/focusEmissionProfileLoader.ts') as LoaderModule
    const resolved = await loader.loadFocusEmissionProfile({
      manifest,
      profileUrl,
      fetchImpl: async (input, init) => {
        requests.push(String(input))
        return fetch(input, init)
      },
      log: () => undefined,
    })
    if (requests.length !== 1 || requests[0] !== profileUrl) throw new Error('website loader did not fetch exactly the fake immutable profile')
    if (resolved.source !== 'active' || resolved.provenance.profile_id !== pointer.profile_id || resolved.provenance.curve_sha256 !== pointer.curve_sha256) {
      throw new Error('website loader did not resolve the declared active immutable profile')
    }
    const samples = [...resolved.lut.samples]
    if (samples.length !== 201) throw new Error('website loader did not resolve the full 201-sample LUT')
    const output = {
      entrypoint: 'frontend/src/lib/focusEmissionProfileLoader.ts:loadFocusEmissionProfile',
      entry: 'frontend/src/lib/focusEmissionProfileLoader.ts:loadFocusEmissionProfile',
      fetch_count: requests.length,
      requested_url: profileUrl,
      fetch_transport: 'localhost-fake-immutable-resource',
      resolved_source: resolved.source,
      fetch: { url: profileUrl, count: requests.length, transport: 'localhost-fake-immutable-resource' },
      profile_id: resolved.provenance.profile_id,
      curve_sha256: resolved.provenance.curve_sha256,
      samples,
      samples_sha256: createHash('sha256').update(JSON.stringify(samples)).digest('hex'),
      source_data_version: resolved.provenance.source_data_version,
      source_movie_count: resolved.provenance.source_movie_count,
      source: resolved.source,
    }
    await fs.writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  } finally {
    await vite.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})