import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { stableFocusEmissionJson } from '../../../frontend/src/three/focusEmission.js'
import { CliError, EXIT_CODES, type ExportArgs } from './args.js'
import { fileDataPlugin, pageDataUrl, pageProfileUrl, type DataSource } from './data-source.js'

export type BrowserRender = {
  png: Buffer
  dataVersion: string | undefined
  webglRenderer: string | undefined
  visualHash: string | undefined
  visualDiagnostics: Record<string, unknown>
  /** Exact profile-resource requests observed in the isolated browser page. */
  profileFetches?: string[]
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
  visualDiagnostics?: string
  dataVersion?: string
}

function diagnosticsObject(candidate: unknown, label: string): Record<string, unknown> {
  if (candidate === null || Array.isArray(candidate) || typeof candidate !== 'object') {
    throw new CliError(`visual diagnostics ${label} must be an object`, EXIT_CODES.render)
  }
  return candidate as Record<string, unknown>
}

function diagnosticsNumber(candidate: unknown, label: string): number {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new CliError(`visual diagnostics ${label} must be finite`, EXIT_CODES.render)
  }
  return candidate
}

function diagnosticsTuple(candidate: unknown, length: number, label: string): void {
  if (!Array.isArray(candidate) || candidate.length !== length) {
    throw new CliError(`visual diagnostics ${label} must be a ${length}-tuple`, EXIT_CODES.render)
  }
  candidate.forEach((entry, index) => diagnosticsNumber(entry, `${label}[${index}]`))
}

