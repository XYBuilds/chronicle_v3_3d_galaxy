import type * as THREE from 'three'

/**
 * HDR capability matrix used by the production SDR fallback policy.
 * Reports capability only; it is not a pixel-level HDR proof and is not installed on `window`.
 */

export type HdrBrowserFamily = 'chrome' | 'edge' | 'safari' | 'firefox' | 'other'
export type HdrOsFamily = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'other'
/** OS-level HDR cannot be read reliably from the web platform. */
export type HdrOsHdrState = 'on' | 'off' | 'unknown'
export type HdrDisplayState = 'hdr' | 'sdr' | 'unknown'
export type HdrApiPath = 'webgl2-srgb' | 'webgpu-extended' | 'canvas-2d-hdr' | 'none'
export type HdrVerdictPre = 'supported' | 'experimental' | 'fallback-sdr' | 'blocked'
export type HdrRecommendedMode = 'sdr' | 'hdr-capable' | 'hdr-active'
export type WebGpuExtendedProbeState = boolean | 'pending' | 'unsupported'

export interface HdrCapabilitiesReport {
  webgl2: boolean
  /** Three.js `outputColorSpace` label (e.g. `srgb`). */
  outputColorSpace: string
  /** CSS / screen hints for extended dynamic range or wide gamut (not OS HDR on/off). */
  canvasHdrSupported: boolean
  dynamicRangeHigh: boolean
  colorGamut: string
  webgpuAvailable: boolean
  webgpuExtendedToneMapping: WebGpuExtendedProbeState
  browser: HdrBrowserFamily
  os: HdrOsFamily
  osHdr: HdrOsHdrState
  displayHdr: HdrDisplayState
  /** Production renderer path at probe time. */
  apiPath: HdrApiPath
  /** Phase 29 spec §4.3 row id when mappable; `null` if ambiguous. */
  matrixRow: number | null
  verdictPre: HdrVerdictPre
  /** True when row is P0/P1 candidate (#1–#3) and WebGPU extended probe succeeded. */
  meetsTargetMatrix: boolean
  recommendedMode: HdrRecommendedMode
  userAgent: string
  probedAt: string
  notes: string[]
}

export interface HdrMatrixInput {
  browser: HdrBrowserFamily
  os: HdrOsFamily
  displayHdr: HdrDisplayState
  apiPath: HdrApiPath
  webgpuExtendedToneMapping: WebGpuExtendedProbeState
  postFxBloomEnabled?: boolean
}

/** Parse stable browser family from UA (Chromium Edge before Chrome). */
export function detectBrowserFamily(userAgent: string): HdrBrowserFamily {
  const ua = userAgent.toLowerCase()
  if (ua.includes('edg/')) return 'edge'
  if (ua.includes('firefox/')) return 'firefox'
  if (ua.includes('chrome/') || ua.includes('crios/')) return 'chrome'
  if (ua.includes('safari/') && !ua.includes('chrome/') && !ua.includes('chromium/')) return 'safari'
  return 'other'
}

export function detectOsFamily(userAgent: string): HdrOsFamily {
  const ua = userAgent.toLowerCase()
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos'
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios'
  if (ua.includes('android')) return 'android'
  if (ua.includes('linux')) return 'linux'
  return 'other'
}

/** `(dynamic-range: high)` — display capability hint, not OS HDR toggle. */
export function probeDynamicRangeHigh(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(dynamic-range: high)').matches
  } catch {
    return false
  }
}

export function readScreenColorGamut(): string {
  if (typeof screen === 'undefined') return 'unknown'
  const g = (screen as Screen & { colorGamut?: string }).colorGamut
  return typeof g === 'string' && g.length > 0 ? g : 'unknown'
}

