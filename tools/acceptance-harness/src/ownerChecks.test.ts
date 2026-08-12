import { describe, expect, it } from 'vitest'

import { formatOwnerCheckMatrix, selectOwnerChecks } from './ownerChecks.js'
import { parseRiskDeclaration } from './riskDeclaration.js'

describe('owner check composition', () => {
  it('lists journey and storybook commands for an R2 declaration with visual/browser surfaces', () => {
    const declaration = parseRiskDeclaration({
      schema: 'chronicle-risk-declaration-v1',
      tier: 'R2',
      surfaces: ['visual_output', 'browser_journey', 'planet_export'],
    })
    const checks = selectOwnerChecks(declaration)
    const matrix = formatOwnerCheckMatrix(checks)
    expect(matrix).toContain('test:journeys')
    expect(matrix).toContain('build-storybook')
    expect(matrix).toContain('planet-exporter')
  })
})
