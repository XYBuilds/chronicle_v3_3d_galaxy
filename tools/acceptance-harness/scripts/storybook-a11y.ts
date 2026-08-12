import { AxeBuilder } from '@axe-core/playwright'
import type { Result } from 'axe-core'
import { chromium } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const outDir = path.resolve(__dirname, '../artifacts/storybook-a11y')

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

async function main(): Promise<void> {
  await fs.mkdir(outDir, { recursive: true })
  const staticDir = path.join(repoRoot, 'frontend/storybook-static')
  try {
    await fs.access(staticDir)
  } catch {
    const build = spawn('npm', ['run', 'build-storybook'], { cwd: repoRoot, shell: true, stdio: 'inherit' })
    await new Promise<void>((resolve, reject) => {
      build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build-storybook exited ${code}`))))
    })
  }

  let child: ChildProcess | undefined
  try {
    child = spawn('npx', ['--yes', 'serve', 'frontend/storybook-static', '-l', '6006'], {
      cwd: repoRoot,
      shell: true,
      stdio: 'ignore',
    })
    await waitForServer('http://127.0.0.1:6006', 120_000)
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto('http://127.0.0.1:6006/', { waitUntil: 'networkidle', timeout: 120_000 })
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const blocking = results.violations.filter((v: Result) => v.impact === 'critical' || v.impact === 'serious')
    await fs.writeFile(
      path.join(outDir, 'axe-summary.json'),
      `${JSON.stringify({ violations: results.violations.length, blocking: blocking.length, details: blocking }, null, 2)}\n`,
    )
    await browser.close()
    if (blocking.length > 0) {
      console.error(JSON.stringify(blocking, null, 2))
      process.exitCode = 1
      return
    }
    console.log(JSON.stringify({ blocking: 0, outDir: path.relative(repoRoot, outDir).replaceAll('\\', '/') }))
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
