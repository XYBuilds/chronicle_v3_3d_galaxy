import { access, mkdir } from 'node:fs/promises'
import path from 'node:path'

import { main as writePhase39Fixtures } from '../src/phase39Fixtures.js'
import { run } from '../src/cli.js'

const root = path.resolve(import.meta.dirname, '../../..')
const output = path.join(root, 'data/runs/phase39-p39.10')
const ratings = [0, 4, 5, 10] as const

async function assertFile(file: string): Promise<void> {
  await access(file)
}

async function exportFixture(
  rating: number,
  bloom: 'on' | 'off',
  suffix: string,
  bloomStrength?: number,
): Promise<void> {
  const fixture = path.join(output, 'fixtures', `controlled-rating-${rating}.json`)
  const png = path.join(output, `planet-rating-${rating}-${suffix}.png`)
  await assertFile(fixture)
  const argv = [
    '--movie-id', '157336',
    '--output', png,
    '--resolution', '3000',
    '--padding', '0.08',
    '--bloom', bloom,
    '--render-mode', 'shader',
    '--data-file', fixture,
    ...(bloomStrength === undefined ? [] : ['--bloom-strength', String(bloomStrength)]),
  ]
  const exitCode = await run(argv)
  if (exitCode !== 0) throw new Error(`[P39.10] export failed for rating=${rating} bloom=${bloom} strength=${bloomStrength ?? 'default'}`)
}

async function main(): Promise<void> {
  const fixtureDirectory = path.join(output, 'fixtures')
  const baseline = path.join(root, 'tools/planet-exporter/fixtures/phase39-contract-baseline.json')
  await mkdir(output, { recursive: true })
  // Always derive ignored controlled fixtures from the tracked baseline so a clean checkout
  // cannot accidentally inherit evidence from a prior run.
  await writePhase39Fixtures(['--baseline-file', baseline, '--output-dir', fixtureDirectory])
  for (const rating of ratings) {
    await exportFixture(rating, 'off', 'bloom-off')
    await exportFixture(rating, 'on', 'bloom-on')
    await exportFixture(rating, 'on', 'bloom-on-strength-zero', 0)
  }
  console.log(JSON.stringify({ output, ratings, matrix: 'rating 0/4/5/10 × bloom off/on plus strength=0 proof' }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})