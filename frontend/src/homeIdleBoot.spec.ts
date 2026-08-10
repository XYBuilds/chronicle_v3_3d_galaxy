import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = path.dirname(fileURLToPath(import.meta.url))
const appSource = () => fs.readFileSync(path.join(SOURCE_ROOT, 'App.tsx'), 'utf-8')

describe('home idle boot retirement contract', () => {
  it('gates scene mounting on galaxy data, search-index hydration, and canonical planet visual state', () => {
    const source = appSource()
    expect(source).toMatch(/routeReady[\s\S]*focusEmissionProfile !== null/)
    expect(source).toMatch(/routeReady[\s\S]*planetVisualState !== null/)
    expect(source).toMatch(/if \(!routeReady \|\| !data \|\| planetVisualState === null\) return/)
    expect(source).not.toMatch(/resolveToday|loadToday|coverBoot|coverBrand|CoverBackdrop/)
  })

  it('has no Today loader or cover runtime module left to consume', () => {
    expect(fs.existsSync(path.join(SOURCE_ROOT, 'data', 'loadToday.ts'))).toBe(false)
    expect(fs.existsSync(path.join(SOURCE_ROOT, 'store', 'coverModeStore.ts'))).toBe(false)
    expect(fs.existsSync(path.join(SOURCE_ROOT, 'hud', 'CoverBackdrop.tsx'))).toBe(false)
  })
})
