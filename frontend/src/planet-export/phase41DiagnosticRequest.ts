import { parsePlanetExportRequest, type LegacyCompatiblePlanetExportRequest } from './request'
import {
  PHASE41_DIAGNOSTIC_MARKER,
  parsePhase41DiagnosticOverride,
  resolvePhase41VisualProfile,
  type Phase41DiagnosticOverride,
  type ResolvedDiagnosticEmissionProfile,
  type ResolvedPhase41VisualProfile,
} from './phase41DiagnosticProfile'

export type Phase41DiagnosticRequest = LegacyCompatiblePlanetExportRequest & {
  diagnostic_only: typeof PHASE41_DIAGNOSTIC_MARKER
  profileOverride?: Phase41DiagnosticOverride
}

const allowed = new Set(['movieId', 'dataUrl', 'resolution', 'padding', 'bloom', 'sizeRoot', 'renderMode', 'profilePointer', 'profileUrl', 'allowLegacyProfile', 'diagnostic_only', 'profile'])

function exactlyOne(params: URLSearchParams, name: string): string {
  const values = params.getAll(name)
  if (values.length !== 1 || !values[0]?.trim()) throw new Error(`[Phase41 diagnostic] ${name} must appear exactly once`)
  return values[0].trim()
}

/** Separate offline-only URL boundary. Normal request.ts rejects both marker and profile. */
export function parsePhase41DiagnosticRequest(search: string): Phase41DiagnosticRequest {
  const params = new URLSearchParams(search)
  for (const [name] of params) {
    if (!allowed.has(name)) throw new Error(`[Phase41 diagnostic] unknown request parameter ${name}`)
  }
  if (exactlyOne(params, 'diagnostic_only') !== PHASE41_DIAGNOSTIC_MARKER) {
    throw new Error(`[Phase41 diagnostic] diagnostic_only must equal ${PHASE41_DIAGNOSTIC_MARKER}`)
  }
  const profileValues = params.getAll('profile')
  if (profileValues.length > 1) throw new Error('[Phase41 diagnostic] profile must appear at most once')
  const profileText = profileValues[0] ?? null
  let profileOverride: Phase41DiagnosticOverride | undefined
  if (profileText !== null) {
    try {
      profileOverride = parsePhase41DiagnosticOverride(JSON.parse(profileText))
    } catch (error) {
      throw new Error(`[Phase41 diagnostic] invalid profile: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  params.delete('diagnostic_only')
  params.delete('profile')
  const request = parsePlanetExportRequest(`?${params.toString()}`, { allowLegacyProfile: true })
  if (profileOverride?.bloom !== undefined && profileOverride.bloom.enabled !== request.bloom) {
    throw new Error('[Phase41 diagnostic] profile.bloom.enabled must match the bloom request parameter')
  }
  return { ...request, diagnostic_only: PHASE41_DIAGNOSTIC_MARKER, ...(profileOverride === undefined ? {} : { profileOverride }) }
}

export function resolvePhase41DiagnosticRequest(
  request: Phase41DiagnosticRequest,
  emissionProfile?: ResolvedDiagnosticEmissionProfile,
): ResolvedPhase41VisualProfile {
  if (request.diagnostic_only !== PHASE41_DIAGNOSTIC_MARKER) {
    throw new Error(`[Phase41 diagnostic] diagnostic_only must equal ${PHASE41_DIAGNOSTIC_MARKER}`)
  }
  if (emissionProfile === undefined) throw new Error('[Phase41 diagnostic] resolved emission profile is required')
  return resolvePhase41VisualProfile(request.profileOverride, request.bloom, emissionProfile)
}