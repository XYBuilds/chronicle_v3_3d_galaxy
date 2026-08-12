import { describe, expect, it } from 'vitest'

import { evaluateFailureAdmissibility, FAILURE_POLICY_SUMMARY } from './failurePolicy.js'

describe('failure policy', () => {
  it('blocks new failures that do not reproduce on merge-base', () => {
    const result = evaluateFailureAdmissibility({
      command: 'npm test',
      signature: 'AssertionError: foo',
      candidateCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      mergeBaseCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      reproducesOnMergeBase: false,
      sliceTouchesFailingSurface: false,
    })
    expect(result.allowed).toBe(false)
  })

  it('allows recorded pre-existing failures when merge-base reproduces and surface is untouched', () => {
    const result = evaluateFailureAdmissibility({
      command: 'npm test',
      signature: 'AssertionError: foo',
      candidateCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      mergeBaseCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      reproducesOnMergeBase: true,
      sliceTouchesFailingSurface: false,
    })
    expect(result.allowed).toBe(true)
  })

  it('blocks updating baselines merely to go green via policy summary', () => {
    expect(FAILURE_POLICY_SUMMARY.join(' ')).toMatch(/never updated merely/i)
  })
})
