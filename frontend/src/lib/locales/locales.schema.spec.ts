import { describe, expect, it } from 'vitest'

import en from './en.json'
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

describe('locale JSON schema parity', () => {
  it('en.json and zh.json have identical leaf key paths', () => {
    expect(leafPaths(zh).sort()).toEqual(leafPaths(en).sort())
  })

  it('focusVoteReference tier label counts match', () => {
    expect(zh.focusVoteReference.tierLabels.length).toBe(en.focusVoteReference.tierLabels.length)
  })
})
