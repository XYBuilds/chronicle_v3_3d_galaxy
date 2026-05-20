import type { SearchHudTab } from '@/components/SearchBar'

export type SearchBarPlaceholderStrings = {
  placeholderDisabled: string
  placeholderMovie: string
  placeholderPerson: string
}

/** Text input placeholder for movie/person tabs; genre tab uses chip UI instead. */
export function getSearchBarTextPlaceholder(
  isBlocked: boolean,
  hudTab: SearchHudTab,
  ui: SearchBarPlaceholderStrings,
): string {
  if (isBlocked) return ui.placeholderDisabled
  if (hudTab === 'movie') return ui.placeholderMovie
  return ui.placeholderPerson
}
