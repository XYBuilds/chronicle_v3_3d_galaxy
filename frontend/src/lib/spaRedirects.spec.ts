import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const REDIRECTS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../public/_redirects',
)

describe('SPA _redirects (P30.7 / §6.3)', () => {
  it('includes movie and today fallbacks without rewriting /data', () => {
    const raw = fs.readFileSync(REDIRECTS_PATH, 'utf-8')
    expect(raw).toContain('/movie/*  /index.html  200')
    expect(raw).toContain('/today    /index.html  200')
    expect(raw).not.toMatch(/\/data\//)
    expect(raw).not.toMatch(/\/fonts\//)
    expect(raw).not.toMatch(/\/assets\//)
    // P34.1: Worker /og/* must not be SPA-rewritten here (served by Worker in 34.5)
    expect(raw).not.toMatch(/\/og\//)
  })
})
