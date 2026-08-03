import {
  decideEscapePriority,
  type ExplorationContext,
  type ExplorationIntent,
} from '@/lib/exploration'

export type AppEscapeEvent = {
  preventDefault: () => void
  stopPropagation: () => void
}

export type AppEscapeDependencies = {
  readContext: () => ExplorationContext
  dispatchIntent: (intent: ExplorationIntent) => void
  clearSearchDraft: () => void
}

export type AppEscapeInput = {
  event: AppEscapeEvent
  infoDialogActive: boolean
  searchInput: { blur: () => void } | null
  dependencies: AppEscapeDependencies
}

/** Executes the single capture-phase Escape action selected for App-owned surfaces. */
export function executeAppEscape({
  event,
  infoDialogActive,
  searchInput,
  dependencies,
}: AppEscapeInput): void {
  const action = decideEscapePriority({
    infoDialogActive,
    searchInputFocused: searchInput !== null,
    context:
      infoDialogActive || searchInput !== null
        ? { kind: 'idle' }
        : dependencies.readContext(),
  })

  if (action.type === 'ignored') return

  if (action.type === 'blur-search-input') {
    searchInput?.blur()
    event.preventDefault()
    event.stopPropagation()
    return
  }

  dependencies.dispatchIntent(action.intent)
  if (action.intent.type === 'select/cleared') {
    dependencies.clearSearchDraft()
  }
  console.log('[ESC] handle one exploration layer', {
    intent: action.intent.type,
  })
  event.preventDefault()
  event.stopPropagation()
}