export function probeCanvasHdrHints(): { canvasHdrSupported: boolean; dynamicRangeHigh: boolean; colorGamut: string } {
  const dynamicRangeHigh = probeDynamicRangeHigh()
  const colorGamut = readScreenColorGamut()
  const wideGamut = colorGamut !== 'unknown' && colorGamut !== 'srgb'
  return {
    dynamicRangeHigh,
    colorGamut,
    canvasHdrSupported: dynamicRangeHigh || wideGamut,
  }
}

export function probeWebGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu != null
}

/**
 * Request a WebGPU adapter without noisy Chromium warnings on Windows
 * (`powerPreference` is ignored there — crbug.com/369219127).
 */
export async function requestWebGpuAdapter(): Promise<GPUAdapter | null> {
  if (!probeWebGpuAvailable() || !navigator.gpu) return null
  if (detectOsFamily(navigator.userAgent) === 'windows') {
    return navigator.gpu.requestAdapter()
  }
  return navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
}

export function resolveDisplayHdr(dynamicRangeHigh: boolean): HdrDisplayState {
  if (dynamicRangeHigh) return 'hdr'
  if (typeof window !== 'undefined') return 'sdr'
  return 'unknown'
}

/**
 * Maps probe inputs to Phase 29 spec §4.3 row numbers (pre-classification).
 * Returns `null` when the combination is not uniquely identifiable.
 */
export function resolveMatrixRow(input: HdrMatrixInput): number | null {
  if (input.postFxBloomEnabled) return 11
  if (input.displayHdr === 'sdr') return 7
  if (input.displayHdr === 'unknown') return null

  const extOk = input.webgpuExtendedToneMapping === true

  if (input.apiPath === 'webgl2-srgb') {
    if (input.os === 'windows' && (input.browser === 'chrome' || input.browser === 'edge')) return 4
    if (input.os === 'macos' && input.browser === 'safari') return 5
    return 4
  }

  if (extOk && input.apiPath === 'webgpu-extended') {
    if (input.os === 'windows' && input.browser === 'chrome') return 1
    if (input.os === 'windows' && input.browser === 'edge') return 2
    if (input.os === 'macos' && input.browser === 'safari') return 3
    if (input.browser === 'firefox') return 8
    return 9
  }

  if (input.apiPath === 'canvas-2d-hdr') return 10

  return null
}

export function deriveVerdictPre(input: HdrMatrixInput, matrixRow: number | null): HdrVerdictPre {
  if (matrixRow === 7) return 'blocked'
  if (matrixRow === 11 || matrixRow === 12) return 'blocked'
  if (matrixRow === 6) return 'blocked'
  if (input.apiPath === 'webgl2-srgb') return 'fallback-sdr'
  if (input.webgpuExtendedToneMapping === true && (matrixRow === 1 || matrixRow === 2 || matrixRow === 3)) {
    return 'experimental'
  }
  if (matrixRow === 8 || matrixRow === 9 || matrixRow === 10) return 'experimental'
  if (input.displayHdr === 'sdr') return 'blocked'
  return 'fallback-sdr'
}

export function deriveMeetsTargetMatrix(matrixRow: number | null, webgpuExtended: WebGpuExtendedProbeState): boolean {
  if (webgpuExtended !== true) return false
  return matrixRow === 1 || matrixRow === 2 || matrixRow === 3
}

/**
 * Production galaxy uses WebGL2 + sRGB today → always `sdr` unless a future path sets extended output.
 * `hdr-capable` = P0/P1 hardware/API stack likely ready for §29.3 lab proof.
 */
export function deriveRecommendedMode(
  meetsTargetMatrix: boolean,
  productionApiPath: HdrApiPath,
): HdrRecommendedMode {
  if (productionApiPath === 'webgpu-extended') return 'hdr-active'
  if (meetsTargetMatrix) return 'hdr-capable'
  return 'sdr'
}

function threeOutputColorSpaceLabel(renderer: THREE.WebGLRenderer): string {
  const space = renderer.outputColorSpace
  if (space === 'srgb-linear') return 'srgb-linear'
  if (space === 'srgb') return 'srgb'
  return String(space)
}

