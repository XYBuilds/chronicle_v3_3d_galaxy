import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliError, EXIT_CODES, parseArgs } from './args.js'
import { writeArtifactsAtomically } from './artifacts.js'
import { getGitCommit, metadataFor, renderInBrowser } from './browser.js'
import { chooseDataSource, outputMetadataPath } from './data-source.js'
import { assertPngSafe } from './png.js'

const root = path.resolve(import.meta.dirname, '../../..')

export type RunDependencies = {
  chooseDataSource: typeof chooseDataSource
  renderInBrowser: typeof renderInBrowser
  assertPngSafe: typeof assertPngSafe
  metadataFor: typeof metadataFor
  getGitCommit: typeof getGitCommit
  writeArtifactsAtomically: typeof writeArtifactsAtomically
  outputMetadataPath: typeof outputMetadataPath
}

const defaultDependencies: RunDependencies = {
  chooseDataSource,
  renderInBrowser,
  assertPngSafe,
  metadataFor,
  getGitCommit,
  writeArtifactsAtomically,
  outputMetadataPath,
}

export async function run(
  argv: string[],
  io: Pick<typeof process, 'stdout' | 'stderr'> = process,
  dependencies: RunDependencies = defaultDependencies,
): Promise<number> {
  try {
    const args = parseArgs(argv, (value) => path.resolve(value))
    const source = await dependencies.chooseDataSource(args, path.join(root, 'frontend/public/data/galaxy_assets_manifest.json'))
    io.stderr.write(`[planet:export] movieId=${args.movieId} source=${source.label} resolution=${args.resolution} output=${args.output}\n`)
    const render = await dependencies.renderInBrowser(args, source, root)
    dependencies.assertPngSafe(render.png, args.resolution)
    const metadata = dependencies.metadataFor(args, source, render, dependencies.getGitCommit(root))
    const metadataPath = dependencies.outputMetadataPath(args.output)
    await dependencies.writeArtifactsAtomically({ png: args.output, metadata: metadataPath }, render.png, metadata)
    io.stdout.write(`${JSON.stringify({ output: args.output, metadata: metadataPath, tmdb_id: args.movieId })}\n`)
    return 0
  } catch (error) {
    const failure = error instanceof CliError ? error : new CliError(error instanceof Error ? error.message : String(error), EXIT_CODES.render)
    io.stderr.write(`[planet:export] ${failure.message}\n`)
    return failure.exitCode
  }
}

const scriptPath = process.argv[1]
if (scriptPath && import.meta.url === pathToFileURL(path.resolve(scriptPath)).href) {
  void run(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode
  })
}