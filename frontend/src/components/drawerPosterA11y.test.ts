import { describe, expect, it } from 'vitest'

import {
  getDrawerPosterStatusMessage,
  isDrawerPosterImageAriaHidden,
  type PosterLoadState,
} from '@/components/drawerPosterA11y'

const poster = {
  empty: 'No poster available',
  loading: 'Loading poster…',
  failed: 'Poster failed to load',
  retrying: 'Retrying poster…',
}

describe('getDrawerPosterStatusMessage', () => {
  it.each([
    ['empty', 'No poster available'],
    ['loading', 'Loading poster…'],
    ['retrying', 'Retrying poster…'],
    ['failed', 'Poster failed to load'],
  ] as const satisfies ReadonlyArray<[PosterLoadState, string]>)(
    'announces %s to screen readers',
    (state, expected) => {
      expect(getDrawerPosterStatusMessage(state, poster)).toBe(expected)
    },
  )

  it('returns undefined when loaded so img alt is the sole announcement', () => {
    expect(getDrawerPosterStatusMessage('loaded', poster)).toBeUndefined()
  })
})

describe('isDrawerPosterImageAriaHidden', () => {
  it('hides image from AT until loaded', () => {
    expect(isDrawerPosterImageAriaHidden('loading')).toBe(true)
    expect(isDrawerPosterImageAriaHidden('retrying')).toBe(true)
    expect(isDrawerPosterImageAriaHidden('failed')).toBe(true)
    expect(isDrawerPosterImageAriaHidden('empty')).toBe(true)
    expect(isDrawerPosterImageAriaHidden('loaded')).toBe(false)
  })
})
