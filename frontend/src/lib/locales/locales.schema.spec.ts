import { describe, expect, it } from 'vitest'

import en from './en.json'
import es from './es.json'
import zh from './zh.json'

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

describe('locale JSON schema parity', () => {
  it('zh.json matches en.json leaf key paths', () => {
    expect(leafPaths(zh).sort()).toEqual(canonicalPaths)
  })

  it('es.json matches en.json leaf key paths', () => {
    expect(leafPaths(es).sort()).toEqual(canonicalPaths)
  })

  it('focusVoteReference tier label counts match en', () => {
    expect(zh.focusVoteReference.tierLabels.length).toBe(en.focusVoteReference.tierLabels.length)
    expect(es.focusVoteReference.tierLabels.length).toBe(en.focusVoteReference.tierLabels.length)
  })
})
