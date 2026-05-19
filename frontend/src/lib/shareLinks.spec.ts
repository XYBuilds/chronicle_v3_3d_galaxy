import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildMoviePath } from '@/lib/routes'
import { buildMovieSharePageUrl, buildSocialShareUrls } from '@/lib/shareLinks'

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
})
