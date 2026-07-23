export function isIdQueryEvaluationCurrent(query: string, evaluatedQuery: string): boolean {
  return query === evaluatedQuery
}

/** Enter selects the current highlight, or the first visible candidate when none is highlighted. */
export function resolveEnterSuggestionIndex(
  isListOpen: boolean,
  candidateCount: number,
  highlightIndex: number,
): number | null {
  if (!isListOpen || candidateCount === 0) return null
  if (highlightIndex < 0) return 0
  return Math.min(highlightIndex, candidateCount - 1)
}

export interface IdTabInputState {
  /** The user's independent ID-search text; never mirrored into the global search query. */
  readonly query: string
  /** Editing suppresses the selected-movie echo until selection changes again. */
  readonly isEditing: boolean
  /** Last focus value observed by the SearchBar. */
  readonly observedSelectedMovieId: number | null
}

export const INITIAL_ID_TAB_INPUT_STATE: IdTabInputState = Object.freeze({
  query: '',
  isEditing: false,
  observedSelectedMovieId: null,
})

export function enterIdTabFocusEcho(state: IdTabInputState, selectedMovieId: number): IdTabInputState {
  return { ...state, isEditing: false, observedSelectedMovieId: selectedMovieId }
}

/** Re-enter focus-echo mode only for a new focus value; editing remains local otherwise. */
export function reconcileIdTabFocus(
  state: IdTabInputState,
  selectedMovieId: number | null,
): IdTabInputState {
  if (state.observedSelectedMovieId === selectedMovieId) return state
  return selectedMovieId === null
    ? { ...state, isEditing: false, observedSelectedMovieId: null }
    : enterIdTabFocusEcho(state, selectedMovieId)
}

/** A user edit leaves focus-echo mode without changing the current movie focus. */
export function beginIdTabQueryEdit(state: IdTabInputState, query: string): IdTabInputState {
  return { ...state, query, isEditing: true }
}

/** Explicit clear resets local search text; selected focus is cleared by the caller's store action. */
export function clearIdTabInput(state: IdTabInputState): IdTabInputState {
  return { ...state, query: '', isEditing: false }
}

/** The selected TMDB ID is presentation-only and never becomes the ID query. */
export function getIdTabInputValue(
  state: IdTabInputState,
  selectedMovieId: number | null,
): string {
  return selectedMovieId !== null && !state.isEditing ? String(selectedMovieId) : state.query
}

export function isIdTabFocusEcho(state: IdTabInputState, selectedMovieId: number | null): boolean {
  return selectedMovieId !== null && !state.isEditing
}