export function parseVisualDiagnostics(value: string): Record<string, unknown> {
  let diagnostics: unknown
  try {
    diagnostics = JSON.parse(value)
  } catch {
    throw new CliError('planet export page returned invalid visual diagnostics JSON', EXIT_CODES.render)
  }

  const root = diagnosticsObject(diagnostics, 'root')
  if (!Number.isSafeInteger(root.movie_id) || (root.movie_id as number) <= 0) {
    throw new CliError('visual diagnostics movie_id must be positive integer', EXIT_CODES.render)
  }
  if (!Array.isArray(root.genres) || root.genres.some((genre) => typeof genre !== 'string')) {
    throw new CliError('visual diagnostics genres must be strings', EXIT_CODES.render)
  }
  if (root.size_root !== 2 && root.size_root !== 3 && root.size_root !== 4) {
    throw new CliError('visual diagnostics size_root is invalid', EXIT_CODES.render)
  }

  if (root.visual_config_payload !== undefined || root.visual_config_hash_input !== undefined) {
    diagnosticsObject(root.visual_config_payload, 'visual_config_payload')
    if (typeof root.visual_config_hash_input !== 'string' || root.visual_config_hash_input.length === 0) {
      throw new CliError('visual diagnostics visual_config_hash_input is invalid', EXIT_CODES.render)
    }
  }

  for (const field of ['rating', 'emission', 'fixed_lightness', 'fixed_chroma']) {
    diagnosticsNumber(root[field], field)
  }
  const bloom = diagnosticsObject(root.bloom, 'bloom')
  if (bloom.composition !== 'pure-bloom-delta-v1' || typeof bloom.enabled !== 'boolean') {
    throw new CliError('visual diagnostics bloom contract is invalid', EXIT_CODES.render)
  }
  const bloomStrength = diagnosticsNumber(bloom.strength, 'bloom.strength')
  const bloomRadius = diagnosticsNumber(bloom.radius, 'bloom.radius')
  const bloomThreshold = diagnosticsNumber(bloom.threshold, 'bloom.threshold')
  if (bloomStrength < 0 || bloomRadius < 0 || bloomRadius > 1 || bloomThreshold < 0) {
    throw new CliError('visual diagnostics bloom parameters are invalid', EXIT_CODES.render)
  }
  const emissionCurve = diagnosticsObject(root.emission_curve, 'emission_curve')
  if (
    emissionCurve.model_version === 'vote-average-power-clamped-v1'
    || emissionCurve.model_version === 'p39.11-checkpoint-b-emission-exponent-v1'
  ) {
    const exponent = diagnosticsNumber(emissionCurve.exponent, 'emission_curve.exponent')
    if (exponent <= 0) throw new CliError('visual diagnostics emission_curve.exponent must be > 0', EXIT_CODES.render)
  } else if (emissionCurve.model_version === 'vote-average-anchored-smoothstep-v1') {
    const low = diagnosticsNumber(emissionCurve.rating_low_anchor, 'emission_curve.rating_low_anchor')
    const high = diagnosticsNumber(emissionCurve.rating_high_anchor, 'emission_curve.rating_high_anchor')
    if (low < 0 || high > 10 || low >= high) {
      throw new CliError('visual diagnostics emission_curve anchors are invalid', EXIT_CODES.render)
    }
  } else if (emissionCurve.model_version === 'rating-midrank-cdf-lut-v1') {
    const ratingMin = diagnosticsNumber(emissionCurve.rating_min, 'emission_curve.rating_min')
    const ratingMax = diagnosticsNumber(emissionCurve.rating_max, 'emission_curve.rating_max')
    const sampleStep = diagnosticsNumber(emissionCurve.sample_step, 'emission_curve.sample_step')
    if (ratingMin !== 0 || ratingMax !== 10 || sampleStep !== 0.05 || emissionCurve.sample_count !== 201) {
      throw new CliError('visual diagnostics emission_curve LUT grid is invalid', EXIT_CODES.render)
    }
  } else {
    throw new CliError('visual diagnostics emission_curve.model_version is invalid', EXIT_CODES.render)
  }
  const intensityMin = diagnosticsNumber(emissionCurve.intensity_min, 'emission_curve.intensity_min')
  const intensityMax = diagnosticsNumber(emissionCurve.intensity_max, 'emission_curve.intensity_max')
  if (intensityMin < 0 || intensityMax < intensityMin) {
    throw new CliError('visual diagnostics emission_curve intensity range is invalid', EXIT_CODES.render)
  }
  const padding = diagnosticsNumber(root.padding, 'padding')
  if (padding < 0 || padding >= 0.5) {
    throw new CliError('visual diagnostics padding must be in [0, 0.5)', EXIT_CODES.render)
  }
  const worldRadius = diagnosticsNumber(root.world_radius, 'world_radius')
  const outerRadius = diagnosticsNumber(root.outer_radius, 'outer_radius')
  if (worldRadius <= 0 || outerRadius < worldRadius) {
    throw new CliError('visual diagnostics radii are invalid', EXIT_CODES.render)
  }
  if (!Number.isSafeInteger(root.band_count) || (root.band_count as number) < 1 || (root.band_count as number) > 8) {
    throw new CliError('visual diagnostics band_count must be an integer in [1, 8]', EXIT_CODES.render)
  }

  const keyLight = diagnosticsObject(root.key_light, 'key_light')
  diagnosticsTuple(keyLight.direction, 3, 'key_light.direction')
  diagnosticsNumber(keyLight.intensity, 'key_light.intensity')
  diagnosticsNumber(keyLight.flat_shading_mix, 'key_light.flat_shading_mix')
  if (typeof keyLight.enabled !== 'boolean') {
    throw new CliError('visual diagnostics key_light.enabled must be boolean', EXIT_CODES.render)
  }

  const noise = diagnosticsObject(root.noise, 'noise')
  if (!Number.isSafeInteger(noise.seed) || (noise.seed as number) < 0) {
    throw new CliError('visual diagnostics noise.seed must be a non-negative integer', EXIT_CODES.render)
  }
  if (!Number.isSafeInteger(noise.octaves) || (noise.octaves as number) <= 0) {
    throw new CliError('visual diagnostics noise.octaves must be a positive integer', EXIT_CODES.render)
  }
  diagnosticsNumber(noise.scale, 'noise.scale')
  diagnosticsNumber(noise.persistence, 'noise.persistence')

  const rotation = diagnosticsObject(root.rotation, 'rotation')
  diagnosticsTuple(rotation.base_quaternion, 4, 'rotation.base_quaternion')
  diagnosticsTuple(rotation.seeded_spin_axis_world, 3, 'rotation.seeded_spin_axis_world')
  diagnosticsNumber(rotation.revs_per_sec, 'rotation.revs_per_sec')

  const camera = diagnosticsObject(root.camera, 'camera')
  if (camera.projection !== 'orthographic') {
    throw new CliError('visual diagnostics camera projection must be orthographic', EXIT_CODES.render)
  }
  diagnosticsTuple(camera.position, 3, 'camera.position')
  diagnosticsTuple(camera.quaternion, 4, 'camera.quaternion')
  diagnosticsTuple(camera.direction, 3, 'camera.direction')
  for (const field of ['left', 'right', 'top', 'bottom', 'near', 'far']) {
    diagnosticsNumber(camera[field], `camera.${field}`)
  }
  if (
    (camera.left as number) >= (camera.right as number)
    || (camera.bottom as number) >= (camera.top as number)
    || (camera.near as number) <= 0
    || (camera.far as number) <= (camera.near as number)
  ) {
    throw new CliError('visual diagnostics camera frustum is invalid', EXIT_CODES.render)
  }

  return root
}

