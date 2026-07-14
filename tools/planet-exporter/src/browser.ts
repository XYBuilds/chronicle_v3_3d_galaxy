import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { CliError, EXIT_CODES, type ExportArgs } from './args.js'
import { fileDataPlugin, pageDataUrl, type DataSource } from './data-source.js'

export type BrowserRender = {
  png: Buffer
  dataVersion: string | undefined
  webglRenderer: string | undefined
  visualHash: string | undefined
  chromiumVersion: string
}

type PageResult = {
  error?: string
  failureKind?: 'data' | 'render'
  ready?: string
  png?: string
  maxTextureSize: number
  webglRenderer?: string
  visualHash?: string
  dataVersion?: string
}

export function getGitCommit(root: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'unknown'
  }
}

export function metadataFor(args: ExportArgs, source: DataSource, render: BrowserRender, gitCommit: string): Record<string, unknown> {
  return {
    tmdb_id: args.movieId,
    data_version: render.dataVersion ?? source.version ?? 'unknown',
    data_source: source.label,
    resolution: args.resolution,
    padding: args.padding,
    bloom: args.bloom,
    chronicle_git_commit: gitCommit,
    visual_config_hash: createHash('sha256').update(render.visualHash ?? '').digest('hex'),
    chromium_version: render.chromiumVersion,
    webgl_renderer: render.webglRenderer ?? 'unknown',
    generated_at: new Date().toISOString(),
  }
}

export async function renderInBrowser(args: ExportArgs, source: DataSource, root: string): Promise<BrowserRender> {
  let server: ViteDevServer | undefined
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  let page: Page | undefined
  try {
    server = await createServer({
      root: path.join(root, 'frontend'),
      configFile: path.join(root, 'frontend/vite.config.ts'),
      plugins: [fileDataPlugin(source)].filter((plugin): plugin is NonNullable<typeof plugin> => plugin !== undefined),
      server: { host: '127.0.0.1', port: 0, strictPort: false },
    })
    await server.listen()
    const serverUrl = server.resolvedUrls?.local[0]
    if (!serverUrl) throw new CliError('Vite server did not expose a local URL', EXIT_CODES.render)
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({ viewport: { width: args.resolution, height: args.resolution }, deviceScaleFactor: 1 })
    page = await context.newPage()
    const pageDiagnostics: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') pageDiagnostics.push(message.text())
    })
    page.on('pageerror', (error) => pageDiagnostics.push(error.message))
    const maxTextureSize = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      return gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0
    })
    if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < args.resolution) {
      throw new CliError(`MAX_TEXTURE_SIZE ${maxTextureSize} < resolution ${args.resolution}`, EXIT_CODES.render)
    }
    const query = new URLSearchParams({
      movieId: String(args.movieId),
      dataUrl: pageDataUrl(serverUrl, source),
      resolution: String(args.resolution),
      padding: String(args.padding),
      bloom: args.bloom,
      sizeRoot: String(args.sizeRoot),
      renderMode: 'shader',
    })
    await page.goto(new URL(`planet-export.html?${query.toString()}`, serverUrl).toString(), { waitUntil: 'networkidle', timeout: 120_000 })
    await page.waitForFunction(() => document.body.dataset.exportReady === '1' || document.body.dataset.exportError !== undefined, undefined, { timeout: 120_000 })
    const result = await page.evaluate((): PageResult => ({
      error: document.body.dataset.exportError,
      failureKind: document.body.dataset.exportFailureKind as PageResult['failureKind'],
      ready: document.body.dataset.exportReady,
      png: document.querySelector('canvas')?.toDataURL('image/png'),
      webglRenderer: document.body.dataset.webglRenderer,
      maxTextureSize: Number(document.body.dataset.maxTextureSize),
      visualHash: document.body.dataset.visualHash,
      dataVersion: document.body.dataset.dataVersion,
    }))
    if (result.error || !result.ready || !result.png) {
      const detail = result.error ?? pageDiagnostics.at(-1) ?? 'planet export page did not become ready'
      throw new CliError(detail, result.failureKind === 'data' ? EXIT_CODES.data : EXIT_CODES.render)
    }
    if (!Number.isSafeInteger(result.maxTextureSize) || result.maxTextureSize < args.resolution) throw new CliError(`MAX_TEXTURE_SIZE ${result.maxTextureSize} < resolution ${args.resolution}`, EXIT_CODES.render)
    const encoded = result.png.split(',')[1]
    if (!encoded) throw new CliError('planet export page returned an invalid PNG data URL', EXIT_CODES.render)
    return { png: Buffer.from(encoded, 'base64'), dataVersion: result.dataVersion, webglRenderer: result.webglRenderer, visualHash: result.visualHash, chromiumVersion: browser.version() }
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(`browser render failed: ${error instanceof Error ? error.message : String(error)}`, EXIT_CODES.render)
  } finally {
    await page?.close().catch(() => undefined)
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
    await server?.close().catch(() => undefined)
  }
}