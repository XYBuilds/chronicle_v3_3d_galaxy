import { describe, expect, it, vi } from 'vitest'
import { CliError, EXIT_CODES } from './args.js'
import { run, type RunDependencies } from './cli.js'

function createIo(): {
  io: Pick<typeof process, 'stdout' | 'stderr'>
  stdout: () => string
  stderr: () => string
} {
  let stdout = ''
  let stderr = ''
  return {
    io: {
      stdout: { write: (chunk: string | Uint8Array) => { stdout += String(chunk); return true } } as NodeJS.WriteStream,
      stderr: { write: (chunk: string | Uint8Array) => { stderr += String(chunk); return true } } as NodeJS.WriteStream,
    },
    stdout: () => stdout,
    stderr: () => stderr,
  }
}

function createDependencies(): RunDependencies {
  return {
    chooseDataSource: vi.fn(async () => ({ kind: 'url', label: 'https://example.test/data.json.gz', pageUrl: 'https://example.test/data.json.gz' })),
    renderInBrowser: vi.fn(async () => ({
      png: Buffer.from('png'),
      dataVersion: 'fixture-v1',
      webglRenderer: 'fixture-gpu',
      visualHash: 'visual',
      visualDiagnostics: { rating: 5, emission: 0.33 },
      chromiumVersion: 'fixture-chromium',
    })),
    assertPngSafe: vi.fn(() => ({
      width: 64,
      height: 64,
      colorType: 6,
      alphaPixels: 1,
      bounds: { left: 16, top: 16, right: 48, bottom: 48 },
    })),
    metadataFor: vi.fn(() => ({ tmdb_id: 1 })),
    getGitCommit: vi.fn(() => 'fixture-commit'),
    writeArtifactsAtomically: vi.fn(async () => undefined),
    outputMetadataPath: vi.fn((output: string) => `${output}.render.json`),
  }
}

const argv = ['--movie-id', '1', '--output', 'planet.png', '--resolution', '64', '--manifest-url', 'https://example.test/data/galaxy_assets_manifest.json']

describe('planet export CLI orchestration', () => {
  it('prints exactly one success JSON line to stdout', async () => {
    const capture = createIo()
    const dependencies = createDependencies()

    await expect(run(argv, capture.io, dependencies)).resolves.toBe(0)

    const lines = capture.stdout().trimEnd().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toMatchObject({ tmdb_id: 1 })
    expect(capture.stderr()).toContain('[planet:export] movieId=1')
    expect(dependencies.writeArtifactsAtomically).toHaveBeenCalledOnce()
    expect(dependencies.chooseDataSource).toHaveBeenCalledWith(
      expect.objectContaining({ manifestUrl: 'https://example.test/data/galaxy_assets_manifest.json' }),
    )
  })

  it('passes explicit basic mode through the reusable export path', async () => {
    const capture = createIo()
    const dependencies = createDependencies()

    await expect(run([...argv, '--render-mode', 'basic'], capture.io, dependencies)).resolves.toBe(0)

    expect(dependencies.renderInBrowser).toHaveBeenCalledWith(
      expect.objectContaining({ renderMode: 'basic', bloom: 'off' }),
      expect.anything(),
      expect.any(String),
    )
    expect(dependencies.metadataFor).toHaveBeenCalledWith(
      expect.objectContaining({ renderMode: 'basic' }),
      expect.anything(),
      expect.anything(),
      'fixture-commit',
    )
  })

  it('rejects silent tracked-manifest fallback when no release input is provided', async () => {
    const capture = createIo()
    const dependencies = createDependencies()

    await expect(run(['--movie-id', '1', '--output', 'planet.png', '--resolution', '64'], capture.io, dependencies)).resolves.toBe(EXIT_CODES.arguments)
    expect(capture.stdout()).toBe('')
    expect(capture.stderr()).toMatch(/--manifest-url|--data-file/)
    expect(dependencies.chooseDataSource).not.toHaveBeenCalled()
  })

  it.each([
    ['data', 'chooseDataSource', EXIT_CODES.data],
    ['render', 'renderInBrowser', EXIT_CODES.render],
    ['write', 'writeArtifactsAtomically', EXIT_CODES.write],
  ] as const)('returns the %s exit code without writing stdout', async (_label, dependency, exitCode) => {
    const capture = createIo()
    const dependencies = createDependencies()
    vi.mocked(dependencies[dependency]).mockRejectedValueOnce(new CliError('fixture failure', exitCode))

    await expect(run(argv, capture.io, dependencies)).resolves.toBe(exitCode)

    expect(capture.stdout()).toBe('')
    expect(capture.stderr()).toContain('fixture failure')
  })

  it('maps unexpected failures to the render exit code', async () => {
    const capture = createIo()
    const dependencies = createDependencies()
    vi.mocked(dependencies.assertPngSafe).mockImplementationOnce(() => { throw new Error('invalid PNG') })

    await expect(run(argv, capture.io, dependencies)).resolves.toBe(EXIT_CODES.render)
    expect(capture.stdout()).toBe('')
    expect(capture.stderr()).toContain('invalid PNG')
  })
})