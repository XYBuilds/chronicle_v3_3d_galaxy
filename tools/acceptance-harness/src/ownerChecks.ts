import type { RiskDeclaration } from './riskDeclaration.js'
import { requiredOwnerCheckGroups } from './riskDeclaration.js'

export type OwnerCheck = {
  readonly id: string
  readonly group: string
  readonly title: string
  readonly command: string
  readonly cwd: '.' | 'frontend' | 'tools/planet-exporter' | 'tools/acceptance-harness'
  readonly owner: 'chronicle' | 'daily' | 'og-worker'
  readonly kind: 'local' | 'handoff'
}

/** Composed owner checks. Humans declare risk; this matrix only routes declared groups. */
export const OWNER_CHECKS: readonly OwnerCheck[] = [
  {
    id: 'frontend-test',
    group: 'frontend-core',
    title: 'Frontend Vitest',
    command: 'npm test',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'frontend-lint',
    group: 'frontend-core',
    title: 'Frontend lint',
    command: 'npm run lint',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'frontend-build',
    group: 'frontend-core',
    title: 'Frontend build',
    command: 'npm run build',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'pages-deploy-assets',
    group: 'pages-assets',
    title: 'Pages deploy assets (when Pages preparation is touched)',
    command: 'npm run test:pages-deploy-assets -w frontend',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'git-diff-check',
    group: 'git-hygiene',
    title: 'Whitespace / conflict-marker check',
    command: 'git diff --check',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'storybook-build',
    group: 'storybook',
    title: 'Storybook static build',
    command: 'npm run build-storybook',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'storybook-a11y',
    group: 'storybook',
    title: 'Storybook a11y scan (no new critical/serious)',
    command: 'npm run test:storybook-a11y -w acceptance-harness',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'storybook-capture',
    group: 'storybook',
    title: 'Deterministic Storybook captures',
    command: 'npm run capture:storybook -w acceptance-harness',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'app-journeys',
    group: 'app-journeys',
    title: 'Fixed Chromium Chronicle journey suite',
    command: 'npm run test:journeys -w acceptance-harness',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'planet-test',
    group: 'planet-export',
    title: 'Planet Export unit tests',
    command: 'npm run test -w planet-exporter',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'planet-typecheck',
    group: 'planet-export',
    title: 'Planet Export typecheck',
    command: 'npm run typecheck -w planet-exporter',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'planet-lint',
    group: 'planet-export',
    title: 'Planet Export lint',
    command: 'npm run lint -w planet-exporter',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'planet-integration',
    group: 'planet-export',
    title: 'Planet Export Chromium integration',
    command: 'npm run test:integration -w planet-exporter',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'python-tests',
    group: 'data-publication',
    title: 'Python fixture / dry-run / manifest suite',
    command: 'python -m pytest -q scripts/tests',
    cwd: '.',
    owner: 'chronicle',
    kind: 'local',
  },
  {
    id: 'daily-handoff',
    group: 'daily-handoff',
    title: 'Daily consumer suites (owned by Daily repository)',
    command: 'See docs/system/acceptance-harness.md#daily-and-og-worker-handoff',
    cwd: '.',
    owner: 'daily',
    kind: 'handoff',
  },
  {
    id: 'og-worker-handoff',
    group: 'og-worker-handoff',
    title: 'OG Worker npm test / typecheck / dry-run / smoke (owned by Worker)',
    command: 'See docs/system/acceptance-harness.md#daily-and-og-worker-handoff',
    cwd: '.',
    owner: 'og-worker',
    kind: 'handoff',
  },
  {
    id: 'r3-smoke-handoff',
    group: 'r3-smoke-handoff',
    title: 'Authorized R3 production smoke (human + owning repos)',
    command: 'See docs/system/acceptance-harness.md#r3-production-smoke',
    cwd: '.',
    owner: 'chronicle',
    kind: 'handoff',
  },
] as const

export function selectOwnerChecks(declaration: RiskDeclaration): readonly OwnerCheck[] {
  const groups = new Set(requiredOwnerCheckGroups(declaration))
  return OWNER_CHECKS.filter((check) => groups.has(check.group))
}

export function formatOwnerCheckMatrix(checks: readonly OwnerCheck[]): string {
  return checks
    .map((check) => `- [${check.owner}/${check.kind}] ${check.id}: \`${check.command}\``)
    .join('\n')
}
