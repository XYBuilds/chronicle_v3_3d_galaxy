import { chromium } from 'playwright'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { ACCEPTANCE_VIEWPORTS } from '../src/viewports.js'
import { buildAcceptanceEvidence, sha256Hex } from '../src/evidenceMetadata.js'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const outDir = path.resolve(__dirname, '../artifacts/app-baseline')
const viewport = ACCEPTANCE_VIEWPORTS['app-desktop']

async function gitSha(ref: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', ref], { cwd: repoRoot })
  return stdout.trim()
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status === 404) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`server did not become ready: ${url}`)
}

async function main(): Promise<void> {
  await fs.mkdir(outDir, { recursive: true })
  let child: ChildProcess | undefined
  try {
    child = spawn('npm', ['run', 'dev', '-w', 'frontend'], {
      cwd: repoRoot,
      shell: true,
      stdio: 'ignore',
    })
    await waitForServer('http://127.0.0.1:4173', 180_000)

    const browser = await chromium.launch()
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await page.getByRole('search').waitFor({ timeout: 180_000 })
    const homePath = path.join(outDir, 'home-idle.png')
    await page.screenshot({ path: homePath, fullPage: true })

    await page.goto('http://127.0.0.1:4173/movie/550', { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await page.getByLabel('Back to cosmos').waitFor({ timeout: 120_000 })
    const focusPath = path.join(outDir, 'movie-focus.png')
    await page.screenshot({ path: focusPath, fullPage: true })

    const version = browser.version()
    await browser.close()

    const evidence = buildAcceptanceEvidence({
      merge_base: process.env.ACCEPTANCE_MERGE_BASE ?? (await gitSha('origin/main')),
      candidate_commit: process.env.ACCEPTANCE_CANDIDATE ?? (await gitSha('HEAD')),
      command: 'npm run capture:app-baseline -w acceptance-harness',
      environment: {
        os: process.platform,
        node: process.version,
        cwd: repoRoot.replaceAll('\\', '/'),
      },
      browser: { name: 'chromium', version },
      viewport: {
        id: viewport.id,
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
      },
      data_profile: {
        identity: 'dev-bundled-gzip',
      },
      artifacts: [
        {
          path: path.relative(repoRoot, homePath).replaceAll('\\', '/'),
          sha256: sha256Hex(await fs.readFile(homePath)),
          kind: 'screenshot',
        },
        {
          path: path.relative(repoRoot, focusPath).replaceAll('\\', '/'),
          sha256: sha256Hex(await fs.readFile(focusPath)),
          kind: 'screenshot',
        },
      ],
      created_at: new Date().toISOString(),
    })
    await fs.writeFile(path.join(outDir, 'acceptance-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(JSON.stringify({ outDir: path.relative(repoRoot, outDir).replaceAll('\\', '/') }))
  } finally {
    if (child?.pid) {
      try {
        process.kill(child.pid)
      } catch {
        // ignore
      }
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
