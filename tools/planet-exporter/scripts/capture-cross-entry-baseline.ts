import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { run } from '../src/cli.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-baseline-'))
const fixture = path.join(root, 'fixtures/galaxy.minimal.json')
const baseline = {
  schema_version: 'planet-export-cross-entry-baseline-v1',
  movie_id: 1,
  resolution: 128,
  padding: 0.35,
  render_mode: 'shader',
  fixture: 'fixtures/galaxy.minimal.json',
  blooms: {} as Record<string, unknown>,
}

for (const bloom of ['off', 'on'] as const) {
  const output = path.join(directory, `${bloom}.png`)
  const code = await run([
    '--movie-id', '1',
    '--output', output,
    '--resolution', '128',
    '--padding', '0.35',
    '--bloom', bloom,
    '--render-mode', 'shader',
    '--data-file', fixture,
  ])
  if (code !== 0) throw new Error(`export exited ${code}`)
  const png = await fs.readFile(output)
  const metadata = JSON.parse(await fs.readFile(`${output}.render.json`, 'utf8')) as {
    visual_config_hash: string
    visual_diagnostics: {
      renderer_snapshot: {
        emission: number
        profileEmission: number
        bloom: Record<string, unknown>
        profileSource: string
      }
    }
  }
  baseline.blooms[bloom] = {
    png_sha256: createHash('sha256').update(png).digest('hex'),
    visual_config_hash: metadata.visual_config_hash,
    renderer_snapshot: {
      emission: metadata.visual_diagnostics.renderer_snapshot.emission,
      profileEmission: metadata.visual_diagnostics.renderer_snapshot.profileEmission,
      bloom: metadata.visual_diagnostics.renderer_snapshot.bloom,
      profileSource: metadata.visual_diagnostics.renderer_snapshot.profileSource,
    },
  }
}

const outPath = path.join(root, 'fixtures/cross-entry-chromium-baseline.json')
await fs.writeFile(outPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
console.log(`wrote ${outPath}`)
