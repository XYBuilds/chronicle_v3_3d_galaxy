import { describe, expect, it } from 'vitest'

import { EXIT_CODES } from './args.js'
import { assertP3911CheckpointCRadius, renderP3911CheckpointCRadiusInBrowser } from './p3911CheckpointCRadius.js'

const args = { movieId: 157336, output: '/tmp/p3911.png', resolution: 3000, padding: 0.08, bloom: 'on' as const, sizeRoot: 3 as const, renderMode: 'shader' as const }

describe('P39.11 Checkpoint C2 radius diagnostics boundary', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 0.01, 0.2, 0.6, 2])('rejects invalid radius %s', (radius) => {
    expect(() => assertP3911CheckpointCRadius(radius)).toThrow(/one of 0, 0.5, 1/)
  })

  it.each([
    ['wrong movieId', { ...args, movieId: 1 }],
    ['basic renderMode', { ...args, renderMode: 'basic' as const }],
    ['explicit bloomStrength', { ...args, bloomStrength: 0 }],
  ])('rejects %s before browser startup', async (_label, invalidArgs) => {
    await expect(renderP3911CheckpointCRadiusInBrowser(invalidArgs, { kind: 'file', label: 'fixture', bytes: Buffer.from('{}') }, process.cwd(), 0.5))
      .rejects.toMatchObject({ exitCode: EXIT_CODES.arguments })
  })

  it('fails before browser startup outside the fixed offline evidence contract', async () => {
    await expect(renderP3911CheckpointCRadiusInBrowser({ ...args, bloom: 'off' }, { kind: 'file', label: 'fixture', bytes: Buffer.from('{}') }, process.cwd(), 0.5))
      .rejects.toMatchObject({ exitCode: EXIT_CODES.arguments })
  })
})