import { describe, expect, it } from 'vitest'

import {
  beginIdTabQueryEdit,
  clearIdTabInput,
  getIdTabInputValue,
  INITIAL_ID_TAB_INPUT_STATE,
  isIdQueryEvaluationCurrent,
  isIdTabFocusEcho,
  reconcileIdTabFocus,
  resolveEnterSuggestionIndex,
} from '@/components/idTabInputState'

describe('ID tab focus echo state', () => {
  it('echoes a newly selected movie without treating it as a query', () => {
    const focused = reconcileIdTabFocus(INITIAL_ID_TAB_INPUT_STATE, 550)

    expect(getIdTabInputValue(focused, 550)).toBe('550')
    expect(isIdTabFocusEcho(focused, 550)).toBe(true)
    expect(focused.query).toBe('')
  })

  it('switches from focus echo to an independent ID query on edit', () => {
    const focused = reconcileIdTabFocus(INITIAL_ID_TAB_INPUT_STATE, 550)
    const editing = beginIdTabQueryEdit(focused, '5501')

    expect(getIdTabInputValue(editing, 550)).toBe('5501')
    expect(isIdTabFocusEcho(editing, 550)).toBe(false)
  })

  it('clears an old ID query when focus changes to another movie', () => {
    const focused = reconcileIdTabFocus(INITIAL_ID_TAB_INPUT_STATE, 550)
    const editing = beginIdTabQueryEdit(focused, '129')
    const nextFocus = reconcileIdTabFocus(editing, 680)

    expect(nextFocus.query).toBe('')
    expect(getIdTabInputValue(nextFocus, 680)).toBe('680')
  })

  it('clears the echo when focus exits but preserves a user query', () => {
    const focused = reconcileIdTabFocus(INITIAL_ID_TAB_INPUT_STATE, 550)
    const unfocused = reconcileIdTabFocus(focused, null)
    const editing = beginIdTabQueryEdit(focused, '5501')
    const stillEditingAfterFocusExit = reconcileIdTabFocus(editing, null)

    expect(getIdTabInputValue(unfocused, null)).toBe('')
    expect(getIdTabInputValue(stillEditingAfterFocusExit, null)).toBe('5501')
  })

  it('clears local query state without restoring the current focus echo', () => {
    const focused = reconcileIdTabFocus(INITIAL_ID_TAB_INPUT_STATE, 550)
    const state = beginIdTabQueryEdit(focused, '5501')
    const cleared = clearIdTabInput(state)

    expect(cleared).toMatchObject({
      query: '',
      isEditing: true,
      observedSelectedMovieId: 550,
    })
    expect(getIdTabInputValue(cleared, 550)).toBe('')
    expect(isIdTabFocusEcho(cleared, 550)).toBe(false)
  })
})

describe('ID tab interaction decisions', () => {
  it('uses the first candidate for Enter when no row is highlighted', () => {
    expect(resolveEnterSuggestionIndex(true, 3, -1)).toBe(0)
    expect(resolveEnterSuggestionIndex(true, 3, 2)).toBe(2)
    expect(resolveEnterSuggestionIndex(true, 3, 9)).toBe(2)
    expect(resolveEnterSuggestionIndex(false, 3, -1)).toBeNull()
    expect(resolveEnterSuggestionIndex(true, 0, -1)).toBeNull()
  })

  it('only exposes ID feedback after the current query has been evaluated', () => {
    expect(isIdQueryEvaluationCurrent('1234', '123')).toBe(false)
    expect(isIdQueryEvaluationCurrent('1234', '1234')).toBe(true)
    expect(isIdQueryEvaluationCurrent('', '1234')).toBe(false)
  })
})