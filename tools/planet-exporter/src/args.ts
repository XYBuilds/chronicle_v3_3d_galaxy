export const EXIT_CODES = {
  arguments: 2,
  data: 3,
  render: 4,
  write: 5,
} as const

export class CliError extends Error {
  public readonly exitCode: number

  public constructor(message: string, exitCode: number) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

export type ExportArgs = {
  movieId: number
  output: string
  resolution: number
  padding: number
  bloom: 'on' | 'off'
  sizeRoot: 2 | 3 | 4
  renderMode: 'basic' | 'shader'
  dataFile?: string
  manifestUrl?: string
}

export const usage = 'usage: npm run planet:export -- --movie-id ID --output FILE.png (--manifest-url URL | --data-file FILE) [--resolution N] [--padding N] [--bloom on|off] [--size-root 2|3|4] [--render-mode basic|shader]'

const allowed = new Set(['movie-id', 'output', 'resolution', 'padding', 'bloom', 'size-root', 'render-mode', 'data-file', 'data-url', 'manifest-url'])

function assertHttpUrl(raw: string, label: string, pathnameTest: (pathname: string) => boolean): string {
  try {
    const parsed = new URL(raw)
    if (!/^https?:$/.test(parsed.protocol) || parsed.hash || parsed.username || parsed.password || !pathnameTest(parsed.pathname)) {
      throw new Error('invalid')
    }
    return parsed.toString()
  } catch {
    throw new CliError(`${label} must be an absolute http(s) URL`, EXIT_CODES.arguments)
  }
}

export function parseArgs(argv: string[], resolvePath: (value: string) => string): ExportArgs {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag?.startsWith('--') || flag === '--') throw new CliError(`invalid arguments; ${usage}`, EXIT_CODES.arguments)
    const key = flag.slice(2)
    const value = argv[index + 1]
    if (!allowed.has(key) || values.has(key) || value === undefined || value.startsWith('--')) {
      throw new CliError(`invalid arguments; ${usage}`, EXIT_CODES.arguments)
    }
    values.set(key, value)
    index += 1
  }
  const movieId = Number(values.get('movie-id'))
  const output = values.get('output')
  const resolution = Number(values.get('resolution') ?? 3000)
  const padding = Number(values.get('padding') ?? 0.08)
  const bloom = values.get('bloom') ?? 'off'
  const sizeRoot = Number(values.get('size-root') ?? 3)
  const renderMode = values.get('render-mode') ?? 'shader'
  const dataUrl = values.get('data-url')
  const hasDataFile = values.has('data-file')
  const hasManifestUrl = values.has('manifest-url')
  if (
    !Number.isSafeInteger(movieId)
    || movieId <= 0
    || !output
    || !Number.isSafeInteger(resolution)
    || resolution < 1
    || resolution > 16384
    || !Number.isFinite(padding)
    || padding < 0
    || padding >= 0.5
    || (bloom !== 'on' && bloom !== 'off')
    || (sizeRoot !== 2 && sizeRoot !== 3 && sizeRoot !== 4)
    || (renderMode !== 'basic' && renderMode !== 'shader')
    || (renderMode === 'basic' && bloom !== 'off')
  ) {
    throw new CliError(`invalid arguments; ${usage}`, EXIT_CODES.arguments)
  }
  if (hasDataFile === hasManifestUrl) {
    throw new CliError(`choose exactly one release input: --manifest-url URL or --data-file FILE; ${usage}`, EXIT_CODES.arguments)
  }
  if (dataUrl !== undefined) {
    throw new CliError('standalone --data-url is retired; use --manifest-url for production or --data-file for offline/local tests', EXIT_CODES.arguments)
  }
  const manifestUrl = hasManifestUrl
    ? assertHttpUrl(values.get('manifest-url')!, '--manifest-url', (pathname) => /\.json$/i.test(pathname))
    : undefined
  return {
    movieId,
    output: resolvePath(output),
    resolution,
    padding,
    bloom: bloom as 'on' | 'off',
    sizeRoot: sizeRoot as 2 | 3 | 4,
    renderMode: renderMode as 'basic' | 'shader',
    dataFile: hasDataFile ? resolvePath(values.get('data-file')!) : undefined,
    manifestUrl,
  }
}
