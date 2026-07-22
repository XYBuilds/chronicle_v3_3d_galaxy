import path from 'node:path'

import { createServer, type ViteDevServer } from 'vite'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

import { CliError, EXIT_CODES, type ExportArgs } from './args.js'
import { parsePhase41VisualDiagnostics, type BrowserRender } from './browser.js'
import { fileDataPlugin, isLegacyProfileCompatibilityFixture, pageDataUrl, pageProfileUrl, type DataSource } from './data-source.js'

export const PHASE41_DIAGNOSTIC_MARKER = 'phase41-visual-diagnostic-v1' as const

export type Phase41DiagnosticOverride = {
  diagnostic_only: typeof PHASE41_DIAGNOSTIC_MARKER
  emissionCurve?: Record<string, unknown>
  lightness?: number
  keyLightIntensity?: number
  direction?: [number, number, number]
  flatShadingMix?: number
  bloom?: { enabled: boolean; strength: number; radius: number; threshold: number }
}

type PageResult = {
  error?: string
  failureKind?: 'data' | 'render'
  ready?: string
  png?: string
  maxTextureSize: number
  webglRenderer?: string
  visualHash?: string
  visualDiagnostics?: string
  dataVersion?: string
}

function validateOverride(override: Phase41DiagnosticOverride | undefined): void {
  if (override === undefined) return
  if (override.diagnostic_only !== PHASE41_DIAGNOSTIC_MARKER) {
    throw new CliError('Phase 41 diagnostic override requires its diagnostic_only marker', EXIT_CODES.arguments)
  }
}

/** Query builder for the isolated Vite diagnostic entry; normal exporter never calls this. */
export function phase41DiagnosticSearchParams(args: ExportArgs, override?: Phase41DiagnosticOverride, source?: DataSource): URLSearchParams {
  validateOverride(override)
  return new URLSearchParams({
    movieId: String(args.movieId),
    dataUrl: '__DATA_URL__',
    resolution: String(args.resolution),
    padding: String(args.padding),
    bloom: args.bloom,
    sizeRoot: String(args.sizeRoot),
    renderMode: args.renderMode,
    diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
    ...(override === undefined ? {} : { profile: JSON.stringify(override) }),
    ...(source?.focusEmissionProfile === undefined ? {} : { profilePointer: JSON.stringify(source.focusEmissionProfile), profileUrl: source.profileUrl! }),
    ...(source !== undefined && isLegacyProfileCompatibilityFixture(source) ? { allowLegacyProfile: '1' } : {}),
  })
}

/**
 * Generic Phase 41 offline adapter. Its only visual override transport is the
 * marker-bound profile JSON sent to phase41-diagnostics.html.
 */
export async function renderPhase41DiagnosticInBrowser(
  args: ExportArgs,
  source: DataSource,
  root: string,
  override?: Phase41DiagnosticOverride,
): Promise<BrowserRender> {
  let server: ViteDevServer | undefined
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  let page: Page | undefined
  try {
    const query = phase41DiagnosticSearchParams(args, override, source)
    server = await createServer({
      root: path.join(root, 'frontend'),
      configFile: path.join(root, 'frontend/vite.config.ts'),
      plugins: [fileDataPlugin(source)].filter((plugin): plugin is NonNullable<typeof plugin> => plugin !== undefined),
      server: { host: '127.0.0.1', port: 0, strictPort: false },
    })
    await server.listen()
    const serverUrl = server.resolvedUrls?.local[0]
    if (!serverUrl) throw new CliError('Vite server did not expose a local URL', EXIT_CODES.render)
    const requestedProfileUrl = source.focusEmissionProfile === undefined ? undefined : pageProfileUrl(serverUrl, source)
    query.set('dataUrl', pageDataUrl(serverUrl, source))
    if (requestedProfileUrl !== undefined) query.set('profileUrl', requestedProfileUrl)
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({ viewport: { width: args.resolution, height: args.resolution }, deviceScaleFactor: 1 })
    page = await context.newPage()
    const pageDiagnostics: string[] = []
    const profileFetches: string[] = []
    page.on('request', (request) => {
      if (requestedProfileUrl !== undefined && request.url() === requestedProfileUrl) profileFetches.push(request.url())
    })
    page.on('console', (message) => { if (message.type() === 'error') pageDiagnostics.push(message.text()) })
    page.on('pageerror', (error) => pageDiagnostics.push(error.message))
    await page.goto(new URL(`phase41-diagnostics.html?${query.toString()}`, serverUrl).toString(), { waitUntil: 'networkidle', timeout: 120_000 })
    await page.waitForFunction(() => document.body.dataset.exportReady === '1' || document.body.dataset.exportError !== undefined, undefined, { timeout: 120_000 })
    const result = await page.evaluate((): PageResult => ({
      error: document.body.dataset.exportError,
      failureKind: document.body.dataset.exportFailureKind as PageResult['failureKind'],
      ready: document.body.dataset.exportReady,
      png: document.querySelector('canvas')?.toDataURL('image/png'),
      webglRenderer: document.body.dataset.webglRenderer,
      maxTextureSize: Number(document.body.dataset.maxTextureSize),
      visualHash: document.body.dataset.visualHash,
      visualDiagnostics: document.body.dataset.visualDiagnostics,
      dataVersion: document.body.dataset.dataVersion,
    }))
    if (result.error || !result.ready || !result.png) {
      throw new CliError(result.error ?? pageDiagnostics.at(-1) ?? 'Phase 41 diagnostics page did not become ready', result.failureKind === 'data' ? EXIT_CODES.data : EXIT_CODES.render)
    }
    if (!Number.isSafeInteger(result.maxTextureSize) || result.maxTextureSize < args.resolution) {
      throw new CliError(`MAX_TEXTURE_SIZE ${result.maxTextureSize} < resolution ${args.resolution}`, EXIT_CODES.render)
    }
    const encoded = result.png.split(',')[1]
    if (!encoded || !result.visualDiagnostics || !result.visualHash) {
      throw new CliError('Phase 41 diagnostics page returned incomplete evidence', EXIT_CODES.render)
    }
    return {
      png: Buffer.from(encoded, 'base64'),
      dataVersion: result.dataVersion,
      webglRenderer: result.webglRenderer,
      visualHash: result.visualHash,
      visualDiagnostics: parsePhase41VisualDiagnostics(result.visualDiagnostics, result.visualHash),
      profileFetches,
      chromiumVersion: browser.version(),
    }
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(`Phase 41 diagnostic render failed: ${error instanceof Error ? error.message : String(error)}`, EXIT_CODES.render)
  } finally {
    await page?.close().catch(() => undefined)
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
    await server?.close().catch(() => undefined)
  }
}