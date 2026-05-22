import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildMoviePath } from '@/lib/routes'
import {
  buildEmailShareUrl,
  buildMovieSharePageUrl,
  buildSocialShareUrls,
} from '@/lib/shareLinks'

describe('shareLinks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('buildMovieSharePageUrl sets explicit lang and preserves other query params', () => {
    const loc = {
      origin: 'https://example.com',
      search: '?lang=en&theme=dark',
    } as Location

    const href = buildMovieSharePageUrl(42, 'zh', loc)
    const u = new URL(href)
    expect(u.pathname).toBe('/movie/42')
    expect(u.searchParams.get('lang')).toBe('zh')
    expect(u.searchParams.get('theme')).toBe('dark')
    expect(href).toBe(`https://example.com${buildMoviePath(42, '?lang=zh&theme=dark')}`)
  })

  it('buildMovieSharePageUrl adds lang when location search is empty', () => {
    const loc = { origin: 'https://example.com', search: '' } as Location
    const href = buildMovieSharePageUrl(1, 'ja', loc)
    expect(href).toBe('https://example.com/movie/1?lang=ja')
  })

  it('buildSocialShareUrls encodes platform intents', () => {
    const urls = buildSocialShareUrls('Title', 'Body text', 'https://example.com/movie/1')
    expect(urls.x).toContain(encodeURIComponent('Body text'))
    expect(urls.facebook).toContain(encodeURIComponent('https://example.com/movie/1'))
    expect(urls.reddit).toContain(encodeURIComponent('Title'))
  })

  it('buildMovieSharePageUrl respects deploy base path (T7)', () => {
    const loc = {
      origin: 'https://example.com',
      search: '',
    } as Location
    const href = buildMovieSharePageUrl(7, 'en', loc, { basePath: '/chronicle/' })
    expect(href).toBe('https://example.com/chronicle/movie/7?lang=en')
  })

  it('buildEmailShareUrl includes subject and body with page URL', () => {
    const mailto = buildEmailShareUrl('Film', 'Watch this', 'https://example.com/movie/3')
    expect(mailto).toContain('mailto:?')
    expect(mailto).toContain(encodeURIComponent('Film'))
    expect(mailto).toContain(encodeURIComponent('https://example.com/movie/3'))
  })
})
