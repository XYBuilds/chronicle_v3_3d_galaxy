import { describe, expect, it } from 'vitest'

import {
  orbitDirectionSign,
  resolveOrbitDragDirectionModeFromInputs,
} from '@/utils/orbitDragDirection'

describe('orbitDirectionSign', () => {
  it('normal keeps positive multiplier semantics for inverted delta formula', () => {
    expect(orbitDirectionSign('normal')).toBe(1)
    expect(orbitDirectionSign('inverted')).toBe(-1)
  })
})

describe('resolveOrbitDragDirectionModeFromInputs', () => {
  it('defaults to inverted', () => {
    expect(resolveOrbitDragDirectionModeFromInputs(undefined, null)).toBe('inverted')
    expect(resolveOrbitDragDirectionModeFromInputs('', 'bogus')).toBe('inverted')
  })

  it('honors query when window unset or invalid', () => {
    expect(resolveOrbitDragDirectionModeFromInputs(undefined, 'inverted')).toBe('inverted')
    expect(resolveOrbitDragDirectionModeFromInputs(undefined, 'normal')).toBe('normal')
  })

  it('window override wins over query', () => {
    expect(resolveOrbitDragDirectionModeFromInputs('normal', 'inverted')).toBe('normal')
    expect(resolveOrbitDragDirectionModeFromInputs('inverted', 'normal')).toBe('inverted')
  })
})
