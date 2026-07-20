import { describe, expect, it } from 'vitest'

import type { ExportArgs } from './args.js'
import {
  PHASE41_DIAGNOSTIC_MARKER,
  phase41DiagnosticSearchParams,
} from './phase41Diagnostic.js'

const args: ExportArgs = {
  movieId: 1,
  output: '/tmp/planet.png',
  resolution: 128,
  padding: 0.08,
  bloom: 'on',
  sizeRoot: 3,
  renderMode: 'shader',
}

describe('Phase 41 diagnostic adapter', () => {
  it('builds a marker-bound isolated diagnostic request without normal visual parameters', () => {
    const params = phase41DiagnosticSearchParams(args, {
      diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
      bloom: { enabled: true, strength: 0.01, radius: 1, threshold: 0 },
    })

    expect(params.get('diagnostic_only')).toBe(PHASE41_DIAGNOSTIC_MARKER)
    expect(params.get('profile')).toContain('"bloom"')
    expect(params.has('bloomStrength')).toBe(false)
    expect(params.has('bloom-strength')).toBe(false)
  })

  it('rejects a profile that lacks the marker', () => {
    expect(() => phase41DiagnosticSearchParams(args, {
      diagnostic_only: 'wrong' as typeof PHASE41_DIAGNOSTIC_MARKER,
      lightness: 0.5,
    })).toThrow(/diagnostic_only marker/)
  })
})