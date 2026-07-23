import { describe, expect, it } from 'vitest'

import {
  beginFocusEchoQueryEdit,
  clearFocusEchoInput,
  getFocusEchoInputValue,
  INITIAL_FOCUS_ECHO_INPUT_STATE,
  isFocusEchoActiveForTab,
  isFocusEchoInput,
  reconcileFocusEchoInput,
  shouldClearQueriesForFocusChange,
} from '@/components/focusEchoInputState'

describe('focus echo input state', () => {
  it('shows a selected movie label without turning it into a query', () => {
    const focused = reconcileFocusEchoInput(INITIAL_FOCUS_ECHO_INPUT_STATE, 129)

    expect(
      getFocusEchoInputValue(focused, 129, 'Spirited Away / 千と千尋の神隠し'),
    ).toBe('Spirited Away / 千と千尋の神隠し')
    expect(isFocusEchoInput(focused, 129)).toBe(true)
    expect(focused.query).toBe('')
  })

  it('clears stale query text when entering or changing focus', () => {
    const stale = beginFocusEchoQueryEdit(INITIAL_FOCUS_ECHO_INPUT_STATE, 'spirited')
    const firstFocus = reconcileFocusEchoInput(stale, 129)
    const editedInFocus = beginFocusEchoQueryEdit(firstFocus, 'fight')
    const nextFocus = reconcileFocusEchoInput(editedInFocus, 550)

    expect(firstFocus).toMatchObject({ query: '', observedSelectedMovieId: 129 })
    expect(nextFocus).toMatchObject({ query: '', observedSelectedMovieId: 550 })
    expect(shouldClearQueriesForFocusChange(null, 129)).toBe(true)
    expect(shouldClearQueriesForFocusChange(129, 550)).toBe(true)
    expect(shouldClearQueriesForFocusChange(129, null)).toBe(false)
    expect(shouldClearQueriesForFocusChange(129, 129)).toBe(false)
  })

  it('switches only the edited input from focus echo to query mode', () => {
    const focused = reconcileFocusEchoInput(INITIAL_FOCUS_ECHO_INPUT_STATE, 129)
    const editing = beginFocusEchoQueryEdit(focused, 'spirited')

    expect(getFocusEchoInputValue(editing, 129, 'Spirited Away / 千と千尋の神隠し')).toBe(
      'spirited',
    )
    expect(isFocusEchoInput(editing, 129)).toBe(false)
    expect(isFocusEchoActiveForTab('movie', false, true)).toBe(false)
    expect(isFocusEchoActiveForTab('id', false, true)).toBe(true)
  })

  it('clears query or echo presentation while preserving the focused movie', () => {
    const focusedMovieId = 129
    const focused = reconcileFocusEchoInput(
      beginFocusEchoQueryEdit(INITIAL_FOCUS_ECHO_INPUT_STATE, 'spirited'),
      focusedMovieId,
    )
    const cleared = clearFocusEchoInput(focused)

    expect(cleared.query).toBe('')
    expect(cleared.isEditing).toBe(true)
    expect(cleared.observedSelectedMovieId).toBe(focusedMovieId)
    expect(getFocusEchoInputValue(cleared, focusedMovieId, 'Spirited Away')).toBe('')
  })
})