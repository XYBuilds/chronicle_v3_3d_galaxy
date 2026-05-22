import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const INDEX_HTML_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../index.html',
)

describe('apex index.html OG meta (P34.6 / P34.9)', () => {
  it('uses Worker brand image and does not reference static og-today.png', () => {
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8')
    expect(html).toContain('https://themoviecosmos.com/og/brand.png?v=og-brand-og-v1')
    expect(html).not.toContain('og-today.png')
    expect(html).not.toContain('/data/og-today')
  })

  it('documents Worker HTML injection for deep links', () => {
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8')
    expect(html).toMatch(/\/movie\/\*.*Worker/i)
    expect(html).toMatch(/\/today.*Worker/i)
  })
})
