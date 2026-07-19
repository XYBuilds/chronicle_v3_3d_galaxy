import { describe, expect, it } from 'vitest'

import { EXIT_CODES } from './args.js'
import { assertP3911CheckpointCStrength, renderP3911CheckpointCStrengthInBrowser } from './p3911CheckpointCStrength.js'

const args = { movieId: 157336, output: '/tmp/p3911.png', resolution: 3000, padding: 0.08, bloom: 'on' as const, sizeRoot: 3 as const, renderMode: 'shader' as const }
const source = { kind: 'file' as const, label: 'fixture', bytes: Buffer.from('{}') }

describe('P39.11 Checkpoint C3 strength diagnostics boundary', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.01, 0, 0.001, 0.003, 0.02])('rejects invalid strength %s', (strength) => {
    expect(() => assertP3911CheckpointCStrength(strength)).toThrow(/one of 0.0025, 0.005, 0.01/)
  })

  it.each([
    ['wrong movieId', { ...args, movieId: 1 }],
    ['Bloom OFF', { ...args, bloom: 'off' as const }],
    ['basic renderMode', { ...args, renderMode: 'basic' as const }],
    ['standard bloomStrength override', { ...args, bloomStrength: 0.005 }],
  ])('rejects %s before browser startup', async (_label, invalidArgs) => {
    await expect(renderP3911CheckpointCStrengthInBrowser(invalidArgs, source, process.cwd(), 0.005))
      .rejects.toMatchObject({ exitCode: EXIT_CODES.arguments })
  })
})