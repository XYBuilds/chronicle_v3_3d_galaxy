/**
 * Performance protocol trigger (#371 / #381).
 *
 * Only renderer, data-volume, picking, animation, or build-performance-sensitive
 * changes should invoke this command. CI without a stable GPU captures the
 * protocol request; the fixed acceptance machine supplies the decision.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../artifacts/performance')

const PROTOCOL = {
  schema: 'chronicle-performance-protocol-v1',
  viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  browser: 'chromium',
  dataset: '60K-data',
  segments: ['idle', 'timeline-motion', 'focus'],
  block_rules: {
    median_or_p95_frame_time_regression_pct: 10,
    historical_fps_floor: 35,
    advisory_fps_target: 50,
  },
  instructions: [
    'Collect the same 60K-data idle, Timeline-motion, and focus segments on the fixed acceptance machine.',
    'A greater than 10% regression in median or p95 frame time blocks.',
    'Accepted behavior must not fall below the historical 35 FPS floor.',
    'Do not require this protocol for unrelated slices.',
  ],
} as const

async function main(): Promise<void> {
  await fs.mkdir(outDir, { recursive: true })
  const target = path.join(outDir, 'performance-protocol.json')
  await fs.writeFile(target, `${JSON.stringify(PROTOCOL, null, 2)}\n`)
  console.log(JSON.stringify({ protocol: path.relative(path.resolve(__dirname, '../../..'), target).replaceAll('\\', '/') }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
