import { describe, expect, it } from 'vitest'

import { parseRiskDeclaration, requiredOwnerCheckGroups } from './riskDeclaration.js'

describe('risk declaration', () => {
  it('parses a valid human declaration', () => {
    const declaration = parseRiskDeclaration({
      schema: 'chronicle-risk-declaration-v1',
      tier: 'R1',
      surfaces: ['visual_output'],
      notes: 'Storybook catalog only',
    })
    expect(declaration.tier).toBe('R1')
    expect(requiredOwnerCheckGroups(declaration)).toEqual([
      'frontend-core',
      'git-hygiene',
      'storybook',
    ])
  })

  it('requires journeys for R2 without forcing Planet Export unless declared', () => {
    const declaration = parseRiskDeclaration({
      schema: 'chronicle-risk-declaration-v1',
      tier: 'R2',
      surfaces: [],
    })
    expect(requiredOwnerCheckGroups(declaration)).toContain('app-journeys')
    expect(requiredOwnerCheckGroups(declaration)).toContain('storybook')
    expect(requiredOwnerCheckGroups(declaration)).not.toContain('planet-export')
  })

  it('rejects path-classifier style unknown surfaces', () => {
    expect(() =>
      parseRiskDeclaration({
        schema: 'chronicle-risk-declaration-v1',
        tier: 'R0',
        surfaces: ['guessed_from_paths'],
      }),
    ).toThrow(/unknown surface/)
  })
})
