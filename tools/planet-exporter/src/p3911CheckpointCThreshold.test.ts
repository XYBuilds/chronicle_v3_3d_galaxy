import { describe, expect, it } from 'vitest'

import { EXIT_CODES } from './args.js'
import { assertP3911CheckpointCThreshold, renderP3911CheckpointCThresholdInBrowser } from './p3911CheckpointCThreshold.js'

const args = { movieId: 157336, output: '/tmp/p3911.png', resolution: 3000, padding: 0.08, bloom: 'on' as const, sizeRoot: 3 as const, renderMode: 'shader' as const }

describe('P39.11 Checkpoint C1 threshold diagnostics boundary', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 0.01, 0.2])('rejects invalid threshold %s', (threshold) => {
    expect(() => assertP3911CheckpointCThreshold(threshold)).toThrow(/one of 0, 0.05, 0.1/)
  })

  it.each([
    ['wrong movieId', { ...args, movieId: 1 }],
    ['basic renderMode', { ...args, renderMode: 'basic' as const }],
    ['explicit bloomStrength', { ...args, bloomStrength: 0 }],
  ])('rejects %s before browser startup', async (_label, invalidArgs) => {
    await expect(renderP3911CheckpointCThresholdInBrowser(invalidArgs, { kind: 'file', label: 'fixture', bytes: Buffer.from('{}') }, process.cwd(), 0.05))
      .rejects.toMatchObject({ exitCode: EXIT_CODES.arguments })
  })

  it('fails before browser startup outside the fixed offline evidence contract', async () => {
    await expect(renderP3911CheckpointCThresholdInBrowser({ ...args, bloom: 'off' }, { kind: 'file', label: 'fixture', bytes: Buffer.from('{}') }, process.cwd(), 0.05))
      .rejects.toMatchObject({ exitCode: EXIT_CODES.arguments })
  })
})