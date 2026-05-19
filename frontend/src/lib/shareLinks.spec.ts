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

  it('buildMovieSharePageUrl points at /movie/:id with query preserved', () => {
    const loc = {
      origin: 'https://example.com',
      search: '?lang=zh&theme=dark',
    } as Location

    const href = buildMovieSharePageUrl(42, loc)
    expect(href).toBe(`https://example.com${buildMoviePath(42, '?lang=zh&theme=dark')}`)
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
    const href = buildMovieSharePageUrl(7, loc, { basePath: '/chronicle/' })
    expect(href).toBe('https://example.com/chronicle/movie/7')
  })

  it('buildEmailShareUrl includes subject and body with page URL', () => {
    const mailto = buildEmailShareUrl('Film', 'Watch this', 'https://example.com/movie/3')
    expect(mailto).toContain('mailto:?')
    expect(mailto).toContain(encodeURIComponent('Film'))
    expect(mailto).toContain(encodeURIComponent('https://example.com/movie/3'))
  })
})
