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

  it('clears the echo when focus exits but preserves a user query', () => {
    const focused = reconcileIdTabFocus(INITIAL_ID_TAB_INPUT_STATE, 550)
    const unfocused = reconcileIdTabFocus(focused, null)
    const editing = beginIdTabQueryEdit(focused, '5501')
    const stillEditingAfterFocusExit = reconcileIdTabFocus(editing, null)

    expect(getIdTabInputValue(unfocused, null)).toBe('')
    expect(getIdTabInputValue(stillEditingAfterFocusExit, null)).toBe('5501')
  })

  it('clears local query state when the search clear action runs', () => {
    const state = beginIdTabQueryEdit(INITIAL_ID_TAB_INPUT_STATE, '550')
    expect(clearIdTabInput(state)).toMatchObject({ query: '', isEditing: false })
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