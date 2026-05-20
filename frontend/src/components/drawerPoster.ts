import type { PosterLoadState } from '@/components/drawerPosterA11y'

/** Initial poster state when DrawerPoster mounts or remounts (movie / URL change). */
export function getInitialPosterLoadState(posterUrl: string): PosterLoadState {
  return posterUrl.trim() ? 'loading' : 'empty'
}

/** Append cache-bust query on manual retry (reloadToken 0 keeps URL unchanged). */
export function posterSrcWithReloadToken(url: string, reloadToken: number): string {
  if (reloadToken === 0) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}poster_retry=${reloadToken}`
}

/** Ignore stale img onLoad/onError after movie switch or retry bumps generation. */
export function isPosterLoadEventCurrent(eventGen: number, currentGen: number): boolean {
  return eventGen === currentGen
}

/** Whether the poster image element should render (loading path keeps img in DOM). */
export function shouldShowDrawerPosterImage(state: PosterLoadState): boolean {
  return state === 'loading' || state === 'retrying' || state === 'loaded'
}
