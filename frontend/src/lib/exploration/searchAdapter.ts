import type { Movie } from '@/types/galaxy'
import type { SearchIndex } from '@/types/searchIndex'

import {
  buildGenreSelectSession,
  formatGenreSessionQuery,
} from './sessionBuilders'
import { dispatchExplorationIntent, readExplorationContext } from './storeAdapter'
import type { ExplorationContext, GenreSelectSession } from './types'

export type SelectRelationKind = 'person' | 'genre'
export type SearchLifecycleTab = 'movie' | 'person' | 'genre' | 'id'

/** Active Select sessions own the visible Person/Genre tab; local tabs remain unchanged otherwise. */
export function alignSearchTabToActiveSelect(
  currentTab: SearchLifecycleTab,
  activeRelation: SelectRelationKind | null,
): SearchLifecycleTab {
  return activeRelation ?? currentTab
}

export function hasActiveSelectRelation(
  context: ExplorationContext,
  relationKind: SelectRelationKind,
): boolean {
  const session =
    context.kind === 'select'
      ? context.session
      : context.kind === 'focus'
        ? context.parent
        : undefined
  return session?.relation.kind === relationKind
}

/** Clear only the requested Person/Genre parent session, including nested focus. */
export function clearActiveSelectSession(relationKind: SelectRelationKind): boolean {
  if (!hasActiveSelectRelation(readExplorationContext(), relationKind)) return false
  dispatchExplorationIntent({ type: 'select/cleared' })
  return true
}

export interface SearchClearAction {
  selectRelation: SelectRelationKind | null
  clearTextQuery: boolean
  clearGenreSelection: boolean
}

/** Pure decision for the local and lifecycle cleanup owned by a Search tab change. */
export function decideSearchTabChangeClear(
  currentTab: SearchLifecycleTab,
  nextTab: SearchLifecycleTab,
): SearchClearAction {
  if (currentTab === nextTab) {
    return { selectRelation: null, clearTextQuery: false, clearGenreSelection: false }
  }
  if (currentTab === 'person') {
    return { selectRelation: 'person', clearTextQuery: true, clearGenreSelection: false }
  }
  if (currentTab === 'genre') {
    return { selectRelation: 'genre', clearTextQuery: true, clearGenreSelection: true }
  }
  return {
    selectRelation: null,
    clearTextQuery: currentTab !== 'id' && nextTab !== 'id',
    clearGenreSelection: false,
  }
}

/** Pure decision for the local and lifecycle cleanup owned by explicit Clear. */
export function decideSearchExplicitClear(tab: SearchLifecycleTab): SearchClearAction {
  return {
    selectRelation: tab === 'person' || tab === 'genre' ? tab : null,
    clearTextQuery: tab !== 'id',
    clearGenreSelection: tab === 'genre',
  }
}

function applySelectClear(action: SearchClearAction): void {
  if (action.selectRelation !== null) clearActiveSelectSession(action.selectRelation)
}

/** Apply the lifecycle part once; SearchBar consumes the returned local-state action. */
export function applySearchTabChangeClear(
  currentTab: SearchLifecycleTab,
  nextTab: SearchLifecycleTab,
): SearchClearAction {
  const action = decideSearchTabChangeClear(currentTab, nextTab)
  applySelectClear(action)
  return action
}

/** Apply explicit lifecycle Clear once; SearchBar consumes the returned local-state action. */
export function applySearchExplicitClear(tab: SearchLifecycleTab): SearchClearAction {
  const action = decideSearchExplicitClear(tab)
  applySelectClear(action)
  return action
}

/** Title and TMDB ID lookup both create replacing focus and never inherit a Select parent. */
export function requestReplacingMovieFocus(movieId: number): ExplorationContext {
  return dispatchExplorationIntent({
    type: 'focus/requested',
    movieId,
    policy: 'replace',
  })
}

export function enterGenreSelectSession(args: {
  genreNames: readonly string[]
  searchIndex: SearchIndex
  movieById: ReadonlyMap<number, Movie>
}): { session: GenreSelectSession; searchQuery: string } | null {
  const session = buildGenreSelectSession(args)
  if (session === null) return null

  dispatchExplorationIntent({ type: 'select/entered', session })
  return {
    session,
    searchQuery: formatGenreSessionQuery(args.genreNames),
  }
}