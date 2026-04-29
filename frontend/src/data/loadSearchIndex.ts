import { fetchGunzippedJson, type GalaxyGzipProgress } from '@/data/loadGalaxyGzip'
import { parseAndValidateSearchIndex } from '@/data/validateSearchIndex'
import type { SearchIndex } from '@/types/searchIndex'

export type { GalaxyGzipProgress } from '@/data/loadGalaxyGzip'

const DEFAULT_RELATIVE = 'data/galaxy_search_index.json.gz'

function withBase(relativePath: string): string {
  const base = import.meta.env.BASE_URL
  const prefix = base.endsWith('/') ? base : `${base}/`
  const trimmed = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  return `${prefix}${trimmed}`
}

/** Vite `base`-aware default URL for the gzip asset. */
export function searchIndexDefaultUrl(): string {
  return withBase(DEFAULT_RELATIVE)
}

export interface LoadSearchIndexOptions {
  url?: string
  /** When provided, validates genre keys match `GalaxyData.meta.genre_palette` (Tech Spec §4.5.2). */
  genrePaletteKeys?: readonly string[] | null
  onProgress?: (p: GalaxyGzipProgress) => void
}

/**
 * Fetch `galaxy_search_index.json.gz`, gunzip, parse JSON, validate (Phase 12.1).
 */
export async function loadSearchIndex(options?: string | LoadSearchIndexOptions): Promise<SearchIndex> {
  const url = typeof options === 'string' ? options : (options?.url ?? searchIndexDefaultUrl())
  const genrePaletteKeys =
    typeof options === 'string' || options === undefined ? null : (options.genrePaletteKeys ?? null)
  const onProgress = typeof options === 'string' ? undefined : options?.onProgress

  const raw = await fetchGunzippedJson(url, onProgress)
  const data = parseAndValidateSearchIndex(raw, genrePaletteKeys)

  const nPeople = Object.keys(data.people).length
  const nGenres = Object.keys(data.genres).length
  const approxKb = (JSON.stringify(data).length / 1024).toFixed(1)
  console.log(`[SearchIndex] persons=${nPeople} genres=${nGenres} size≈${approxKb}kB (json) version=${data.version}`)

  return data
}