export function buildHdrCapabilitiesReport(
  renderer: THREE.WebGLRenderer,
  overrides?: Partial<{
    webgpuExtendedToneMapping: WebGpuExtendedProbeState
    postFxBloomEnabled: boolean
  }>,
): HdrCapabilitiesReport {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const browser = detectBrowserFamily(ua)
  const os = detectOsFamily(ua)
  const { canvasHdrSupported, dynamicRangeHigh, colorGamut } = probeCanvasHdrHints()
  const displayHdr = resolveDisplayHdr(dynamicRangeHigh)
  const webgpuAvailable = probeWebGpuAvailable()
  const webgpuExtendedToneMapping = overrides?.webgpuExtendedToneMapping ?? (webgpuAvailable ? 'pending' : 'unsupported')
  const apiPath: HdrApiPath = 'webgl2-srgb'
  const postFxBloomEnabled = overrides?.postFxBloomEnabled ?? false

  const matrixInput: HdrMatrixInput = {
    browser,
    os,
    displayHdr,
    apiPath: webgpuExtendedToneMapping === true ? 'webgpu-extended' : apiPath,
    webgpuExtendedToneMapping,
    postFxBloomEnabled,
  }
  const matrixRow = resolveMatrixRow(matrixInput)
  const verdictPre = deriveVerdictPre(matrixInput, matrixRow)
  const meetsTargetMatrix = deriveMeetsTargetMatrix(matrixRow, webgpuExtendedToneMapping)
  const recommendedMode = deriveRecommendedMode(meetsTargetMatrix, apiPath)

  const notes: string[] = [
    'osHdr is not exposed by browsers; treat as unknown unless manually verified.',
    'dynamic-range:high indicates display headroom hint, not OS HDR toggle.',
    'webgpuExtendedToneMapping requires async probe; initial report may show pending.',
    'recommendedMode reflects production WebGL2+sRGB path unless extended API is active.',
  ]

  return {
    webgl2: renderer.capabilities.isWebGL2,
    outputColorSpace: threeOutputColorSpaceLabel(renderer),
    canvasHdrSupported,
    dynamicRangeHigh,
    colorGamut,
    webgpuAvailable,
    webgpuExtendedToneMapping,
    browser,
    os,
    osHdr: 'unknown',
    displayHdr,
    apiPath,
    matrixRow,
    verdictPre,
    meetsTargetMatrix,
    recommendedMode,
    userAgent: ua,
    probedAt: new Date().toISOString(),
    notes,
  }
}

/**
 * Attempt WebGPU canvas `toneMapping.mode: "extended"` (off-DOM). Updates report in-place via callback.
 */
export async function probeWebGpuExtendedToneMapping(): Promise<boolean> {
  if (!probeWebGpuAvailable() || !navigator.gpu) return false

  let device: GPUDevice | null = null
  try {
    const adapter = await requestWebGpuAdapter()
    if (!adapter) return false

    device = await adapter.requestDevice()
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgpu')
    if (!context) return false

    const format = navigator.gpu.getPreferredCanvasFormat()
    context.configure({
      device,
      format,
      toneMapping: { mode: 'extended' },
    })
    return true
  } catch {
    return false
  } finally {
    device?.destroy()
  }
}

export function scheduleWebGpuHdrProbe(
  renderer: THREE.WebGLRenderer,
  onUpdate: (report: HdrCapabilitiesReport) => void,
  options?: { postFxBloomEnabled?: boolean; onReportUpdated?: (report: HdrCapabilitiesReport) => void },
): void {
  if (!probeWebGpuAvailable()) return

  void (async () => {
    const extended = await probeWebGpuExtendedToneMapping()
    const report = buildHdrCapabilitiesReport(renderer, {
      webgpuExtendedToneMapping: extended ? true : false,
      postFxBloomEnabled: options?.postFxBloomEnabled,
    })
    onUpdate(report)
    options?.onReportUpdated?.(report)
  })()
}
