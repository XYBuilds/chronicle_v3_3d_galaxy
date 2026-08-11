import { describe, expect, it } from 'vitest'
import { EXIT_CODES, CliError, parseArgs } from './args.js'

const resolvePath = (value: string): string => `/resolved/${value}`

describe('parseArgs', () => {
  it('parses required arguments and applies deterministic defaults', () => {
    expect(parseArgs(['--movie-id', '157336', '--output', 'planet.png', '--manifest-url', 'https://example.test/data/galaxy_assets_manifest.json'], resolvePath)).toEqual({
      movieId: 157336,
      output: '/resolved/planet.png',
      resolution: 3000,
      padding: 0.08,
      bloom: 'off',
      sizeRoot: 3,
      renderMode: 'shader',
      dataFile: undefined,
      manifestUrl: 'https://example.test/data/galaxy_assets_manifest.json',
    })
  })

  it('requires an explicit --manifest-url or --data-file release input', () => {
    expect(() => parseArgs(['--movie-id', '1', '--output', 'planet.png'], resolvePath)).toThrow(CliError)
    try {
      parseArgs(['--movie-id', '1', '--output', 'planet.png'], resolvePath)
    } catch (error) {
      expect((error as CliError).exitCode).toBe(EXIT_CODES.arguments)
      expect((error as CliError).message).toMatch(/--manifest-url|--data-file/)
    }
  })

  it('rejects combining production --manifest-url with offline --data-file', () => {
    expect(() => parseArgs([
      '--movie-id', '1',
      '--output', 'planet.png',
      '--manifest-url', 'https://example.test/data/galaxy_assets_manifest.json',
      '--data-file', 'fixture.json',
    ], resolvePath)).toThrow(/--manifest-url|--data-file/)
  })

  it('accepts explicit basic mode with Bloom disabled', () => {
    expect(parseArgs(['--movie-id', '1', '--output', 'planet.png', '--render-mode', 'basic', '--data-file', 'fixture.json'], resolvePath).renderMode).toBe('basic')
  })
  it('rejects diagnostic visual parameters at the normal CLI boundary', () => {
    expect(() => parseArgs(['--movie-id', '1', '--output', 'planet.png', '--data-file', 'fixture.json', '--bloom-strength', '0'], resolvePath)).toThrow(CliError)
    expect(() => parseArgs(['--movie-id', '1', '--output', 'planet.png', '--data-file', 'fixture.json', '--diagnostic-only', 'phase41-visual-diagnostic-v1'], resolvePath)).toThrow(CliError)
  })

  it('keeps offline --data-file as an explicit local/test path', () => {
    const args = parseArgs([
      '--movie-id', '1',
      '--output', 'planet.png',
      '--data-file', 'fixture.json',
    ], resolvePath)
    expect(args.dataFile).toBe('/resolved/fixture.json')
    expect(args.manifestUrl).toBeUndefined()
  })

  it.each([2, 3, 4])('accepts size-root %i', (sizeRoot) => {
    expect(parseArgs(['--movie-id', '1', '--output', 'planet.png', '--size-root', String(sizeRoot), '--data-file', 'fixture.json'], resolvePath).sizeRoot).toBe(sizeRoot)
  })

  it.each([
    ['unknown option', ['--movie-id', '1', '--output', 'planet.png', '--data-file', 'fixture.json', '--wat', 'x']],
    ['duplicate option', ['--movie-id', '1', '--movie-id', '2', '--output', 'planet.png', '--data-file', 'fixture.json']],
    ['invalid resolution', ['--movie-id', '1', '--output', 'planet.png', '--resolution', '0', '--data-file', 'fixture.json']],
    ['invalid padding', ['--movie-id', '1', '--output', 'planet.png', '--padding', '0.5', '--data-file', 'fixture.json']],
    ['invalid size root', ['--movie-id', '1', '--output', 'planet.png', '--size-root', '5', '--data-file', 'fixture.json']],
    ['invalid render mode', ['--movie-id', '1', '--output', 'planet.png', '--render-mode', 'wireframe', '--data-file', 'fixture.json']],
    ['basic bloom', ['--movie-id', '1', '--output', 'planet.png', '--render-mode', 'basic', '--bloom', 'on', '--data-file', 'fixture.json']],
    ['credentialed manifest URL', ['--movie-id', '1', '--output', 'planet.png', '--manifest-url', 'https://user:pass@example.test/data/galaxy_assets_manifest.json']],
    ['data-url without explicit release input', ['--movie-id', '1', '--output', 'planet.png', '--data-url', 'https://example.test/data.json.gz']],
  ])('rejects %s with the arguments exit code', (_label, argv) => {
    expect(() => parseArgs(argv, resolvePath)).toThrowError(CliError)
    try {
      parseArgs(argv, resolvePath)
    } catch (error) {
      expect((error as CliError).exitCode).toBe(EXIT_CODES.arguments)
    }
  })
})