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
      dataFile: undefined,
      dataUrl: undefined,
    })
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

  it.each([
    ['unknown option', ['--movie-id', '1', '--output', 'planet.png', '--wat', 'x']],
    ['duplicate option', ['--movie-id', '1', '--movie-id', '2', '--output', 'planet.png']],
    ['invalid resolution', ['--movie-id', '1', '--output', 'planet.png', '--resolution', '0']],
    ['invalid padding', ['--movie-id', '1', '--output', 'planet.png', '--padding', '0.5']],
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