import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildAcceptanceEvidence, sha256Hex } from '../src/evidenceMetadata.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')

function usage(): never {
  throw new Error(
    'usage: npx tsx scripts/compose-contact-sheet.ts --input FILE.json --output-dir DIRECTORY [--merge-base SHA] [--candidate SHA]',
  )
}

function parseArgs(argv: readonly string[]) {
  const values = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) usage()
    values.set(flag.slice(2), value)
    i += 1
  }
  const input = values.get('input')
  const outputDirectory = values.get('output-dir')
  if (!input || !outputDirectory) usage()
  return {
    input: path.resolve(process.cwd(), input),
    outputDirectory: path.resolve(process.cwd(), outputDirectory),
    mergeBase: values.get('merge-base'),
    candidate: values.get('candidate'),
  }
}

async function gitSha(ref: string): Promise<string> {
  const result = spawnSync('git', ['rev-parse', ref], { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || 'git rev-parse failed')
  return result.stdout.trim()
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv)
  await fs.mkdir(args.outputDirectory, { recursive: true })

  const result = spawnSync(
    'npm',
    [
      'run',
      'contact-sheet',
      '-w',
      'planet-exporter',
      '--',
      '--input',
      args.input,
      '--output-dir',
      args.outputDirectory,
      '--working-dir',
      repoRoot,
    ],
    { cwd: repoRoot, encoding: 'utf8', shell: true },
  )
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout)
    process.exit(result.status ?? 1)
  }
  process.stdout.write(result.stdout)

  const pngPath = path.join(args.outputDirectory, 'contact-sheet.png')
  const manifestPath = path.join(args.outputDirectory, 'contact-sheet.manifest.json')
  const png = await fs.readFile(pngPath)
  const evidence = buildAcceptanceEvidence({
    merge_base: args.mergeBase ?? (await gitSha('origin/main')),
    candidate_commit: args.candidate ?? (await gitSha('HEAD')),
    command: `npm run contact-sheet -w acceptance-harness -- --input ${path.relative(repoRoot, args.input).replaceAll('\\', '/')} --output-dir ${path.relative(repoRoot, args.outputDirectory).replaceAll('\\', '/')}`,
    environment: {
      os: process.platform,
      node: process.version,
      cwd: repoRoot.replaceAll('\\', '/'),
    },
    browser: process.env.ACCEPTANCE_BROWSER_NAME
      ? {
          name: process.env.ACCEPTANCE_BROWSER_NAME,
          version: process.env.ACCEPTANCE_BROWSER_VERSION ?? 'unknown',
          renderer: process.env.ACCEPTANCE_BROWSER_RENDERER,
        }
      : undefined,
    viewport: process.env.ACCEPTANCE_VIEWPORT_ID
      ? {
          id: process.env.ACCEPTANCE_VIEWPORT_ID,
          width: Number(process.env.ACCEPTANCE_VIEWPORT_WIDTH ?? 0),
          height: Number(process.env.ACCEPTANCE_VIEWPORT_HEIGHT ?? 0),
          deviceScaleFactor: Number(process.env.ACCEPTANCE_VIEWPORT_DPR ?? 1),
        }
      : undefined,
    data_profile: {
      identity: process.env.ACCEPTANCE_DATA_PROFILE_IDENTITY ?? 'contact-sheet-inputs',
      data_version: process.env.ACCEPTANCE_DATA_VERSION,
      profile_id: process.env.ACCEPTANCE_PROFILE_ID,
    },
    artifacts: [
      {
        path: path.relative(repoRoot, pngPath).replaceAll('\\', '/'),
        sha256: sha256Hex(png),
        kind: 'contact-sheet',
      },
      {
        path: path.relative(repoRoot, manifestPath).replaceAll('\\', '/'),
        sha256: sha256Hex(await fs.readFile(manifestPath)),
        kind: 'manifest',
      },
    ],
    created_at: new Date().toISOString(),
  })
  const evidencePath = path.join(args.outputDirectory, 'acceptance-evidence.json')
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(
    JSON.stringify({
      evidence: path.relative(repoRoot, evidencePath).replaceAll('\\', '/'),
    }),
  )
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
