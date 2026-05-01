import { describe, expect, it } from 'vitest'

import {
  buildDrawerDetailsFields,
  buildDrawerDetailsGroups,
  formatUsdPresent,
} from '@/components/drawerDetailsLayout'
import type { Movie } from '@/types/galaxy'
import {
  subsampleMovieHappiness,
  subsampleMovieKika,
  subsampleMovieMarthasVineyard,
} from '@/storybook/fixtures/subsampleMovies'

const slash = '/'

function idsOf(fields: ReturnType<typeof buildDrawerDetailsFields>) {
  return fields.map((f) => f.id)
}

describe('formatUsdPresent', () => {
  it('treats 0 and non-finite as no data', () => {
    expect(formatUsdPresent(0)).toBeNull()
    expect(formatUsdPresent(-1)).toBeNull()
    expect(formatUsdPresent(NaN)).toBeNull()
    expect(formatUsdPresent(null)).toBeNull()
    expect(formatUsdPresent(undefined)).toBeNull()
  })

  it('formats positive USD', () => {
    const s = formatUsdPresent(1_000_000)
    expect(s).not.toBeNull()
    expect(s!.startsWith('$')).toBe(true)
    expect(s).toMatch(/1/)
  })
})

describe('buildDrawerDetailsFields', () => {
  it('P14.6 group 1: runtime 0 is shown, not slash', () => {
    const m: Movie = { ...subsampleMovieHappiness, runtime: 0, original_language: 'en' }
    const fields = buildDrawerDetailsFields(m)
    expect(fields[0]).toEqual({ id: 'runtime', value: '0 min' })
  })

  it('P14.6 group 1: missing runtime and language use slash', () => {
    const m: Movie = { ...subsampleMovieHappiness, runtime: null, original_language: '  ' }
    const fields = buildDrawerDetailsFields(m)
    expect(fields[0]?.value).toBe(slash)
    expect(fields[1]?.value).toBe(slash)
  })

  it('P14.6 group 4: hide when budget and revenue both unusable', () => {
    const m: Movie = { ...subsampleMovieMarthasVineyard, budget: 0, revenue: 0 }
    const fields = buildDrawerDetailsFields(m)
    expect(idsOf(fields)).not.toContain('budget')
    expect(idsOf(fields)).not.toContain('revenue')
  })

  it('P14.6 group 4: slash for missing side when the other has money', () => {
    const m: Movie = subsampleMovieKika
    const fields = buildDrawerDetailsFields(m)
    const b = fields.find((f) => f.id === 'budget')
    const r = fields.find((f) => f.id === 'revenue')
    expect(b?.value).toBe(slash)
    expect(r?.value).toMatch(/\$/)
  })

  it('P14.6 group 2 order: director, producers, writers', () => {
    const fields = buildDrawerDetailsFields(subsampleMovieMarthasVineyard)
    const iDir = fields.findIndex((f) => f.id === 'director')
    const iProd = fields.findIndex((f) => f.id === 'producers')
    const iWriters = fields.findIndex((f) => f.id === 'writers')
    expect(iDir).toBeGreaterThan(-1)
    expect(iProd).toBeGreaterThan(iDir)
    expect(iWriters).toBeGreaterThan(iProd)
  })

  it('P14.6 group 3 omitted when DOP and composer empty', () => {
    const fields = buildDrawerDetailsFields(subsampleMovieHappiness)
    expect(idsOf(fields)).not.toContain('directorOfPhotography')
    expect(idsOf(fields)).not.toContain('musicComposer')
  })
})

describe('buildDrawerDetailsGroups', () => {
  it('splits credits into separate arrays so UI can break rows between groups', () => {
    const g = buildDrawerDetailsGroups(subsampleMovieMarthasVineyard)
    expect(g.group1).toHaveLength(2)
    expect(g.group2.length).toBeGreaterThan(0)
    expect(g.group3.length).toBeGreaterThan(0)
    expect(g.group1[0]?.id).toBe('runtime')
    expect(g.group1[1]?.id).toBe('language')
  })

  it('leaves group2 empty when no director, producers, or writers', () => {
    const m: Movie = {
      ...subsampleMovieHappiness,
      director: [],
      producers: [],
      writers: [],
    }
    const g = buildDrawerDetailsGroups(m)
    expect(g.group2).toHaveLength(0)
    expect(g.group1).toHaveLength(2)
  })
})
