import { describe, expect, it } from 'vitest'

import { buildAcceptanceEvidence, sha256Hex, validateAcceptanceEvidence } from './evidenceMetadata.js'

const sha = '0123456789abcdef0123456789abcdef01234567'
const other = 'abcdef0123456789abcdef0123456789abcdef01'

describe('acceptance evidence metadata', () => {
  it('binds merge-base, candidate, command, environment, and artifact hashes', () => {
    const evidence = buildAcceptanceEvidence({
      merge_base: sha,
      candidate_commit: other,
      command: 'npm run test:journeys -w acceptance-harness',
      environment: {
        os: 'win32',
        node: process.version,
        cwd: '/repo',
      },
      browser: {
        name: 'chromium',
        version: '1.52.0',
        renderer: 'ANGLE',
      },
      viewport: {
        id: 'app-desktop',
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      },
      data_profile: {
        data_version: 'fixture',
        profile_id: 'n/a',
        identity: 'dev-bundled-gzip',
      },
      artifacts: [
        {
          path: 'artifacts/home.png',
          sha256: sha256Hex('home'),
          kind: 'screenshot',
        },
      ],
      created_at: '2026-08-12T00:00:00.000Z',
    })

    expect(evidence.schema).toBe('chronicle-acceptance-evidence-v1')
    expect(() => validateAcceptanceEvidence(evidence)).not.toThrow()
  })

  it('rejects incomplete commit binding', () => {
    expect(() =>
      buildAcceptanceEvidence({
        merge_base: 'short',
        candidate_commit: other,
        command: 'x',
        environment: { os: 'a', node: 'b', cwd: 'c' },
        artifacts: [],
        created_at: '2026-08-12T00:00:00.000Z',
      }),
    ).toThrow(/merge_base/)
  })
})
