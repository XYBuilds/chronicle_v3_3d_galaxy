/** Poster load state machine (Drawer P31.2–31.3). */
export type PosterLoadState = 'empty' | 'loading' | 'loaded' | 'failed' | 'retrying'

export type DrawerPosterStatusStrings = {
  empty: string
  loading: string
  failed: string
  retrying: string
}

/** Screen-reader status for dynamic poster transitions; omit when loaded (img alt suffices). */
export function getDrawerPosterStatusMessage(
  state: PosterLoadState,
  poster: DrawerPosterStatusStrings,
): string | undefined {
  switch (state) {
    case 'empty':
      return poster.empty
    case 'loading':
      return poster.loading
    case 'retrying':
      return poster.retrying
    case 'failed':
      return poster.failed
    case 'loaded':
      return undefined
    default:
      return undefined
  }
}

/** Hide in-flight / failed image from AT until a successful load (avoids premature alt). */
export function isDrawerPosterImageAriaHidden(state: PosterLoadState): boolean {
  return state !== 'loaded'
}
