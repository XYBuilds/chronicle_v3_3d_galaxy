/** Encoded failure rules for the acceptance harness (#371 / #381). */

export type FailureAdmissibility = {
  readonly allowed: boolean
  readonly reason: string
}

export type FailureRecordInput = {
  readonly command: string
  readonly signature: string
  readonly candidateCommit: string
  readonly mergeBaseCommit: string
  readonly reproducesOnMergeBase: boolean
  readonly sliceTouchesFailingSurface: boolean
}

/**
 * No new failure is accepted. A pre-existing failure is admissible only when the
 * identical command/signature reproduces on the clean merge-base and the slice
 * does not touch that protected surface. Never update a baseline merely to go green.
 */
export function evaluateFailureAdmissibility(input: FailureRecordInput): FailureAdmissibility {
  if (input.sliceTouchesFailingSurface) {
    return {
      allowed: false,
      reason: 'slice touches the failing protected surface; remediate or split ownership',
    }
  }
  if (!input.reproducesOnMergeBase) {
    return {
      allowed: false,
      reason: 'failure does not reproduce on the clean merge-base with the same command/signature',
    }
  }
  if (input.candidateCommit === input.mergeBaseCommit) {
    return {
      allowed: false,
      reason: 'candidate and merge-base SHAs must differ when recording a pre-existing failure',
    }
  }
  return {
    allowed: true,
    reason: 'pre-existing failure reproduces on merge-base and the slice does not touch the surface',
  }
}

export const FAILURE_POLICY_SUMMARY = [
  'No new failure is accepted.',
  'A pre-existing failure may be recorded only when the identical command and failure signature reproduce on the clean merge-base in the same environment and the slice does not touch that protected surface.',
  'Record both SHAs, the command, environment, and signature.',
  'Baselines, hashes, or thresholds are never updated merely to turn a regression green.',
] as const
