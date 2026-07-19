import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = path.dirname(fileURLToPath(import.meta.url))
const appSource = () => fs.readFileSync(path.join(SOURCE_ROOT, 'App.tsx'), 'utf-8')

describe('home idle boot retirement contract', () => {
  it('gates scene mounting on galaxy data plus terminal search-index hydration only', () => {
    const source = appSource()
    expect(source).toContain("const routeReady = status === 'ready' && data !== null && indexHydrationTerminal")
    expect(source).toContain('if (!routeReady || !data) return')
    expect(source).not.toMatch(/resolveToday|loadToday|coverBoot|coverBrand|CoverBackdrop/)
  })

  it('has no Today loader or cover runtime module left to consume', () => {
    expect(fs.existsSync(path.join(SOURCE_ROOT, 'data', 'loadToday.ts'))).toBe(false)
    expect(fs.existsSync(path.join(SOURCE_ROOT, 'store', 'coverModeStore.ts'))).toBe(false)
    expect(fs.existsSync(path.join(SOURCE_ROOT, 'hud', 'CoverBackdrop.tsx'))).toBe(false)
  })
})