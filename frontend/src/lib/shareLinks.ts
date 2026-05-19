import { buildMoviePath } from '@/lib/routes'

export function movieReleaseYearFromIso(releaseDate: string): string {
  const trimmed = releaseDate.trim()
  return trimmed.length >= 4 ? trimmed.slice(0, 4) : '\u2014'
}

export interface SocialShareUrls {
  x: string
  facebook: string
  telegram: string
  reddit: string
  discord: string
  email: string
}

/** Absolute share URL for `/movie/:id` (includes deploy base path and current query). */
export function buildMovieSharePageUrl(
  movieId: number,
  loc: Pick<Location, 'origin' | 'search'> = window.location,
): string {
  const path = buildMoviePath(movieId, loc.search)
  return new URL(path, loc.origin).href
}

/** P28.3: production invite via ``VITE_DISCORD_INVITE_URL``; generic fallback otherwise. */
export function discordCommunityHref(): string {
  const raw = import.meta.env.VITE_DISCORD_INVITE_URL
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (t && /^https?:\/\//i.test(t)) return t
  return 'https://discord.com/'
}

export function buildSocialShareUrls(shareTitle: string, shareText: string, url: string): SocialShareUrls {
  const body = `${shareText}\n\n${url}`
  return {
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(body)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`,
    reddit: `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(shareTitle)}`,
    discord: discordCommunityHref(),
    email: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(body)}`,
  }
}
