import { chromium } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ACCEPTANCE_VIEWPORTS } from '../src/viewports.js'
import { buildAcceptanceEvidence, sha256Hex } from '../src/evidenceMetadata.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const outDir = path.resolve(__dirname, '../artifacts/storybook')
const viewports = [ACCEPTANCE_VIEWPORTS['hud-mobile'], ACCEPTANCE_VIEWPORTS['hud-desktop']]

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`server did not become ready: ${url}`)
}

async function gitSha(ref: string): Promise<string> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  const { stdout } = await execFileAsync('git', ['rev-parse', ref], { cwd: repoRoot })
  return stdout.trim()
}

async function main(): Promise<void> {
  await fs.mkdir(outDir, { recursive: true })
  const build = spawn('npm', ['run', 'build-storybook'], { cwd: repoRoot, shell: true, stdio: 'inherit' })
  await new Promise<void>((resolve, reject) => {
    build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build-storybook exited ${code}`))))
  })

  let child: ChildProcess | undefined
  try {
    child = spawn('npx', ['--yes', 'serve', 'frontend/storybook-static', '-l', '6006'], {
      cwd: repoRoot,
      shell: true,
      stdio: 'ignore',
    })
    await waitForServer('http://127.0.0.1:6006', 120_000)

    const browser = await chromium.launch()
    const artifacts: { path: string; sha256: string; kind: 'screenshot' }[] = []
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
      })
      const page = await context.newPage()
      await page.goto('http://127.0.0.1:6006/', { waitUntil: 'networkidle', timeout: 120_000 })
      const file = path.join(outDir, `${viewport.id}.png`)
      await page.screenshot({ path: file, fullPage: true })
      artifacts.push({
        path: path.relative(repoRoot, file).replaceAll('\\', '/'),
        sha256: sha256Hex(await fs.readFile(file)),
        kind: 'screenshot',
      })
      await context.close()
    }
    const version = browser.version()
    await browser.close()

    const evidence = buildAcceptanceEvidence({
      merge_base: await gitSha('origin/main'),
      candidate_commit: await gitSha('HEAD'),
      command: 'npm run capture:storybook -w acceptance-harness',
      environment: {
        os: process.platform,
        node: process.version,
        cwd: repoRoot.replaceAll('\\', '/'),
      },
      browser: { name: 'chromium', version },
      artifacts,
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
