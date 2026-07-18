import { describe, expect, it } from 'vitest'

import ar from './ar.json'
import en from './en.json'
import es from './es.json'
import fr from './fr.json'
import ja from './ja.json'
import zh from './zh.json'
import zhHant from './zh-Hant.json'

/** Collect dot-paths for leaf values; array indices use [n] segments. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') {
    return prefix ? [prefix] : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => leafPaths(item, `${prefix}[${i}]`))
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return keys.flatMap((k) => {
    const next = prefix ? `${prefix}.${k}` : k
    return leafPaths(obj[k], next)
  })
}

const canonicalPaths = leafPaths(en).sort()

const bundles = [
  ['zh', zh],
  ['zh-Hant', zhHant],
  ['es', es],
  ['ja', ja],
  ['fr', fr],
  ['ar', ar],
] as const

describe('locale JSON schema parity', () => {
  it.each(bundles)('%s matches en.json leaf key paths', (_name, bundle) => {
    expect(leafPaths(bundle).sort()).toEqual(canonicalPaths)
  })
})
