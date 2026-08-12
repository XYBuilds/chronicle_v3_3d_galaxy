import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const exporterPackage = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { scripts?: Record<string, string> }
const rootPackage = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'),
) as { scripts?: Record<string, string> }

describe('retired diagnostic evidence scripts', () => {
  it('removes Phase 39/41 evidence package scripts from the exporter and root', () => {
    const exporterScripts = Object.keys(exporterPackage.scripts ?? {})
    const rootScripts = Object.keys(rootPackage.scripts ?? {})
    expect(exporterScripts.filter((name) => /^(evidence:p39|evidence:p41|evidence:p426)/.test(name))).toEqual([])
    expect(rootScripts.filter((name) => /^(evidence:p39|evidence:p41|evidence:p426)/.test(name))).toEqual([])
  })
})
