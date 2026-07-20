import { access, mkdir } from 'node:fs/promises'
import path from 'node:path'

import { writeArtifactsAtomically } from '../src/artifacts.js'
import { getGitCommit, metadataFor } from '../src/browser.js'
import { run } from '../src/cli.js'
import { chooseDataSource, outputMetadataPath } from '../src/data-source.js'
import { assertPngSafe } from '../src/png.js'
import { renderP3910BloomStrengthZeroInBrowser } from '../src/p3910BloomStrengthZero.js'
import { main as writePhase39Fixtures } from '../src/phase39Fixtures.js'

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
): Promise<void> {
  const fixture = path.join(output, 'fixtures', `controlled-rating-${rating}.json`)
  const png = path.join(output, `planet-rating-${rating}-${suffix}.png`)
  await assertFile(fixture)
  const args = {
    movieId: 157336,
    output: png,
    resolution: 3000,
    padding: 0.08,
    bloom,
    sizeRoot: 3 as const,
    renderMode: 'shader' as const,
    dataFile: fixture,
  }
  const source = await chooseDataSource(args, path.join(root, 'frontend/public/data/galaxy_assets_manifest.json'))
  const render = await renderP3910BloomStrengthZeroInBrowser(args, source, root)
  assertPngSafe(render.png, args.resolution)
  const metadata = metadataFor(args, source, render, getGitCommit(root))
  await writeArtifactsAtomically({ png, metadata: outputMetadataPath(png) }, render.png, metadata)
}

async function exportNormalFixture(
  rating: number,
  bloom: 'on' | 'off',
  suffix: string,
): Promise<void> {
  const fixture = path.join(output, 'fixtures', `controlled-rating-${rating}.json`)
  const png = path.join(output, `planet-rating-${rating}-${suffix}.png`)
  await assertFile(fixture)
  const exitCode = await run([
    '--movie-id', '157336',
    '--output', png,
    '--resolution', '3000',
    '--padding', '0.08',
    '--bloom', bloom,
    '--render-mode', 'shader',
    '--data-file', fixture,
  ])
  if (exitCode !== 0) throw new Error(`[P39.10] export failed for rating=${rating} bloom=${bloom}`)
}

async function main(): Promise<void> {
  const fixtureDirectory = path.join(output, 'fixtures')
  const baseline = path.join(root, 'tools/planet-exporter/fixtures/phase39-contract-baseline.json')
  await mkdir(output, { recursive: true })
  // Always derive ignored controlled fixtures from the tracked baseline so a clean checkout
  // cannot accidentally inherit evidence from a prior run.
  await writePhase39Fixtures(['--baseline-file', baseline, '--output-dir', fixtureDirectory])
  for (const rating of ratings) {
    await exportNormalFixture(rating, 'off', 'bloom-off')
    await exportNormalFixture(rating, 'on', 'bloom-on')
    await exportFixture(rating, 'on', 'bloom-on-strength-zero')
  }
  console.log(JSON.stringify({ output, ratings, matrix: 'rating 0/4/5/10 × bloom off/on plus strength=0 proof' }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})