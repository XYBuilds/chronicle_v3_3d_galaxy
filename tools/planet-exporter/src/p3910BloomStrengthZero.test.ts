import { describe, expect, it } from 'vitest'

import { EXIT_CODES } from './args.js'
import {
  assertP3910BloomStrengthZeroArgs,
  p3910BloomStrengthZeroSearchParams,
  renderP3910BloomStrengthZeroInBrowser,
} from './p3910BloomStrengthZero.js'

const args = { movieId: 157336, output: '/tmp/p3910.png', resolution: 128, padding: 0.08, bloom: 'on' as const, sizeRoot: 3 as const, renderMode: 'shader' as const }
const source = { kind: 'file' as const, label: 'fixture', bytes: Buffer.from('{}') }

describe('P39.10 strength-zero evidence boundary', () => {
  it('builds only the dedicated diagnostic request with a fixed zero strength', () => {
    const params = p3910BloomStrengthZeroSearchParams(args)
    expect(params.get('p3910BloomStrengthZero')).toBe('0')
    expect(params.get('bloom')).toBe('on')
    expect(params.has('bloomStrength')).toBe(false)
    expect(params.has('bloom-strength')).toBe(false)
  })

  it.each([
    ['wrong movieId', { ...args, movieId: 1 }],
    ['Bloom OFF', { ...args, bloom: 'off' as const }],
    ['basic render mode', { ...args, renderMode: 'basic' as const }],
  ])('rejects %s before browser startup', async (_label, invalidArgs) => {
    expect(() => assertP3910BloomStrengthZeroArgs(invalidArgs)).toThrow(/requires TMDB 157336, Bloom ON, and shader mode/)
    await expect(renderP3910BloomStrengthZeroInBrowser(invalidArgs, source, process.cwd()))
      .rejects.toMatchObject({ exitCode: EXIT_CODES.arguments })
  })
})