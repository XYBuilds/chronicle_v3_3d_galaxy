#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatOwnerCheckMatrix, selectOwnerChecks } from '../src/ownerChecks.js'
import { parseRiskDeclaration } from '../src/riskDeclaration.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')

function usage(): never {
  console.error('usage: npx tsx scripts/run-owner-checks.ts --declaration FILE.json [--dry-run] [--local-only]')
  process.exit(2)
}

function parseArgs(argv: readonly string[]): {
  declaration: string
  dryRun: boolean
  localOnly: boolean
} {
  let declaration: string | undefined
  let dryRun = false
  let localOnly = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--declaration') {
      declaration = argv[++i]
    } else if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--local-only') {
      localOnly = true
    } else {
      usage()
    }
  }
  if (!declaration) usage()
  return { declaration, dryRun, localOnly }
}

const args = parseArgs(process.argv.slice(2))
const raw = JSON.parse(readFileSync(path.resolve(repoRoot, args.declaration), 'utf8')) as unknown
const declaration = parseRiskDeclaration(raw)
let checks = [...selectOwnerChecks(declaration)]
if (args.localOnly) {
  checks = checks.filter((check) => check.kind === 'local')
}

console.log(`Risk ${declaration.tier}; surfaces=${declaration.surfaces.join(',') || '(none)'}`)
console.log(formatOwnerCheckMatrix(checks))

if (args.dryRun) {
  process.exit(0)
}

for (const check of checks) {
  if (check.kind === 'handoff') {
    console.log(`SKIP handoff ${check.id}: ${check.command}`)
    continue
  }
  console.log(`RUN ${check.id}: ${check.command}`)
  const result = spawnSync(check.command, {
    cwd: repoRoot,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  })
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1)
  }
}
