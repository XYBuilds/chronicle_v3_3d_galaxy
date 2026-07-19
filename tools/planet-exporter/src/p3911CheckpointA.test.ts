import { describe, expect, it } from 'vitest'

import { EXIT_CODES } from './args.js'
import { assertP3911CheckpointAKeyLightIntensity, renderP3911CheckpointAInBrowser } from './p3911CheckpointA.js'

const args = {
  movieId: 157336,
  output: '/tmp/p3911.png',
  resolution: 3000,
  padding: 0.08,
  bloom: 'off' as const,
  sizeRoot: 3 as const,
  renderMode: 'shader' as const,
}

describe('P39.11 Checkpoint A diagnostics boundary', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01])('rejects invalid Key override %s', (key) => {
    expect(() => assertP3911CheckpointAKeyLightIntensity(key)).toThrow(/finite and non-negative/)
  })

  it('fails before browser startup outside the fixed offline evidence contract', async () => {
    await expect(renderP3911CheckpointAInBrowser({ ...args, bloom: 'on' }, { kind: 'file', label: 'fixture', bytes: Buffer.from('{}') }, process.cwd(), 0.5))
      .rejects.toMatchObject({ exitCode: EXIT_CODES.arguments })
  })
})