import { Badge } from '@/components/ui/badge'
import { getGenreChipSurfaceStyle, normalizeGenreHex } from '@/lib/genreColor'
import { cn } from '@/lib/utils'

const chipClass = 'h-5 shrink-0 rounded-full px-3 text-[0.68rem] transition-colors duration-150'

export interface GenreBadgesListProps {
  genres: string[]
  /** `meta.genre_palette` — missing / invalid keys 用 outline. */
  genrePalette: Record<string, string> | null
  className?: string
}

/**
 * P9.2: Drawer 内 genre 色标；与 `meta.genre_palette` 同源。Tooltip 仅用纯文字+genre 色，不用本组件。
 */
export function GenreBadgesList({ genres, genrePalette, className }: GenreBadgesListProps) {
  if (genres.length === 0) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {genres.map((g, i) => {
        const raw = genrePalette?.[g]?.trim()
        const n = raw ? normalizeGenreHex(raw) : null
        const isGenre = n != null
        return (
          <Badge key={`${g}-${i}`} variant={isGenre ? 'genre' : 'outline'} className={chipClass} style={isGenre ? getGenreChipSurfaceStyle(n) : undefined}>
            {g}
          </Badge>
        )
      })}
    </div>
  )
}
