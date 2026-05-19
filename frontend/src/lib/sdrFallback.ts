import * as THREE from 'three'

import type { HdrCapabilitiesReport, HdrVerdictPre } from './hdrCapabilities'

/**
 * Phase 29.4 — SDR production fallback policy (SSOT for galaxy render path).
 * HDR lab tools (`__hdrProbe`, WebGPU extended probe) must not change these invariants.
 */

export const SDR_FALLBACK_OUTPUT_COLOR_SPACE = THREE.SRGBColorSpace
export const SDR_FALLBACK_OUTPUT_COLOR_SPACE_LABEL = 'srgb'

export type SdrGalaxyRenderPath = 'webgl2-srgb-direct'

export type SdrFallbackReason =
  | 'production-default'
  | 'hdr-blocked-matrix'
  | 'hdr-experimental-not-shipped'
  | 'hdr-capable-awaiting-phase33'
  | 'webgl2-unavailable'

export interface SdrProductionPolicy {
  /** Galaxy always uses direct WebGL2 render until Phase 33 ships an HDR path. */
  galaxyRenderPath: SdrGalaxyRenderPath
  outputColorSpace: string
  /** Production default; Bloom is debug-only (`window.__bloom`). */
  bloomEnabled: false
  /** `__hdrProbe` uses a separate overlay canvas; must stay hidden unless invoked. */
  hdrProofOverlayIsolated: true
  fallbackReason: SdrFallbackReason
  verdictPre: HdrVerdictPre
  matrixRow: number | null
  meetsTargetMatrix: boolean
  recommendedMode: HdrCapabilitiesReport['recommendedMode']
  notes: string[]
}

const LOG_PREFIX = '[sdrFallback]'

export function buildSdrProductionPolicy(report: HdrCapabilitiesReport): SdrProductionPolicy {
  const fallbackReason = deriveFallbackReason(report)
  const notes = [
    'Phase 29 locks galaxy output to WebGL2 + SRGBColorSpace (D2).',
    'HDR capability / proof modules are diagnostic only until Phase 33 go.',
    'SDR readability tuning belongs to Phase 32 — do not change galaxyMeshes here.',
  ]

  if (report.verdictPre === 'blocked') {
    notes.push('Matrix verdict blocked — remain on SDR; no auto Bloom or uLMax HDR boost.')
  } else if (report.meetsTargetMatrix) {
    notes.push('P0/P1 stack hdr-capable but D1 proof / Phase 33 gate not passed — still SDR production.')
  }

  return {
    galaxyRenderPath: 'webgl2-srgb-direct',
    outputColorSpace: SDR_FALLBACK_OUTPUT_COLOR_SPACE_LABEL,
    bloomEnabled: false,
    hdrProofOverlayIsolated: true,
    fallbackReason,
    verdictPre: report.verdictPre,
    matrixRow: report.matrixRow,
    meetsTargetMatrix: report.meetsTargetMatrix,
    recommendedMode: report.recommendedMode,
    notes,
  }
}

export function deriveFallbackReason(report: HdrCapabilitiesReport): SdrFallbackReason {
  if (!report.webgl2) return 'webgl2-unavailable'
  if (report.verdictPre === 'blocked') return 'hdr-blocked-matrix'
  if (report.meetsTargetMatrix || report.recommendedMode === 'hdr-capable') {
    return 'hdr-capable-awaiting-phase33'
  }
  if (report.verdictPre === 'experimental') return 'hdr-experimental-not-shipped'
  return 'production-default'
}

/**
 * Dev-time guard: production renderer must stay on the locked SDR color space.
 * Throws in development when violated; logs a warning in production builds.
 */
export function assertSdrProductionRenderer(renderer: THREE.WebGLRenderer, policy: SdrProductionPolicy): void {
  const ok =
    renderer.capabilities.isWebGL2 &&
    renderer.outputColorSpace === SDR_FALLBACK_OUTPUT_COLOR_SPACE &&
    policy.galaxyRenderPath === 'webgl2-srgb-direct' &&
    policy.bloomEnabled === false

  if (ok) return

  const msg =
    `${LOG_PREFIX} SDR production invariant violated: ` +
    `webgl2=${renderer.capabilities.isWebGL2} ` +
    `outputColorSpace=${renderer.outputColorSpace} ` +
    `policy=${JSON.stringify({
      galaxyRenderPath: policy.galaxyRenderPath,
      bloomEnabled: policy.bloomEnabled,
    })}`

  if (import.meta.env.DEV) {
    throw new Error(msg)
  }
  console.warn(msg)
}

export function logSdrFallbackPolicy(policy: SdrProductionPolicy): void {
  console.log(LOG_PREFIX, policy)
}

export interface SdrFallbackDebug {
  readonly policy: SdrProductionPolicy
  log: () => void
  /** Re-read capability report and refresh policy (e.g. after WebGPU async probe). */
  refresh: () => SdrProductionPolicy
}

export function createSdrFallbackDebug(
  renderer: THREE.WebGLRenderer,
  getCapabilitiesReport: () => HdrCapabilitiesReport,
): SdrFallbackDebug {
  let policy = buildSdrProductionPolicy(getCapabilitiesReport())
  assertSdrProductionRenderer(renderer, policy)
  logSdrFallbackPolicy(policy)

  return {
    get policy() {
      return policy
    },
    log: () => logSdrFallbackPolicy(policy),
    refresh: () => {
      policy = buildSdrProductionPolicy(getCapabilitiesReport())
      assertSdrProductionRenderer(renderer, policy)
      logSdrFallbackPolicy(policy)
      return policy
    },
  }
}
