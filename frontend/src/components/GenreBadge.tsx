import { Badge } from '@/components/ui/badge'
import { CloseButton } from '@/components/ui/close-button'
import { getGenreChipSurfaceStyle, normalizeGenreHex } from '@/lib/genreColor'
import { cn } from '@/lib/utils'

const chipClassMd =
  'h-7 max-w-full shrink-0 rounded-full text-[0.72rem] font-medium transition-colors duration-150'
/** Candidate grid — one step smaller than selected strip. */
const chipClassSm =
  'h-6 max-w-full shrink-0 rounded-full text-[0.62rem] font-medium transition-colors duration-150'

export interface GenreBadgeProps {
  name: string
  /** sRGB hex from `meta.genre_palette`; outline treatment when missing / invalid. */
  paletteHex?: string | null
  selected?: boolean
  disabled?: boolean
  /** Shown after the label when set (unselected grid: predicted intersection size). */
  previewCount?: number
  onClick?: () => void
  /** Selected strip: optional remove control. */
  onRemove?: () => void
  removeAriaLabel?: string
  /** `sm` — SearchBar genre grid candidates; default strip / removable row stays `md`. */
  size?: 'md' | 'sm'
}

/**
 * Interactive genre chip for SearchBar AND-filter UI (P21.3).
 * Mirrors {@link GenreBadgesList} styling; adds selected / disabled / preview states.
 */
export function GenreBadge({
  name,
  paletteHex,
  selected = false,
  disabled = false,
  previewCount,
  onClick,
  onRemove,
  removeAriaLabel,
  size = 'md',
}: GenreBadgeProps) {
  const raw = paletteHex?.trim()
  const n = raw ? normalizeGenreHex(raw) : null
  const isGenre = n != null
  const surface = isGenre && n ? getGenreChipSurfaceStyle(n) : undefined

  const label = (
    <>
      <span className="truncate">{name}</span>
      {previewCount != null && (
        <span className="tabular-nums text-muted-foreground">({previewCount})</span>
      )}
    </>
  )

  if (onRemove) {
    return (
      <Badge
        variant={isGenre ? 'genre' : 'outline'}
        className={cn(chipClassMd, 'inline-flex max-w-full items-center gap-1 px-2 pr-1')}
        style={surface}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1 pl-1">{label}</span>
        <CloseButton
          variant="ghostSm"
          label={removeAriaLabel ?? 'Remove'}
          className="size-6 shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        />
      </Badge>
    )
  }

  const chipClass = size === 'sm' ? chipClassSm : chipClassMd

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full border border-transparent text-left',
        size === 'sm' ? 'gap-0.5 px-2 py-px' : 'gap-1 px-3 py-0.5',
        chipClass,
        disabled && 'cursor-not-allowed opacity-40',
        !disabled && 'cursor-pointer',
        !disabled && !selected && 'hover:brightness-110 dark:hover:brightness-125',
        !isGenre && 'border-border bg-muted/40 text-foreground',
        /** `badge-genre` only pairs with Badge `group/badge`; plain buttons need `.genre-chip-tint` + `--genre-color` (see index.css). */
        isGenre && n && 'genre-chip-tint text-foreground',
        selected && isGenre && n && 'ring-1 ring-foreground/25',
      )}
      style={isGenre && n ? surface : undefined}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1">{label}</span>
    </button>
  )
}
