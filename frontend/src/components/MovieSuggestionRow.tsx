import type { MouseEventHandler } from 'react'

import { HighlightedText } from '@/components/HighlightedText'
import { cn } from '@/lib/utils'
import type { TextHighlightRange } from '@/utils/searchScore'

export interface MovieSuggestionRowProps {
  displayTitle: string
  originalTitle: string | null
  releaseYear: string | null
  tmdbId: number
  displayTitleHighlightRanges: TextHighlightRange[]
  originalTitleHighlightRanges: TextHighlightRange[]
  active: boolean
  onSelect: () => void
  onPointerEnter: () => void
  onMouseDown: MouseEventHandler<HTMLButtonElement>
}

/**
 * Shared movie result presentation for title and TMDB-ID search paths.
 * It is intentionally display-only: the owning list handles selection state and effects.
 */
export function MovieSuggestionRow({
  displayTitle,
  originalTitle,
  releaseYear,
  tmdbId,
  displayTitleHighlightRanges,
  originalTitleHighlightRanges,
  active,
  onSelect,
  onPointerEnter,
  onMouseDown,
}: MovieSuggestionRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={cn(
        'flex w-full min-w-0 flex-col gap-0.5 px-3 py-2 text-start transition-colors',
        active ? 'bg-muted text-foreground' : 'hover:bg-muted/60',
      )}
      onPointerEnter={onPointerEnter}
      onMouseDown={onMouseDown}
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">
          <HighlightedText text={displayTitle} ranges={displayTitleHighlightRanges} />
        </span>
        <span
          dir="ltr"
          className="shrink-0 rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none tabular-nums text-muted-foreground"
        >
          TMDB {tmdbId}
        </span>
      </span>
      {(originalTitle || releaseYear) && (
        <span className="flex min-w-0 items-baseline gap-1.5 text-xs leading-snug text-muted-foreground">
          {originalTitle && (
            <span className="min-w-0 flex-1 truncate">
              <HighlightedText text={originalTitle} ranges={originalTitleHighlightRanges} />
            </span>
          )}
          {originalTitle && releaseYear && <span aria-hidden="true">·</span>}
          {releaseYear && (
            <span dir="ltr" className="shrink-0 tabular-nums">
              {releaseYear}
            </span>
          )}
        </span>
      )}
    </button>
  )
}