import { describe, expect, it } from 'vitest'
import { EXIT_CODES, CliError, parseArgs } from './args.js'

const resolvePath = (value: string): string => `/resolved/${value}`

describe('parseArgs', () => {
  it('parses required arguments and applies deterministic defaults', () => {
    expect(parseArgs(['--movie-id', '157336', '--output', 'planet.png'], resolvePath)).toEqual({
      movieId: 157336,
      output: '/resolved/planet.png',
      resolution: 3000,
      padding: 0.08,
      bloom: 'off',
      sizeRoot: 3,
      renderMode: 'shader',
      dataFile: undefined,
      dataUrl: undefined,
    })
  })

  it('accepts explicit basic mode with Bloom disabled', () => {
    expect(parseArgs(['--movie-id', '1', '--output', 'planet.png', '--render-mode', 'basic'], resolvePath).renderMode).toBe('basic')
  })
  it('rejects diagnostic visual parameters at the normal CLI boundary', () => {
    expect(() => parseArgs(['--movie-id', '1', '--output', 'planet.png', '--bloom-strength', '0'], resolvePath)).toThrow(CliError)
    expect(() => parseArgs(['--movie-id', '1', '--output', 'planet.png', '--diagnostic-only', 'phase41-visual-diagnostic-v1'], resolvePath)).toThrow(CliError)
  })

  it('preserves both data selectors so file priority can be applied later', () => {
    const args = parseArgs([
      '--movie-id', '1',
      '--output', 'planet.png',
      '--data-file', 'fixture.json',
      '--data-url', 'https://example.test/galaxy.json.gz',
    ], resolvePath)
    expect(args.dataFile).toBe('/resolved/fixture.json')
    expect(args.dataUrl).toBe('https://example.test/galaxy.json.gz')
  })

  it.each([2, 3, 4])('accepts size-root %i', (sizeRoot) => {
    expect(parseArgs(['--movie-id', '1', '--output', 'planet.png', '--size-root', String(sizeRoot)], resolvePath).sizeRoot).toBe(sizeRoot)
  })

  it.each([
    ['unknown option', ['--movie-id', '1', '--output', 'planet.png', '--wat', 'x']],
    ['duplicate option', ['--movie-id', '1', '--movie-id', '2', '--output', 'planet.png']],
    ['invalid resolution', ['--movie-id', '1', '--output', 'planet.png', '--resolution', '0']],
    ['invalid padding', ['--movie-id', '1', '--output', 'planet.png', '--padding', '0.5']],
    ['invalid size root', ['--movie-id', '1', '--output', 'planet.png', '--size-root', '5']],
    ['invalid render mode', ['--movie-id', '1', '--output', 'planet.png', '--render-mode', 'wireframe']],
    ['basic bloom', ['--movie-id', '1', '--output', 'planet.png', '--render-mode', 'basic', '--bloom', 'on']],
    ['credentialed URL', ['--movie-id', '1', '--output', 'planet.png', '--data-url', 'https://user:pass@example.test/data.json']],
  ])('rejects %s with the arguments exit code', (_label, argv) => {
    expect(() => parseArgs(argv, resolvePath)).toThrowError(CliError)
    try {
      parseArgs(argv, resolvePath)
    } catch (error) {
      expect((error as CliError).exitCode).toBe(EXIT_CODES.arguments)
    }
  })
})