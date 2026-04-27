import { Badge } from '@/components/ui/badge'
import { getGenreChipSurfaceStyle, normalizeGenreHex } from '@/lib/genreColor'
import { cn } from '@/lib/utils'

const drawerChipClass = 'h-5 shrink-0 rounded-full px-3 text-[0.68rem] transition-colors duration-150'
const tooltipChipClass = 'h-4 shrink-0 rounded-full px-2 py-0 text-[0.62rem] font-medium'

export interface GenreBadgesListProps {
  genres: string[]
  /** `meta.genre_palette` — missing / invalid keys用 outline. */
  genrePalette: Record<string, string> | null
  /** `drawer` 与 `MovieTooltip` 字号对齐。 */
  size?: 'drawer' | 'tooltip'
  className?: string
}

/**
 * P9.2: 与 pipeline `genre_palette` 同源色标；多出处共享避免 Drawer / Tooltip 分叉。
 */
export function GenreBadgesList({ genres, genrePalette, size = 'drawer', className }: GenreBadgesListProps) {
  if (genres.length === 0) return null
  const chip = size === 'tooltip' ? tooltipChipClass : drawerChipClass
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {genres.map((g, i) => {
        const raw = genrePalette?.[g]?.trim()
        const n = raw ? normalizeGenreHex(raw) : null
        const isGenre = n != null
        return (
          <Badge key={`${g}-${i}`} variant={isGenre ? 'genre' : 'outline'} className={chip} style={isGenre ? getGenreChipSurfaceStyle(n) : undefined}>
            {g}
          </Badge>
        )
      })}
    </div>
  )
}
