/** Human-declared risk tier and protected surfaces for a delivery Issue/PR (#371 / #381). */

export const RISK_TIERS = ['R0', 'R1', 'R2', 'R3'] as const
export type RiskTier = (typeof RISK_TIERS)[number]

export const PROTECTED_SURFACES = [
  'visual_output',
  'browser_journey',
  'publication',
  'planet_export',
  'og_worker',
  'daily',
] as const
export type ProtectedSurface = (typeof PROTECTED_SURFACES)[number]

export type RiskDeclaration = {
  readonly schema: 'chronicle-risk-declaration-v1'
  readonly tier: RiskTier
  readonly surfaces: readonly ProtectedSurface[]
  readonly notes?: string
}

function fail(message: string): never {
  throw new Error(`risk-declaration: ${message}`)
}

export function validateRiskDeclaration(value: unknown): asserts value is RiskDeclaration {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('must be a plain object')
  }
  const record = value as Record<string, unknown>
  if (record.schema !== 'chronicle-risk-declaration-v1') {
    fail('schema must be "chronicle-risk-declaration-v1"')
  }
  if (!RISK_TIERS.includes(record.tier as RiskTier)) {
    fail(`tier must be one of ${RISK_TIERS.join(', ')}`)
  }
  if (!Array.isArray(record.surfaces)) {
    fail('surfaces must be an array')
  }
  const seen = new Set<string>()
  for (const surface of record.surfaces) {
    if (!PROTECTED_SURFACES.includes(surface as ProtectedSurface)) {
      fail(`unknown surface "${String(surface)}"`)
    }
    if (seen.has(surface as string)) {
      fail(`duplicate surface "${String(surface)}"`)
    }
    seen.add(surface as string)
  }
  if (record.notes !== undefined && typeof record.notes !== 'string') {
    fail('notes must be a string when present')
  }
}

export function parseRiskDeclaration(value: unknown): RiskDeclaration {
  validateRiskDeclaration(value)
  return {
    schema: value.schema,
    tier: value.tier,
    surfaces: [...value.surfaces],
    ...(value.notes !== undefined ? { notes: value.notes } : {}),
  }
}

/** Highest declared tier wins; surfaces are additive triggers. */
export function requiredOwnerCheckGroups(declaration: RiskDeclaration): readonly string[] {
  const groups = new Set<string>(['git-hygiene'])
  if (declaration.tier !== 'R0') {
    groups.add('frontend-core')
  }
  if (
    declaration.surfaces.includes('visual_output') ||
    declaration.tier === 'R2' ||
    declaration.tier === 'R3'
  ) {
    groups.add('storybook')
  }
  if (declaration.surfaces.includes('browser_journey') || declaration.tier === 'R2' || declaration.tier === 'R3') {
    groups.add('app-journeys')
  }
  if (declaration.surfaces.includes('planet_export')) {
    groups.add('planet-export')
  }
  if (declaration.surfaces.includes('publication') || declaration.tier === 'R3') {
    groups.add('data-publication')
    groups.add('pages-assets')
  }
  if (declaration.surfaces.includes('daily')) {
    groups.add('daily-handoff')
  }
  if (declaration.surfaces.includes('og_worker')) {
    groups.add('og-worker-handoff')
  }
  if (declaration.tier === 'R3') {
    groups.add('r3-smoke-handoff')
  }
  return [...groups].sort()
}
