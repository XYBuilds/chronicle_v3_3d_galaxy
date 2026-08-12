import { chromium } from 'playwright'
import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { ACCEPTANCE_VIEWPORTS } from '../src/viewports.js'
import { buildAcceptanceEvidence, sha256Hex } from '../src/evidenceMetadata.js'
import {
  ACCEPTANCE_REPO_ROOT,
  HUD_CAPTURE_STORY_IDS,
  VISUAL_GATE_CAPTURE_STORY_IDS,
  readStorybookStoryIds,
  waitForStoryReady,
  serveStorybookStatic,
  stopChild,
  storyIframeUrl,
} from '../src/storybookStatic.js'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../artifacts/storybook')
const hudViewports = [ACCEPTANCE_VIEWPORTS['hud-desktop']]
    // Storybook `lab-desktop` is fullscreen 100%; evidence still uses visual-gate 1920×1080.
    const labViewport = ACCEPTANCE_VIEWPORTS['visual-gate']

async function gitSha(ref: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', ref], { cwd: ACCEPTANCE_REPO_ROOT })
  return stdout.trim()
}

async function main(): Promise<void> {
  await fs.mkdir(outDir, { recursive: true })
  const build = spawn('npm', ['run', 'build-storybook'], {
    cwd: ACCEPTANCE_REPO_ROOT,
    shell: true,
    stdio: 'inherit',
  })
  await new Promise<void>((resolve, reject) => {
    build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build-storybook exited ${code}`))))
  })

  const available = new Set(await readStorybookStoryIds())
  const missing = [...HUD_CAPTURE_STORY_IDS, ...VISUAL_GATE_CAPTURE_STORY_IDS].filter((id) => !available.has(id))
  if (missing.length > 0) {
    throw new Error(`Storybook index missing capture ids: ${missing.join(', ')}`)
  }

  const child = await serveStorybookStatic()
  try {
    const browser = await chromium.launch()
    const artifacts: { path: string; sha256: string; kind: 'screenshot' }[] = []

    for (const viewport of hudViewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
      })
      const page = await context.newPage()
      for (const storyId of HUD_CAPTURE_STORY_IDS) {
        await page.goto(storyIframeUrl(storyId), { waitUntil: 'load', timeout: 60_000 })
        await waitForStoryReady(page)
        await new Promise((resolve) => setTimeout(resolve, 800))
        const file = path.join(outDir, `${viewport.id}__${storyId}.png`)
        await page.screenshot({ path: file, fullPage: true })
        artifacts.push({
          path: path.relative(ACCEPTANCE_REPO_ROOT, file).replaceAll('\\', '/'),
          sha256: sha256Hex(await fs.readFile(file)),
          kind: 'screenshot',
        })
      }
      await context.close()
    }

    const gateContext = await browser.newContext({
      viewport: { width: labViewport.width, height: labViewport.height },
      deviceScaleFactor: labViewport.deviceScaleFactor,
    })
    const gatePage = await gateContext.newPage()
    for (const storyId of VISUAL_GATE_CAPTURE_STORY_IDS) {
      await gatePage.goto(storyIframeUrl(storyId), { waitUntil: 'load', timeout: 60_000 })
      await waitForStoryReady(gatePage)
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      const file = path.join(outDir, `lab-desktop__${storyId}.png`)
      await gatePage.screenshot({ path: file, fullPage: true })
      artifacts.push({
        path: path.relative(ACCEPTANCE_REPO_ROOT, file).replaceAll('\\', '/'),
        sha256: sha256Hex(await fs.readFile(file)),
        kind: 'screenshot',
      })
    }
    await gateContext.close()

    const version = browser.version()
    await browser.close()

    const evidence = buildAcceptanceEvidence({
      merge_base: await gitSha('origin/main'),
      candidate_commit: await gitSha('HEAD'),
      command: 'npm run capture:storybook -w acceptance-harness',
      environment: {
        os: process.platform,
        node: process.version,
        cwd: ACCEPTANCE_REPO_ROOT.replaceAll('\\', '/'),
      },
      browser: { name: 'chromium', version },
      artifacts,
      created_at: new Date().toISOString(),
    })
    await fs.writeFile(path.join(outDir, 'acceptance-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(JSON.stringify({ outDir: path.relative(ACCEPTANCE_REPO_ROOT, outDir).replaceAll('\\', '/'), count: artifacts.length }))
  } finally {
    stopChild(child)
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
