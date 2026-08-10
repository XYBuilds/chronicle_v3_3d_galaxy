import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'

import { CliError, EXIT_CODES, type ExportArgs } from './args.js'
import { assertP39LegacyVisualConfig, parseVisualDiagnostics, type BrowserRender } from './browser.js'
import { fileDataPlugin, pageDataUrl, type DataSource } from './data-source.js'

export const P3911_CHECKPOINT_C_STRENGTHS = [0.0025, 0.005, 0.01] as const

type PageResult = { error?: string; failureKind?: 'data' | 'render'; ready?: string; png?: string; maxTextureSize: number; webglRenderer?: string; visualHash?: string; visualDiagnostics?: string; dataVersion?: string }

export function assertP3911CheckpointCStrength(value: number): void {
  if (!Number.isFinite(value) || value <= 0 || !P3911_CHECKPOINT_C_STRENGTHS.includes(value as typeof P3911_CHECKPOINT_C_STRENGTHS[number])) {
    throw new CliError(`P39.11 Bloom strength must be one of 0.0025, 0.005, 0.01; received ${value}`, EXIT_CODES.arguments)
  }
}

/** The only strength-override browser boundary; standard CLI and site cannot call it. */
export async function renderP3911CheckpointCStrengthInBrowser(args: ExportArgs, source: DataSource, root: string, strength: number): Promise<BrowserRender> {
  assertP3911CheckpointCStrength(strength)
  if (args.movieId !== 157336 || args.bloom !== 'on' || args.renderMode !== 'shader') {
    throw new CliError('P39.11 Checkpoint C3 requires TMDB 157336, Bloom ON, and shader mode', EXIT_CODES.arguments)
  }
  let server: ViteDevServer | undefined
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  let page: Page | undefined
  try {
    server = await createServer({ root: path.join(root, 'frontend'), configFile: path.join(root, 'frontend/vite.config.ts'), plugins: [fileDataPlugin(source)].filter((plugin): plugin is NonNullable<typeof plugin> => plugin !== undefined), server: { host: '127.0.0.1', port: 0, strictPort: false } })
    await server.listen()
    const serverUrl = server.resolvedUrls?.local[0]
    if (!serverUrl) throw new CliError('Vite server did not expose a local URL', EXIT_CODES.render)
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({ viewport: { width: args.resolution, height: args.resolution }, deviceScaleFactor: 1 })
    page = await context.newPage()
    const pageDiagnostics: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') pageDiagnostics.push(message.text()) })
    page.on('pageerror', (error) => pageDiagnostics.push(error.message))
    const query = new URLSearchParams({ movieId: String(args.movieId), dataUrl: pageDataUrl(serverUrl, source), resolution: String(args.resolution), padding: String(args.padding), bloom: args.bloom, sizeRoot: String(args.sizeRoot), renderMode: args.renderMode, p3911BloomStrength: String(strength) })
    await page.goto(new URL(`p3911-checkpoint-c-strength-diagnostics.html?${query.toString()}`, serverUrl).toString(), { waitUntil: 'networkidle', timeout: 120_000 })
    await page.waitForFunction(() => document.body.dataset.exportReady === '1' || document.body.dataset.exportError !== undefined, undefined, { timeout: 120_000 })
    const result = await page.evaluate((): PageResult => ({ error: document.body.dataset.exportError, failureKind: document.body.dataset.exportFailureKind as PageResult['failureKind'], ready: document.body.dataset.exportReady, png: document.querySelector('canvas')?.toDataURL('image/png'), webglRenderer: document.body.dataset.webglRenderer, maxTextureSize: Number(document.body.dataset.maxTextureSize), visualHash: document.body.dataset.visualHash, visualDiagnostics: document.body.dataset.visualDiagnostics, dataVersion: document.body.dataset.dataVersion }))
    if (result.error || !result.ready || !result.png) throw new CliError(result.error ?? pageDiagnostics.at(-1) ?? 'P39.11 diagnostics page did not become ready', result.failureKind === 'data' ? EXIT_CODES.data : EXIT_CODES.render)
    if (!Number.isSafeInteger(result.maxTextureSize) || result.maxTextureSize < args.resolution) throw new CliError(`MAX_TEXTURE_SIZE ${result.maxTextureSize} < resolution ${args.resolution}`, EXIT_CODES.render)
    const encoded = result.png.split(',')[1]
    if (!encoded || !result.visualDiagnostics) throw new CliError('P39.11 diagnostics page returned incomplete output', EXIT_CODES.render)
    const visualDiagnostics = parseVisualDiagnostics(result.visualDiagnostics)
    assertP39LegacyVisualConfig(
      visualDiagnostics,
      result.visualHash,
      'p39.11-checkpoint-c3-strength-pure-delta-v1',
    )
    return { png: Buffer.from(encoded, 'base64'), dataVersion: result.dataVersion, webglRenderer: result.webglRenderer, visualHash: result.visualHash, visualDiagnostics, chromiumVersion: browser.version() }
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(`P39.11 browser render failed: ${error instanceof Error ? error.message : String(error)}`, EXIT_CODES.render)
  } finally {
    await page?.close().catch(() => undefined)
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
    await server?.close().catch(() => undefined)
  }
}