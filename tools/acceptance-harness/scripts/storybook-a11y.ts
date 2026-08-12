import { AxeBuilder } from '@axe-core/playwright'
import type { Result } from 'axe-core'
import { chromium } from 'playwright'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ACCEPTANCE_REPO_ROOT,
  ensureStorybookStatic,
  readStorybookStoryIds,
  waitForStoryReady,
  serveStorybookStatic,
  stopChild,
  storyIframeUrl,
} from '../src/storybookStatic.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../artifacts/storybook-a11y')

async function main(): Promise<void> {
  await fs.mkdir(outDir, { recursive: true })
  await ensureStorybookStatic()

  const storyIds = (await readStorybookStoryIds()).filter((id) => !id.startsWith('visual-gate--'))
  if (storyIds.length === 0) {
    throw new Error('Storybook index has no HUD stories to scan')
  }

  const child = await serveStorybookStatic()
  try {
    const browser = await chromium.launch()
    const context = await browser.newContext()
    const blocking: Array<Result & { storyId: string }> = []
    for (const storyId of storyIds) {
      console.log(JSON.stringify({ scanning: storyId }))
      const page = await context.newPage()
      await page.goto(storyIframeUrl(storyId), { waitUntil: 'load', timeout: 60_000 })
      await waitForStoryReady(page)
      await new Promise((resolve) => setTimeout(resolve, 400))
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        // Canvas HUD tokens are reviewed perceptually; Timeline/attribution sit on the WebGL black field.
        .disableRules(['color-contrast', 'scrollable-region-focusable'])
        .analyze()
      blocking.push(
        ...results.violations
          .filter((v: Result) => v.impact === 'critical' || v.impact === 'serious')
          .map((v) => ({ ...v, storyId })),
      )
      await page.close()
    }
    await browser.close()
    await fs.writeFile(
      path.join(outDir, 'axe-summary.json'),
      `${JSON.stringify({ stories: storyIds.length, blocking: blocking.length, details: blocking }, null, 2)}\n`,
    )
    if (blocking.length > 0) {
      console.error(JSON.stringify(blocking, null, 2))
      process.exitCode = 1
      return
    }
    console.log(
      JSON.stringify({
        blocking: 0,
        stories: storyIds.length,
        outDir: path.relative(ACCEPTANCE_REPO_ROOT, outDir).replaceAll('\\', '/'),
      }),
    )
  } finally {
    stopChild(child)
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
