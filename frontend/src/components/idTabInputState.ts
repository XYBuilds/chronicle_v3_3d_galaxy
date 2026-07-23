import {
  beginFocusEchoQueryEdit,
  clearFocusEchoInput,
  enterFocusEcho,
  getFocusEchoInputValue,
  INITIAL_FOCUS_ECHO_INPUT_STATE,
  isFocusEchoInput,
  reconcileFocusEchoInput,
  type FocusEchoInputState,
} from '@/components/focusEchoInputState'

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

export type IdTabInputState = FocusEchoInputState

export const INITIAL_ID_TAB_INPUT_STATE = INITIAL_FOCUS_ECHO_INPUT_STATE

export function enterIdTabFocusEcho(
  state: IdTabInputState,
  selectedMovieId: number,
): IdTabInputState {
  return enterFocusEcho(state, selectedMovieId)
}

export function reconcileIdTabFocus(
  state: IdTabInputState,
  selectedMovieId: number | null,
): IdTabInputState {
  return reconcileFocusEchoInput(state, selectedMovieId)
}

/** A user edit leaves focus-echo mode without changing the current movie focus. */
export function beginIdTabQueryEdit(state: IdTabInputState, query: string): IdTabInputState {
  return beginFocusEchoQueryEdit(state, query)
}

/** Clear resets local search text while preserving the selected movie focus. */
export function clearIdTabInput(state: IdTabInputState): IdTabInputState {
  return clearFocusEchoInput(state)
}

/** The selected TMDB ID is presentation-only and never becomes the ID query. */
export function getIdTabInputValue(
  state: IdTabInputState,
  selectedMovieId: number | null,
): string {
  return getFocusEchoInputValue(
    state,
    selectedMovieId,
    selectedMovieId === null ? '' : String(selectedMovieId),
  )
}

export function isIdTabFocusEcho(
  state: IdTabInputState,
  selectedMovieId: number | null,
): boolean {
  return isFocusEchoInput(state, selectedMovieId)
}
