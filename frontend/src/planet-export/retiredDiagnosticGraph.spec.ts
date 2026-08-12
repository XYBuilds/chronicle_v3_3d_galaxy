import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.resolve(frontendRoot, '..')

const RETIRED_FRONTEND_FILES = [
  'phase41-diagnostics.html',
  'p3910-bloom-strength-zero-diagnostics.html',
  'p3911-checkpoint-a-diagnostics.html',
  'p3911-checkpoint-b-diagnostics.html',
  'p3911-checkpoint-c-radius-diagnostics.html',
  'p3911-checkpoint-c-strength-diagnostics.html',
  'p3911-checkpoint-c-threshold-diagnostics.html',
  'src/planet-export/p39LegacyVisualState.ts',
  'src/planet-export/p3910BloomStrengthZeroDiagnostics.ts',
  'src/planet-export/p3910BloomStrengthZeroMain.ts',
  'src/planet-export/p3911CheckpointADiagnostics.ts',
  'src/planet-export/p3911CheckpointAMain.ts',
  'src/planet-export/p3911CheckpointBDiagnostics.ts',
  'src/planet-export/p3911CheckpointBMain.ts',
  'src/planet-export/p3911CheckpointCRadiusDiagnostics.ts',
  'src/planet-export/p3911CheckpointCRadiusMain.ts',
  'src/planet-export/p3911CheckpointCStrengthDiagnostics.ts',
  'src/planet-export/p3911CheckpointCStrengthMain.ts',
  'src/planet-export/p3911CheckpointCThresholdDiagnostics.ts',
  'src/planet-export/p3911CheckpointCThresholdMain.ts',
  'src/planet-export/phase41DiagnosticMain.ts',
  'src/planet-export/phase41DiagnosticProfile.ts',
  'src/planet-export/phase41DiagnosticRequest.ts',
  'src/lib/hdrProof.ts',
  'scripts/verify-p426-runtime.ts',
] as const

const RETIRED_REPO_FILES = [
  'scripts/cron/run_p426_production_gate.py',
  'tools/planet-exporter/fixtures/phase39-contract-baseline.json',
  'tools/planet-exporter/scripts/generate-p3910-evidence.ts',
  'tools/planet-exporter/scripts/generate-p3911-checkpoint-a-evidence.ts',
  'tools/planet-exporter/scripts/generate-p3911-checkpoint-b-evidence.ts',
  'tools/planet-exporter/scripts/generate-p3911-checkpoint-c-radius-evidence.ts',
  'tools/planet-exporter/scripts/generate-p3911-checkpoint-c-strength-evidence.ts',
  'tools/planet-exporter/scripts/generate-p3911-checkpoint-c-threshold-evidence.ts',
  'tools/planet-exporter/scripts/generate-p3911-final-evidence.ts',
  'tools/planet-exporter/scripts/generate-p41-baseline.ts',
  'tools/planet-exporter/scripts/generate-p41-emission-evidence.ts',
  'tools/planet-exporter/scripts/generate-p41-fixed-shaping-evidence.ts',
  'tools/planet-exporter/scripts/generate-p41-midrank-cdf-lut-evidence.ts',
  'tools/planet-exporter/scripts/generate-p416-bloom-integration-evidence.ts',
  'tools/planet-exporter/scripts/generate-p417-final-evidence.ts',
  'tools/planet-exporter/scripts/generate-p426-production-gate.ts',
  'tools/planet-exporter/scripts/render-p3910-matrix.ts',
  'tools/planet-exporter/src/p3910BloomStrengthZero.ts',
  'tools/planet-exporter/src/p3911CheckpointA.ts',
  'tools/planet-exporter/src/p3911CheckpointB.ts',
  'tools/planet-exporter/src/p3911CheckpointCRadius.ts',
  'tools/planet-exporter/src/p3911CheckpointCStrength.ts',
  'tools/planet-exporter/src/p3911CheckpointCThreshold.ts',
  'tools/planet-exporter/src/p416BloomEvidence.ts',
  'tools/planet-exporter/src/p41EmissionEvidence.ts',
  'tools/planet-exporter/src/p41FixedShaping.ts',
  'tools/planet-exporter/src/phase39Fixtures.ts',
  'tools/planet-exporter/src/phase41Baseline.ts',
  'tools/planet-exporter/src/phase41Diagnostic.ts',
] as const

const RETIRED_IMPORT = /\bfrom\s+['"][^'"]*(?:p39LegacyVisualState|p3910BloomStrengthZero|p3911Checkpoint|phase41Diagnostic|phase41Baseline|phase39Fixtures|p41EmissionEvidence|p41FixedShaping|p416BloomEvidence|p417FinalEvidence|hdrProof)(?:\.js)?['"]/
const RETIRED_ENTRY = /(?:p3910-bloom-strength-zero|p3911-checkpoint|phase41-diagnostics|verify-p426-runtime|generate-p426-production-gate|run_p426_production_gate|render-p3910)/

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true })
    .map((rel) => path.join(root, String(rel)))
    .filter((file) => /\.(ts|tsx|js|mjs|html)$/.test(file))
}

describe('retired Phase 39/41/P42.6 diagnostic graph', () => {
  it('keeps the closed frontend diagnostic entries and HDR proof module deleted', () => {
    for (const rel of RETIRED_FRONTEND_FILES) {
      expect(existsSync(path.join(frontendRoot, rel)), rel).toBe(false)
    }
  })

  it('keeps the closed P42.6 harness and Phase 39 baseline fixture deleted', () => {
    for (const rel of RETIRED_REPO_FILES) {
      expect(existsSync(path.join(repoRoot, rel)), rel).toBe(false)
    }
  })

  it('keeps remaining frontend and Planet Export sources free of retired diagnostic imports', () => {
    const lockFile = path.normalize(fileURLToPath(import.meta.url))
    const hits: string[] = []
    for (const file of [
      ...sourceFiles(path.join(frontendRoot, 'src')),
      ...sourceFiles(path.join(frontendRoot, 'scripts')),
      ...sourceFiles(path.join(repoRoot, 'tools/planet-exporter/src')),
      ...sourceFiles(path.join(repoRoot, 'tools/planet-exporter/scripts')),
      ...readdirSync(frontendRoot)
        .filter((name) => name.endsWith('.html'))
        .map((name) => path.join(frontendRoot, name)),
    ]) {
      if (path.normalize(file) === lockFile) continue
      const text = readFileSync(file, 'utf8')
      if (RETIRED_IMPORT.test(text) || RETIRED_ENTRY.test(text)) {
        hits.push(path.relative(repoRoot, file))
      }
    }
    expect(hits).toEqual([])
  })
})
