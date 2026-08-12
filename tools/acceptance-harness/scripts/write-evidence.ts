import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { buildAcceptanceEvidence, sha256Hex, type EvidenceArtifact } from '../src/evidenceMetadata.js'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')

function usage(): never {
  throw new Error(
    'usage: npx tsx scripts/write-evidence.ts --out FILE.json --command TEXT --merge-base SHA --candidate SHA [--artifact path:kind]...',
  )
}

async function gitSha(ref: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', ref], { cwd: repoRoot })
  return stdout.trim()
}

async function main(argv: readonly string[]): Promise<void> {
  let out: string | undefined
  let command: string | undefined
  let mergeBase: string | undefined
  let candidate: string | undefined
  const artifactArgs: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--out' && value) {
      out = value
      i += 1
    } else if (flag === '--command' && value) {
      command = value
      i += 1
    } else if (flag === '--merge-base' && value) {
      mergeBase = value
      i += 1
    } else if (flag === '--candidate' && value) {
      candidate = value
      i += 1
    } else if (flag === '--artifact' && value) {
      artifactArgs.push(value)
      i += 1
    } else {
      usage()
    }
  }
  if (!out || !command) usage()

  const artifacts: EvidenceArtifact[] = []
  for (const entry of artifactArgs) {
    const [filePath, kind = 'other'] = entry.split(':') as [string, EvidenceArtifact['kind'] | undefined]
    const absolute = path.resolve(process.cwd(), filePath)
    const bytes = await fs.readFile(absolute)
    artifacts.push({
      path: path.relative(repoRoot, absolute).replaceAll('\\', '/'),
      sha256: sha256Hex(bytes),
      kind: kind ?? 'other',
    })
  }

  const evidence = buildAcceptanceEvidence({
    merge_base: mergeBase ?? (await gitSha('origin/main')),
    candidate_commit: candidate ?? (await gitSha('HEAD')),
    command,
    environment: {
      os: `${os.platform()} ${os.release()}`,
      node: process.version,
      cwd: repoRoot.replaceAll('\\', '/'),
    },
    artifacts,
    created_at: new Date().toISOString(),
  })

  const target = path.resolve(process.cwd(), out)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ out: path.relative(repoRoot, target).replaceAll('\\', '/') }))
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