function requiredCanonicalVisualConfig(root: Record<string, unknown>, label: string): string {
  const payload = diagnosticsObject(root.visual_config_payload, `${label} visual_config_payload`)
  if (typeof root.visual_config_hash_input !== 'string' || root.visual_config_hash_input.length === 0) {
    throw new CliError(`visual diagnostics ${label} visual_config_hash_input is required`, EXIT_CODES.render)
  }
  const canonicalPayload = stableFocusEmissionJson(payload as Parameters<typeof stableFocusEmissionJson>[0])
  if (canonicalPayload !== root.visual_config_hash_input) {
    throw new CliError(`visual diagnostics ${label} visual_config_hash_input does not match its canonical payload`, EXIT_CODES.render)
  }
  return root.visual_config_hash_input
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableFocusEmissionJson(left as Parameters<typeof stableFocusEmissionJson>[0])
    === stableFocusEmissionJson(right as Parameters<typeof stableFocusEmissionJson>[0])
}

function assertAppliedSnapshot(
  root: Record<string, unknown>,
  hashInput: string,
  label: string,
): Record<string, unknown> {
  const snapshot = diagnosticsObject(root.renderer_snapshot, `${label} renderer_snapshot`)
  if (snapshot.canonicalHashInput !== hashInput) {
    throw new CliError(`visual diagnostics ${label} renderer snapshot hash disagrees with canonical payload`, EXIT_CODES.render)
  }
  if (
    snapshot.movieId !== root.movie_id
    || snapshot.worldRadius !== root.world_radius
    || snapshot.outerRadius !== root.outer_radius
    || snapshot.emission !== root.emission
  ) {
    throw new CliError(`visual diagnostics ${label} renderer snapshot disagrees with rendered movie state`, EXIT_CODES.render)
  }

  const focus = diagnosticsObject(snapshot.focus, `${label} renderer_snapshot.focus`)
  const lighting = diagnosticsObject(snapshot.lighting, `${label} renderer_snapshot.lighting`)
  const noise = diagnosticsObject(snapshot.noise, `${label} renderer_snapshot.noise`)
  const bands = diagnosticsObject(snapshot.bands, `${label} renderer_snapshot.bands`)
  const bloom = diagnosticsObject(snapshot.bloom, `${label} renderer_snapshot.bloom`)
  const rootLighting = diagnosticsObject(root.key_light, `${label} key_light`)
  const rootNoise = diagnosticsObject(root.noise, `${label} noise`)
  const rootBloom = diagnosticsObject(root.bloom, `${label} bloom`)
  if (
    focus.lightness !== root.fixed_lightness
    || focus.chroma !== root.fixed_chroma
    || lighting.enabled !== rootLighting.enabled
    || !sameJson(lighting.direction, rootLighting.direction)
    || lighting.keyLightIntensity !== rootLighting.intensity
    || lighting.flatShadingMix !== rootLighting.flat_shading_mix
    || noise.scale !== rootNoise.scale
    || noise.octaves !== rootNoise.octaves
    || noise.persistence !== rootNoise.persistence
    || bands.bandCount !== root.band_count
    || bloom.enabled !== rootBloom.enabled
    || bloom.strength !== rootBloom.strength
    || bloom.radius !== rootBloom.radius
    || bloom.threshold !== rootBloom.threshold
  ) {
    throw new CliError(`visual diagnostics ${label} renderer snapshot disagrees with applied visual state`, EXIT_CODES.render)
  }
  return snapshot
}

