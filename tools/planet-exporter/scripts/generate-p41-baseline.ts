import path from 'node:path'

import { writePhase41Baseline } from '../src/phase41Baseline.js'

const root = path.resolve(import.meta.dirname, '../../..')

async function main(argv: string[]): Promise<void> {
  if (argv.length !== 0) throw new Error('usage: npm run evidence:p41.1')
  const { summary, outputDirectory } = await writePhase41Baseline(root)
  console.log(JSON.stringify({ outputDirectory, source: summary.source, movieCount: summary.movie_count, rating: summary.rating, voteCount: summary.vote_count }))
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})