import { describe, expect, it } from 'vitest'

import {
  getInitialPosterLoadState,
  isPosterLoadEventCurrent,
  posterSrcWithReloadToken,
  shouldShowDrawerPosterImage,
} from '@/components/drawerPoster'

describe('getInitialPosterLoadState', () => {
  it('returns empty when poster URL is blank', () => {
    expect(getInitialPosterLoadState('')).toBe('empty')
    expect(getInitialPosterLoadState('   ')).toBe('empty')
  })

  it('returns loading when poster URL is present', () => {
    expect(getInitialPosterLoadState('https://image.tmdb.org/p/1.jpg')).toBe('loading')
    expect(getInitialPosterLoadState('  https://image.tmdb.org/p/2.jpg  ')).toBe('loading')
  })
})

describe('posterSrcWithReloadToken', () => {
  it('leaves URL unchanged before first retry', () => {
    expect(posterSrcWithReloadToken('https://example.com/a.jpg', 0)).toBe(
      'https://example.com/a.jpg',
    )
  })

  it('appends query param on retry', () => {
    expect(posterSrcWithReloadToken('https://example.com/a.jpg', 1)).toBe(
      'https://example.com/a.jpg?poster_retry=1',
    )
  })

  it('uses ampersand when URL already has query string', () => {
    expect(posterSrcWithReloadToken('https://example.com/a.jpg?w=500', 2)).toBe(
      'https://example.com/a.jpg?w=500&poster_retry=2',
    )
  })
})

describe('isPosterLoadEventCurrent', () => {
  it('accepts only matching load generation', () => {
    expect(isPosterLoadEventCurrent(3, 3)).toBe(true)
    expect(isPosterLoadEventCurrent(2, 3)).toBe(false)
  })
})

describe('shouldShowDrawerPosterImage', () => {
  it('shows img during load path and after success', () => {
    expect(shouldShowDrawerPosterImage('loading')).toBe(true)
    expect(shouldShowDrawerPosterImage('retrying')).toBe(true)
    expect(shouldShowDrawerPosterImage('loaded')).toBe(true)
  })

  it('hides img for empty and failed panels', () => {
    expect(shouldShowDrawerPosterImage('empty')).toBe(false)
    expect(shouldShowDrawerPosterImage('failed')).toBe(false)
  })
})
