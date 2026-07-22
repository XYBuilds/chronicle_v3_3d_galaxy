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


  it('treats every file data source as an explicit legacy compatibility fixture', () => {
    const file = { kind: 'file', label: 'manual fixture', bytes: Buffer.from('{}') } as const
    const url = { kind: 'url', label: 'https://example.test/data.json.gz', pageUrl: 'https://example.test/data.json.gz' } as const
    expect(phase41DiagnosticSearchParams(args, undefined, file).get('allowLegacyProfile')).toBe('1')
    expect(phase41DiagnosticSearchParams(args, undefined, url).has('allowLegacyProfile')).toBe(false)
  })

  it('carries the exact active pointer and immutable profile URL into diagnostic evidence requests', () => {
    const source = {
      kind: 'manifest', label: 'https://assets.example.test/galaxy_data.json.gz', pageUrl: 'https://assets.example.test/galaxy_data.json.gz',
      profileUrl: 'https://assets.example.test/galaxy/focus-emission-profiles/rating-emission-2026-07-a.json',
      focusEmissionProfile: {
        profile_id: 'rating-emission-2026-07-a', period: '2026-07', model_version: 'rating-midrank-cdf-lut-v1',
        curve_sha256: 'a'.repeat(64), source_data_version: 'fixture-monthly', source_movie_count: 4,
        status: 'active', activated_at: '2026-07-22T00:00:00.000Z',
      },
    } as const
    const params = phase41DiagnosticSearchParams(args, undefined, source)

    expect(JSON.parse(params.get('profilePointer')!)).toEqual(source.focusEmissionProfile)
    expect(params.get('profileUrl')).toBe(source.profileUrl)
    expect(params.has('allowLegacyProfile')).toBe(false)
  })

  it('rejects a profile that lacks the marker', () => {
    expect(() => phase41DiagnosticSearchParams(args, {
      diagnostic_only: 'wrong' as typeof PHASE41_DIAGNOSTIC_MARKER,
      lightness: 0.5,
    })).toThrow(/diagnostic_only marker/)
  })
})
