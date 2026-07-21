import { createHash } from 'node:crypto'

export const P41_4_LOW_EMISSION_CURVE = {
  modelVersion: 'vote-average-power-clamped-v1',
  exponent: 1,
  intensityMin: 0.005,
  intensityMax: 0.005,
} as const

export const P41_4_BLOOM_OFF = {
  enabled: false,
  strength: 0.01,
  radius: 1,
  threshold: 0,
} as const

export const P41_4_VISIBLE_BAND_CAP = 8

/**
 * Future contact sheets use categorical palette families and visible terrain
 * complexity. They intentionally never rank the cyclic hue or derived seed.
 */
export const P41_4_SEMANTIC_FUTURE_ROWS = [
  {
    fixture: 'semantic-warm-single-band',
    paletteFamily: 'warm',
    paletteFamilyLabel: 'warm palette family',
    primaryGenres: ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama'],
    terrainComplexity: 'single-visible-band',
    expectedVisibleBandCount: 1,
  },
  {
    fixture: 'semantic-cool-single-band',
    paletteFamily: 'cool',
    paletteFamilyLabel: 'cool palette family',
    primaryGenres: ['Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction'],
    terrainComplexity: 'single-visible-band',
    expectedVisibleBandCount: 1,
  },
  {
    fixture: 'semantic-violet-rose-single-band',
    paletteFamily: 'violet-rose',
    paletteFamilyLabel: 'violet-rose palette family',
    primaryGenres: ['TV Movie', 'Thriller', 'War', 'Western'],
    terrainComplexity: 'single-visible-band',
    expectedVisibleBandCount: 1,
  },
  {
    fixture: 'semantic-warm-max-visible-bands',
    paletteFamily: 'warm',
    paletteFamilyLabel: 'warm palette family',
    primaryGenres: ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama'],
    terrainComplexity: 'max-visible-bands',
    expectedVisibleBandCount: P41_4_VISIBLE_BAND_CAP,
  },
  {
    fixture: 'semantic-cool-max-visible-bands',
    paletteFamily: 'cool',
    paletteFamilyLabel: 'cool palette family',
    primaryGenres: ['Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction'],
    terrainComplexity: 'max-visible-bands',
    expectedVisibleBandCount: P41_4_VISIBLE_BAND_CAP,
  },
] as const

export type P41FixedShapingSemanticRow = typeof P41_4_SEMANTIC_FUTURE_ROWS[number]
export type P41FixedShapingFixtureSemantics = {
  movieId: number
  title: string
  hue: number
  seed: number
  primaryGenre: string
  paletteHex: string
  genres: readonly string[]
  visibleBandCount: number
  selectionPredicate: string
}

