import type { ReactNode } from 'react'

import type { TextHighlightRange } from '@/utils/searchScore'

export interface HighlightedTextProps {
  text: string
  ranges: readonly TextHighlightRange[]
}

/** Pure text renderer shared by independent search-result rows. */
export function HighlightedText({ text, ranges }: HighlightedTextProps): ReactNode {
  if (ranges.length === 0) return text

  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const parts: ReactNode[] = []
  let cursor = 0
  let key = 0
  for (const range of sorted) {
    if (range.start > cursor) {
      parts.push(<span key={`text-${key++}`}>{text.slice(cursor, range.start)}</span>)
    }
    parts.push(
      <mark key={`match-${key++}`} className="rounded-sm bg-primary/30 text-inherit">
        {text.slice(range.start, range.end)}
      </mark>,
    )
    cursor = range.end
  }
  if (cursor < text.length) {
    parts.push(<span key={`text-${key++}`}>{text.slice(cursor)}</span>)
  }
  return parts
}