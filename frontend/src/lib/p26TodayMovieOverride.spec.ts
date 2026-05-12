import { describe, expect, it } from 'vitest'

import { isP26ColorAuditEnabled, parseP26ForcedTodayMovieId } from '@/lib/p26TodayMovieOverride'

describe('parseP26ForcedTodayMovieId', () => {
  const ids = new Set([11, 550])

  it('returns null when param absent', () => {
    expect(parseP26ForcedTodayMovieId('', ids)).toBeNull()
    expect(parseP26ForcedTodayMovieId('?foo=1', ids)).toBeNull()
  })

  it('parses todayMovieId', () => {
    expect(parseP26ForcedTodayMovieId('?todayMovieId=550', ids)).toBe(550)
  })

  it('parses p26Today alias', () => {
    expect(parseP26ForcedTodayMovieId('?p26Today=11', ids)).toBe(11)
  })

  it('prefers todayMovieId over p26Today when both present', () => {
    expect(parseP26ForcedTodayMovieId('?todayMovieId=550&p26Today=11', ids)).toBe(550)
  })

  it('returns null when id not in bundle', () => {
    expect(parseP26ForcedTodayMovieId('?todayMovieId=999', ids)).toBeNull()
  })

  it('returns null for non-integer', () => {
    expect(parseP26ForcedTodayMovieId('?todayMovieId=55a', ids)).toBeNull()
  })
})

describe('isP26ColorAuditEnabled', () => {
  it('detects truthy flags', () => {
    expect(isP26ColorAuditEnabled('?p26ColorAudit=1')).toBe(true)
    expect(isP26ColorAuditEnabled('?p26ColorAudit=true')).toBe(true)
    expect(isP26ColorAuditEnabled('?p26ColorAudit=YES')).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isP26ColorAuditEnabled('')).toBe(false)
    expect(isP26ColorAuditEnabled('?p26ColorAudit=0')).toBe(false)
  })
})