export function assertP41FixedShapingFixtureSemantics(
  row: P41FixedShapingSemanticRow,
  fixture: P41FixedShapingFixtureSemantics,
): void {
  if (!Number.isSafeInteger(fixture.movieId) || fixture.movieId <= 0) throw new Error('[P41.4 fixed shaping] fixture movie id must be a positive safe integer')
  if (!fixture.title.trim()) throw new Error('[P41.4 fixed shaping] fixture title must be non-empty')
  if (!Number.isFinite(fixture.hue)) throw new Error('[P41.4 fixed shaping] fixture hue must be finite reproducibility metadata')
  if (!Number.isSafeInteger(fixture.seed) || fixture.seed < 0) throw new Error('[P41.4 fixed shaping] fixture seed must be an unsigned integer')
  const primaryGenres: readonly string[] = row.primaryGenres
  if (!primaryGenres.includes(fixture.primaryGenre)) throw new Error(`[P41.4 fixed shaping] ${row.fixture} primary genre is outside its ${row.paletteFamily} palette family`)
  if (!/^#[0-9a-f]{6}$/i.test(fixture.paletteHex)) throw new Error(`[P41.4 fixed shaping] ${row.fixture} palette hex is invalid`)
  if (!Array.isArray(fixture.genres) || fixture.genres.length === 0 || fixture.genres.some((genre) => !genre.trim())) throw new Error(`[P41.4 fixed shaping] ${row.fixture} genres must be non-empty strings`)
  const visibleBandCount = Math.min(fixture.genres.length, P41_4_VISIBLE_BAND_CAP)
  if (fixture.visibleBandCount !== visibleBandCount || fixture.visibleBandCount !== row.expectedVisibleBandCount) {
    throw new Error(`[P41.4 fixed shaping] ${row.fixture} visible terrain complexity drifted`)
  }
  if (!fixture.selectionPredicate.trim()) throw new Error(`[P41.4 fixed shaping] ${row.fixture} selection predicate must be non-empty`)
}

export function p41FixedShapingSemanticRowLabel(row: P41FixedShapingSemanticRow, fixture: P41FixedShapingFixtureSemantics): string {
  assertP41FixedShapingFixtureSemantics(row, fixture)
  return `${row.paletteFamilyLabel} · ${row.terrainComplexity} · primary=${fixture.primaryGenre} · visible bands=${fixture.visibleBandCount}`
}

/** Structured manifest/sidecar fields; seed is reproducibility metadata only. */
export function p41FixedShapingSemanticRowParameters(row: P41FixedShapingSemanticRow, fixture: P41FixedShapingFixtureSemantics): Record<string, string | number | readonly string[]> {
  assertP41FixedShapingFixtureSemantics(row, fixture)
  return {
    palette_family: row.paletteFamily,
    palette_family_label: row.paletteFamilyLabel,
    terrain_complexity: row.terrainComplexity,
    expected_visible_band_count: row.expectedVisibleBandCount,
    fixture_movie_id: fixture.movieId,
    fixture_title: fixture.title,
    fixture_hue: fixture.hue,
    fixture_primary_genre: fixture.primaryGenre,
    fixture_palette_hex: fixture.paletteHex,
    fixture_genres: fixture.genres,
    fixture_visible_band_count: fixture.visibleBandCount,
    fixture_selection_predicate: fixture.selectionPredicate,
    fixture_seed: fixture.seed,
  }
}

export const P41_4_DIRECTION_CONVENTION = {
  space: 'world',
  lightVectorMeaning: 'frozen approved direction candidate',
  backlightZSign: 'positive-z',
  sideBackConstraint: 'positive-z is the user-defined backlight side; downstream checkpoints must not reinterpret candidate coordinates',
} as const

/** Frozen front-light candidates retained only to prove the backlight z flip. */
export const P41_4_FRONTLIGHT_DIRECTION_CANDIDATES = [
  { id: 'side-back-west', direction: [-0.7, 0.4, -0.59] as [number, number, number] },
  { id: 'side-back-east', direction: [0.7, 0.4, -0.59] as [number, number, number] },
  { id: 'side-back-high', direction: [0.38, 0.76, -0.53] as [number, number, number] },
] as const

export const P41_4_BACKLIGHT_DIRECTION_REVISION = {
  id: 'backlight-z-flip-v1',
  relation: 'replaces-frontlight-candidates',
  z_transform: 'negated-from-frontlight-candidates',
  backlight_z_sign: 'positive-z',
  replaces_candidate_ids: P41_4_FRONTLIGHT_DIRECTION_CANDIDATES.map((candidate) => candidate.id),
  invalidated_descendants: [
    {
      evidence_directory: 'data/runs/phase41/p41.4-fixed-shaping-lightness-v3-approved-direction-semantic-fixtures',
      status: 'invalidated-frontlight-descendant',
      reason: 'records a superseded front-light direction approval',
    },
    {
      evidence_directory: 'data/runs/phase41/p41.4-fixed-shaping-key-v3-approved-direction-semantic-fixtures',
      status: 'invalidated-frontlight-descendant',
      reason: 'records a superseded front-light direction approval',
    },
  ],
} as const

export const P41_4_DIRECTION_CANDIDATES = [
  { id: 'backlight-west-v1', direction: [-0.7, 0.4, 0.59] as [number, number, number] },
  { id: 'backlight-east-v1', direction: [0.7, 0.4, 0.59] as [number, number, number] },
  { id: 'backlight-high-v1', direction: [0.38, 0.76, 0.53] as [number, number, number] },
] as const

export const P41_4_LIGHTNESS_CANDIDATES = [
  { id: 'lightness-0.45', lightness: 0.45 },
  { id: 'lightness-0.50', lightness: 0.5 },
  { id: 'lightness-0.55', lightness: 0.55 },
  { id: 'lightness-0.66', lightness: 0.66 },
] as const

export const P41_4_KEY_CANDIDATES = [
  { id: 'key-0.25', keyLightIntensity: 0.25 },
  { id: 'key-0.35', keyLightIntensity: 0.35 },
  { id: 'key-0.45', keyLightIntensity: 0.45 },
] as const

export const P41_4_FIXED_LIGHTNESS_FOR_DIRECTION = 0.5
export const P41_4_FIXED_KEY_FOR_DIRECTION = 0.35
export const P41_4_FIXED_KEY_FOR_LIGHTNESS = 0.35

function assertLightnessCandidateValue(candidate: { id: string; lightness: number }): void {
  if (!Number.isFinite(candidate.lightness) || candidate.lightness < 0 || candidate.lightness > 1) {
    throw new Error(`[P41.4 fixed shaping] ${candidate.id} Lightness must be finite and within [0,1]`)
  }
}

export type P41FixedShapingCheckpoint = 'direction' | 'lightness' | 'key'
export type P41FixedShapingVariable = 'direction' | 'lightness' | 'keyLightIntensity'
export type P41FixedShapingApproval = { direction?: string; lightness?: string; candidate?: string }

export type P41FixedShapingReview = 'pending-human-review' | 'approved'

/** Versioned output root so semantic-row evidence cannot overwrite legacy sheets. */
export const P41_4_SEMANTIC_EVIDENCE_VERSION = 'v4-backlight-semantic-fixtures' as const

/** V5 isolates the follow-up Lightness comparison that introduces 0.66. */
export const P41_4_LIGHTNESS_066_SEMANTIC_EVIDENCE_VERSION = 'v5-backlight-lightness-066-semantic-fixtures' as const
export const P41_4_LIGHTNESS_066_FOLLOW_UP = {
  id: 'lightness-066-follow-up-v1',
  relation: 'extends-lightness-candidate-review',
  new_candidate: 'lightness-0.66',
  predecessor_evidence_directory: 'data/runs/phase41/p41.4-fixed-shaping-lightness-v4-backlight-semantic-fixtures',
  candidate_review: 'approved',
} as const

export function p41FixedShapingEvidenceRelativeDirectory(checkpoint: P41FixedShapingCheckpoint): string {
  const version = checkpoint === 'lightness' || checkpoint === 'key'
    ? P41_4_LIGHTNESS_066_SEMANTIC_EVIDENCE_VERSION
    : P41_4_SEMANTIC_EVIDENCE_VERSION
  return `data/runs/phase41/p41.4-fixed-shaping-${checkpoint}-${version}`
}

export type P41FixedShapingCandidate = {
  id: string
  direction: [number, number, number]
  lightness: number
  keyLightIntensity: number
}

export type P41FixedShapingHumanApprovedInput = {
  stage: 'direction' | 'lightness'
  parameter: 'direction' | 'lightness'
  candidate: string
  value: number | [number, number, number]
  source: 'explicit-cli-human-approved-input'
  status: 'human-approved-input'
}

export type P41FixedShapingExperiment = {
  checkpoint: P41FixedShapingCheckpoint
  variable: P41FixedShapingVariable
  candidates: readonly P41FixedShapingCandidate[]
  humanApprovedInputs: readonly P41FixedShapingHumanApprovedInput[]
  frozenUpstreamBaselineHash: string
  candidateReview: P41FixedShapingReview
  approvedCandidate?: string
}

export function p41FixedShapingFrozenUpstreamBaselineHash(inputs: readonly P41FixedShapingHumanApprovedInput[]): string {
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
}

function directionCandidate(id: string): [number, number, number] {
  const candidate = P41_4_DIRECTION_CANDIDATES.find((entry) => entry.id === id)
  if (!candidate) throw new Error(`[P41.4 fixed shaping] unknown approved direction candidate ${id}`)
  return normalizeDirection(candidate.direction)
}

function lightnessCandidate(id: string): number {
  const candidate = P41_4_LIGHTNESS_CANDIDATES.find((entry) => entry.id === id)
  if (!candidate) throw new Error(`[P41.4 fixed shaping] unknown approved Lightness candidate ${id}`)
  assertLightnessCandidateValue(candidate)
  return candidate.lightness
}

function requiredApproval(value: string | undefined, parameter: 'direction' | 'lightness', checkpoint: P41FixedShapingCheckpoint): string {
  if (!value) throw new Error(`[P41.4 fixed shaping] ${checkpoint} checkpoint requires human-approved --${parameter}`)
  return value
}

export function normalizeDirection(value: readonly number[]): [number, number, number] {
  if (value.length !== 3 || value.some((entry) => !Number.isFinite(entry))) {
    throw new Error('[P41.4 fixed shaping] direction must be three finite values')
  }
  const magnitude = Math.hypot(value[0]!, value[1]!, value[2]!)
  if (magnitude === 0) throw new Error('[P41.4 fixed shaping] direction must not be zero')
  return [value[0]! / magnitude, value[1]! / magnitude, value[2]! / magnitude]
}

/**
 * Resolves exactly one visual-gate stage. Downstream stages are impossible to
 * construct until their preceding human choice is supplied explicitly.
 */
export function p41FixedShapingExperiment(checkpoint: P41FixedShapingCheckpoint, approval: P41FixedShapingApproval = {}): P41FixedShapingExperiment {
  if (checkpoint === 'direction') {
    if (approval.direction !== undefined || approval.lightness !== undefined) {
      throw new Error('[P41.4 fixed shaping] direction checkpoint accepts no upstream inputs')
    }
    const approvedCandidateId = approval.candidate
    if (approvedCandidateId !== undefined && !P41_4_DIRECTION_CANDIDATES.some((candidate) => candidate.id === approvedCandidateId)) {
      throw new Error(`[P41.4 fixed shaping] unknown approved direction candidate ${approvedCandidateId}`)
    }
    return {
      checkpoint,
      variable: 'direction',
      candidates: P41_4_DIRECTION_CANDIDATES.map((entry) => ({
        id: entry.id,
        direction: normalizeDirection(entry.direction),
        lightness: P41_4_FIXED_LIGHTNESS_FOR_DIRECTION,
        keyLightIntensity: P41_4_FIXED_KEY_FOR_DIRECTION,
      })),
      humanApprovedInputs: [],
      frozenUpstreamBaselineHash: p41FixedShapingFrozenUpstreamBaselineHash([]),
      candidateReview: approvedCandidateId ? 'approved' : 'pending-human-review',
      ...(approvedCandidateId ? { approvedCandidate: approvedCandidateId } : {}),
    }
  }

  const approvedDirectionId = requiredApproval(approval.direction, 'direction', checkpoint)
  const approvedDirection = directionCandidate(approvedDirectionId)
  const directionInput: P41FixedShapingHumanApprovedInput = {
    stage: 'direction',
    parameter: 'direction',
    candidate: approvedDirectionId,
    value: approvedDirection,
    source: 'explicit-cli-human-approved-input',
    status: 'human-approved-input',
  }

  if (checkpoint === 'lightness') {
    if (approval.lightness !== undefined) {
      throw new Error('[P41.4 fixed shaping] lightness checkpoint accepts only human-approved --direction and --approve')
    }
    const approvedCandidateId = approval.candidate
    if (approvedCandidateId !== undefined && !P41_4_LIGHTNESS_CANDIDATES.some((candidate) => candidate.id === approvedCandidateId)) {
      throw new Error(`[P41.4 fixed shaping] unknown approved Lightness candidate ${approvedCandidateId}`)
    }
    return {
      checkpoint,
      variable: 'lightness',
      candidates: P41_4_LIGHTNESS_CANDIDATES.map((entry) => {
        assertLightnessCandidateValue(entry)
        return {
          id: entry.id,
          direction: approvedDirection,
          lightness: entry.lightness,
          keyLightIntensity: P41_4_FIXED_KEY_FOR_LIGHTNESS,
        }
      }),
      humanApprovedInputs: [directionInput],
      frozenUpstreamBaselineHash: p41FixedShapingFrozenUpstreamBaselineHash([directionInput]),
      candidateReview: approvedCandidateId ? 'approved' : 'pending-human-review',
      ...(approvedCandidateId ? { approvedCandidate: approvedCandidateId } : {}),
    }
  }

  const approvedLightnessId = requiredApproval(approval.lightness, 'lightness', checkpoint)
  const approvedLightness = lightnessCandidate(approvedLightnessId)
  const humanApprovedInputs: readonly P41FixedShapingHumanApprovedInput[] = [
    directionInput,
    {
      stage: 'lightness',
      parameter: 'lightness',
      candidate: approvedLightnessId,
      value: approvedLightness,
      source: 'explicit-cli-human-approved-input',
      status: 'human-approved-input',
    },
  ]
  const approvedCandidateId = approval.candidate
  if (approvedCandidateId !== undefined && !P41_4_KEY_CANDIDATES.some((candidate) => candidate.id === approvedCandidateId)) {
    throw new Error(`[P41.4 fixed shaping] unknown approved Key candidate ${approvedCandidateId}`)
  }
  return {
    checkpoint,
    variable: 'keyLightIntensity',
    candidates: P41_4_KEY_CANDIDATES.map((entry) => ({
      id: entry.id,
      direction: approvedDirection,
      lightness: approvedLightness,
      keyLightIntensity: entry.keyLightIntensity,
    })),
    humanApprovedInputs,
    frozenUpstreamBaselineHash: p41FixedShapingFrozenUpstreamBaselineHash(humanApprovedInputs),
    candidateReview: approvedCandidateId ? 'approved' : 'pending-human-review',
    ...(approvedCandidateId ? { approvedCandidate: approvedCandidateId } : {}),
  }
}

export type P41FixedShapingCommand = {
  checkpoint: P41FixedShapingCheckpoint
  approval: P41FixedShapingApproval
  experiment: P41FixedShapingExperiment
}

export const P41_FIXED_SHAPING_USAGE = [
  'usage:',
  'npm run evidence:p41.4 -- --checkpoint direction',
  'npm run evidence:p41.4 -- --checkpoint lightness --direction <human-approved-direction-candidate>',
  'npm run evidence:p41.4 -- --checkpoint key --direction <human-approved-direction-candidate> --lightness <human-approved-lightness-candidate>',
  'npm run evidence:p41.4 -- --checkpoint key --direction <human-approved-direction-candidate> --lightness <human-approved-lightness-candidate> --approve <human-approved-key-candidate>',
].join('\n')

/** Parses one explicit visual-gate stage; never permits a multi-stage run. */
export function parseP41FixedShapingCommand(argv: readonly string[]): P41FixedShapingCommand {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || !['--checkpoint', '--direction', '--lightness', '--approve'].includes(flag) || !value || value.startsWith('--') || values.has(flag)) {
      throw new Error(P41_FIXED_SHAPING_USAGE)
    }
    values.set(flag, value)
    index += 1
  }
  const checkpoint = values.get('--checkpoint')
  if (checkpoint !== 'direction' && checkpoint !== 'lightness' && checkpoint !== 'key') {
    throw new Error(P41_FIXED_SHAPING_USAGE)
  }
  const approval = {
    ...(values.has('--direction') ? { direction: values.get('--direction')! } : {}),
    ...(values.has('--lightness') ? { lightness: values.get('--lightness')! } : {}),
    ...(values.has('--approve') ? { candidate: values.get('--approve')! } : {}),
  }
  return { checkpoint, approval, experiment: p41FixedShapingExperiment(checkpoint, approval) }
}

