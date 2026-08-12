import { createHash } from 'node:crypto'

/** Compact evidence metadata bound to a capture or owner-check run (#381). */

export const EVIDENCE_SCHEMA = 'chronicle-acceptance-evidence-v1' as const

export type EvidenceArtifact = {
  readonly path: string
  readonly sha256: string
  readonly kind: 'screenshot' | 'contact-sheet' | 'manifest' | 'log' | 'other'
}

export type AcceptanceEvidence = {
  readonly schema: typeof EVIDENCE_SCHEMA
  readonly merge_base: string
  readonly candidate_commit: string
  readonly command: string
  readonly environment: {
    readonly os: string
    readonly node: string
    readonly cwd: string
  }
  readonly browser?: {
    readonly name: string
    readonly version: string
    readonly renderer?: string
  }
  readonly viewport?: {
    readonly id: string
    readonly width: number
    readonly height: number
    readonly deviceScaleFactor: number
  }
  readonly data_profile?: {
    readonly data_version?: string
    readonly profile_id?: string
    readonly identity: string
  }
  readonly artifacts: readonly EvidenceArtifact[]
  readonly created_at: string
}

function fail(message: string): never {
  throw new Error(`acceptance-evidence: ${message}`)
}

function assertSha(value: unknown, location: string): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    fail(`${location} must be a 40-character git SHA`)
  }
}

function assertNonEmpty(value: unknown, location: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${location} must be a non-empty string`)
  }
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function validateAcceptanceEvidence(value: unknown): asserts value is AcceptanceEvidence {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('must be a plain object')
  }
  const record = value as Record<string, unknown>
  if (record.schema !== EVIDENCE_SCHEMA) {
    fail(`schema must be "${EVIDENCE_SCHEMA}"`)
  }
  assertSha(record.merge_base, 'merge_base')
  assertSha(record.candidate_commit, 'candidate_commit')
  assertNonEmpty(record.command, 'command')
  assertNonEmpty(record.created_at, 'created_at')
  if (record.environment === null || typeof record.environment !== 'object' || Array.isArray(record.environment)) {
    fail('environment must be an object')
  }
  const environment = record.environment as Record<string, unknown>
  assertNonEmpty(environment.os, 'environment.os')
  assertNonEmpty(environment.node, 'environment.node')
  assertNonEmpty(environment.cwd, 'environment.cwd')
  if (!Array.isArray(record.artifacts)) {
    fail('artifacts must be an array')
  }
  for (const [index, artifact] of record.artifacts.entries()) {
    if (artifact === null || typeof artifact !== 'object' || Array.isArray(artifact)) {
      fail(`artifacts[${index}] must be an object`)
    }
    const item = artifact as Record<string, unknown>
    assertNonEmpty(item.path, `artifacts[${index}].path`)
    if (typeof item.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(item.sha256)) {
      fail(`artifacts[${index}].sha256 must be a 64-character hex digest`)
    }
    if (!['screenshot', 'contact-sheet', 'manifest', 'log', 'other'].includes(item.kind as string)) {
      fail(`artifacts[${index}].kind is invalid`)
    }
  }
}

export function buildAcceptanceEvidence(input: Omit<AcceptanceEvidence, 'schema'>): AcceptanceEvidence {
  const evidence: AcceptanceEvidence = {
    schema: EVIDENCE_SCHEMA,
    ...input,
  }
  validateAcceptanceEvidence(evidence)
  return evidence
}