function assertProductionAppliedSnapshot(
  root: Record<string, unknown>,
  hashInput: string,
  label: string,
): void {
  const snapshot = assertAppliedSnapshot(root, hashInput, label)
  const payload = diagnosticsObject(root.visual_config_payload, `${label} visual_config_payload`)
  const payloadProvenance = diagnosticsObject(payload.emission_profile, `${label} visual_config_payload.emission_profile`)
  const provenance = diagnosticsObject(root.profile_provenance, `${label} profile_provenance`)
  const snapshotProvenance = diagnosticsObject(snapshot.profileProvenance, `${label} renderer_snapshot.profileProvenance`)
  if (
    snapshot.profileSource !== 'active'
    || payloadProvenance.source !== 'active'
    || !sameJson(provenance, payloadProvenance)
    || !sameJson(provenance, { ...snapshotProvenance, source: snapshot.profileSource })
  ) {
    throw new CliError(`visual diagnostics ${label} renderer snapshot disagrees with active profile provenance`, EXIT_CODES.render)
  }
}

export function assertCanonicalVisualConfig(
  diagnostics: Record<string, unknown>,
  pageVisualHash: unknown,
  label: string,
  requireAppliedSnapshot = false,
): string {
  const hashInput = requiredCanonicalVisualConfig(diagnostics, label)
  if (typeof pageVisualHash !== 'string' || pageVisualHash.length === 0 || pageVisualHash !== hashInput) {
    throw new CliError(`visual diagnostics ${label} dataset visual hash disagrees with canonical renderer payload`, EXIT_CODES.render)
  }
  if (requireAppliedSnapshot) assertProductionAppliedSnapshot(diagnostics, hashInput, label)
  return hashInput
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
    manifest_url: args.manifestUrl ?? source.manifestUrl ?? null,
    profile_url: source.profileUrl ?? null,
    requested_focus_emission_profile: source.focusEmissionProfile ?? null,
    resolution: args.resolution,
    padding: args.padding,
    bloom: args.bloom,
    render_mode: args.renderMode,
    chronicle_git_commit: gitCommit,
    visual_config_hash: createHash('sha256').update(render.visualHash ?? '').digest('hex'),
    png_sha256: createHash('sha256').update(render.png).digest('hex'),
    visual_diagnostics: render.visualDiagnostics,
    resolved_visual_config: (render.visualDiagnostics.visual_config_payload as Record<string, unknown> | undefined) ?? null,
    focus_emission_profile: (render.visualDiagnostics.profile_provenance as Record<string, unknown> | undefined) ?? null,
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
    const requestedProfileUrl = source.focusEmissionProfile === undefined ? undefined : pageProfileUrl(serverUrl, source)
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({ viewport: { width: args.resolution, height: args.resolution }, deviceScaleFactor: 1 })
    page = await context.newPage()
    const pageDiagnostics: string[] = []
    const profileFetches: string[] = []
    page.on('request', (request) => {
      if (requestedProfileUrl !== undefined && request.url() === requestedProfileUrl) profileFetches.push(request.url())
    })
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
      renderMode: args.renderMode,
      ...(source.focusEmissionProfile === undefined ? {} : { profilePointer: JSON.stringify(source.focusEmissionProfile), profileUrl: requestedProfileUrl! }),
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
      visualDiagnostics: document.body.dataset.visualDiagnostics,
      dataVersion: document.body.dataset.dataVersion,
    }))
    if (result.error || !result.ready || !result.png) {
      const detail = result.error ?? pageDiagnostics.at(-1) ?? 'planet export page did not become ready'
      throw new CliError(detail, result.failureKind === 'data' ? EXIT_CODES.data : EXIT_CODES.render)
    }
    if (!Number.isSafeInteger(result.maxTextureSize) || result.maxTextureSize < args.resolution) throw new CliError(`MAX_TEXTURE_SIZE ${result.maxTextureSize} < resolution ${args.resolution}`, EXIT_CODES.render)
    const encoded = result.png.split(',')[1]
    if (!encoded) throw new CliError('planet export page returned an invalid PNG data URL', EXIT_CODES.render)
    if (!result.visualDiagnostics) throw new CliError('planet export page returned no visual diagnostics', EXIT_CODES.render)
    const visualDiagnostics = parseVisualDiagnostics(result.visualDiagnostics)
    assertCanonicalVisualConfig(visualDiagnostics, result.visualHash, 'planet export', true)
    return {
      png: Buffer.from(encoded, 'base64'),
      dataVersion: result.dataVersion,
      webglRenderer: result.webglRenderer,
      visualHash: result.visualHash,
      visualDiagnostics,
      profileFetches,
      chromiumVersion: browser.version(),
    }
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