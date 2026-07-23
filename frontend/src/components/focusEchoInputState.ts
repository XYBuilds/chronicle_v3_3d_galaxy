export interface FocusEchoInputState {
  /** User-authored search text; the selected movie echo is presentation-only. */
  readonly query: string
  /** Editing suppresses the current selected-movie echo until focus changes. */
  readonly isEditing: boolean
  /** Last focus value observed by this input state. */
  readonly observedSelectedMovieId: number | null
}

export const INITIAL_FOCUS_ECHO_INPUT_STATE: FocusEchoInputState = Object.freeze({
  query: '',
  isEditing: false,
  observedSelectedMovieId: null,
})

export function shouldClearQueriesForFocusChange(
  previousSelectedMovieId: number | null,
  selectedMovieId: number | null,
): boolean {
  return selectedMovieId !== null && selectedMovieId !== previousSelectedMovieId
}

export function enterFocusEcho(
  state: FocusEchoInputState,
  selectedMovieId: number,
): FocusEchoInputState {
  return {
    ...state,
    query: '',
    isEditing: false,
    observedSelectedMovieId: selectedMovieId,
  }
}

/** A changed focus enters echo mode; edits remain local while the same movie stays focused. */
export function reconcileFocusEchoInput(
  state: FocusEchoInputState,
  selectedMovieId: number | null,
): FocusEchoInputState {
  if (state.observedSelectedMovieId === selectedMovieId) return state
  return selectedMovieId === null
    ? { ...state, isEditing: false, observedSelectedMovieId: null }
    : enterFocusEcho(state, selectedMovieId)
}

export function beginFocusEchoQueryEdit(
  state: FocusEchoInputState,
  query: string,
): FocusEchoInputState {
  return { ...state, query, isEditing: true }
}

/** Clear hides the current echo but deliberately leaves movie focus untouched. */
export function clearFocusEchoInput(state: FocusEchoInputState): FocusEchoInputState {
  return {
    ...state,
    query: '',
    isEditing: state.observedSelectedMovieId !== null,
  }
}

export function getFocusEchoInputValue(
  state: FocusEchoInputState,
  selectedMovieId: number | null,
  focusEchoValue: string,
): string {
  return selectedMovieId !== null && !state.isEditing ? focusEchoValue : state.query
}

export function isFocusEchoInput(
  state: FocusEchoInputState,
  selectedMovieId: number | null,
): boolean {
  return selectedMovieId !== null && !state.isEditing
}

/** Focus-echo visibility belongs to the active tab; one tab must not suppress another tab's results. */
export function isFocusEchoActiveForTab(
  tab: 'movie' | 'person' | 'genre' | 'id',
  movieFocusEcho: boolean,
  idFocusEcho: boolean,
): boolean {
  if (tab === 'movie') return movieFocusEcho
  if (tab === 'id') return idFocusEcho
  return false
}