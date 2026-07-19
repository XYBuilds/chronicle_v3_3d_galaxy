import { describe, expect, it } from 'vitest'

import { EXIT_CODES } from './args.js'
import { assertP3911CheckpointBExponent, renderP3911CheckpointBInBrowser } from './p3911CheckpointB.js'

const args = { movieId: 157336, output: '/tmp/p3911.png', resolution: 3000, padding: 0.08, bloom: 'off' as const, sizeRoot: 3 as const, renderMode: 'shader' as const }

describe('P39.11 Checkpoint B diagnostics boundary', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -0.01, 2.6, 3.4])('rejects invalid exponent %s', (exponent) => {
    expect(() => assertP3911CheckpointBExponent(exponent)).toThrow(/one of 3, 2.5, 2/)
  })

  it('fails before browser startup outside the fixed offline evidence contract', async () => {
    await expect(renderP3911CheckpointBInBrowser({ ...args, bloom: 'on' }, { kind: 'file', label: 'fixture', bytes: Buffer.from('{}') }, process.cwd(), 2.5))
      .rejects.toMatchObject({ exitCode: EXIT_CODES.arguments })
  })
})