export function p41FixedShapingReproductionCommand(command: P41FixedShapingCommand): string {
  const flags = ['npm run evidence:p41.4 -- --checkpoint', command.checkpoint]
  if (command.approval.direction) flags.push('--direction', command.approval.direction)
  if (command.approval.lightness) flags.push('--lightness', command.approval.lightness)
  if (command.approval.candidate) flags.push('--approve', command.approval.candidate)
  return flags.join(' ')
}

function comparable(candidate: P41FixedShapingCandidate, field: P41FixedShapingVariable): string {
  const value = field === 'direction' ? candidate.direction : candidate[field]
  return JSON.stringify(value)
}

/** Fails if a proposed checkpoint changes anything except its declared shaping field. */
export function assertP41FixedShapingSingleVariable(experiment: P41FixedShapingExperiment): void {
  if (experiment.candidates.length < 2) throw new Error('[P41.4 fixed shaping] checkpoint requires at least two candidates')
  const ids = new Set(experiment.candidates.map((candidate) => candidate.id))
  if (ids.size !== experiment.candidates.length) throw new Error('[P41.4 fixed shaping] candidate ids must be unique')
  const expectedApprovalCount = experiment.checkpoint === 'direction' ? 0 : experiment.checkpoint === 'lightness' ? 1 : 2
  if (
    experiment.humanApprovedInputs.length !== expectedApprovalCount
    || experiment.humanApprovedInputs.some((input) => input.status !== 'human-approved-input' || input.source !== 'explicit-cli-human-approved-input')
    || experiment.frozenUpstreamBaselineHash !== p41FixedShapingFrozenUpstreamBaselineHash(experiment.humanApprovedInputs)
  ) {
    throw new Error(`[P41.4 fixed shaping] ${experiment.checkpoint} checkpoint approval state is invalid`)
  }
  if (experiment.candidateReview === 'approved') {
    if (!experiment.approvedCandidate || !experiment.candidates.some((candidate) => candidate.id === experiment.approvedCandidate)) {
      throw new Error(`[P41.4 fixed shaping] ${experiment.checkpoint} approved candidate is missing or undeclared`)
    }
  } else if (experiment.approvedCandidate !== undefined) {
    throw new Error(`[P41.4 fixed shaping] pending ${experiment.checkpoint} review cannot carry an approved candidate`)
  }
  const baseline = experiment.candidates[0]!
  for (const candidate of experiment.candidates) {
    normalizeDirection(candidate.direction)
    if (!Number.isFinite(candidate.lightness) || candidate.lightness < 0 || candidate.lightness > 1) {
      throw new Error('[P41.4 fixed shaping] Lightness must be in [0, 1]')
    }
    if (!Number.isFinite(candidate.keyLightIntensity) || candidate.keyLightIntensity < 0) {
      throw new Error('[P41.4 fixed shaping] Key intensity must be finite and non-negative')
    }
    for (const field of ['direction', 'lightness', 'keyLightIntensity'] as const) {
      if (field !== experiment.variable && comparable(candidate, field) !== comparable(baseline, field)) {
        throw new Error(`[P41.4 fixed shaping] ${experiment.checkpoint} checkpoint changed undeclared ${field}`)
      }
    }
  }
  const values = new Set(experiment.candidates.map((candidate) => comparable(candidate, experiment.variable)))
  if (values.size !== experiment.candidates.length) {
    throw new Error(`[P41.4 fixed shaping] ${experiment.checkpoint} candidates must differ by ${experiment.variable}`)
  }
}