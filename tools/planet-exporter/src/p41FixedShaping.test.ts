import { describe, expect, it } from 'vitest'

import {
  P41_4_BACKLIGHT_DIRECTION_REVISION,
  P41_4_DIRECTION_CANDIDATES,
  P41_4_FRONTLIGHT_DIRECTION_CANDIDATES,
  P41_4_LIGHTNESS_CANDIDATES,
  P41_4_SEMANTIC_FUTURE_ROWS,
  assertP41FixedShapingFixtureSemantics,
  p41FixedShapingEvidenceRelativeDirectory,
  p41FixedShapingSemanticRowLabel,
  p41FixedShapingSemanticRowParameters,
  P41_FIXED_SHAPING_USAGE,
  assertP41FixedShapingSingleVariable,
  p41FixedShapingFrozenUpstreamBaselineHash,
  p41FixedShapingExperiment,
  p41FixedShapingReproductionCommand,
  parseP41FixedShapingCommand,
} from './p41FixedShaping.js'

describe('P41.4 fixed shaping approval state machine', () => {
  it('permits direction without an approval but blocks every downstream stage without its approved inputs', () => {
    const direction = p41FixedShapingExperiment('direction')
    expect(direction.humanApprovedInputs).toEqual([])
    expect(direction.candidateReview).toBe('pending-human-review')
    assertP41FixedShapingSingleVariable(direction)

    expect(() => p41FixedShapingExperiment('lightness')).toThrow(/requires human-approved --direction/)
    expect(() => p41FixedShapingExperiment('key', { direction: 'backlight-east-v1' })).toThrow(/requires human-approved --lightness/)
    expect(() => p41FixedShapingExperiment('direction', { direction: 'backlight-east-v1' })).toThrow(/accepts no upstream inputs/)
  })

  it('versions the backlight candidates and proves x/y are retained while z flips', () => {
    expect(P41_4_DIRECTION_CANDIDATES).toEqual([
      { id: 'backlight-west-v1', direction: [-0.7, 0.4, 0.59] },
      { id: 'backlight-east-v1', direction: [0.7, 0.4, 0.59] },
      { id: 'backlight-high-v1', direction: [0.38, 0.76, 0.53] },
    ])
    expect(P41_4_BACKLIGHT_DIRECTION_REVISION).toMatchObject({
      id: 'backlight-z-flip-v1',
      relation: 'replaces-frontlight-candidates',
      z_transform: 'negated-from-frontlight-candidates',
      backlight_z_sign: 'positive-z',
    })
    for (const [index, candidate] of P41_4_DIRECTION_CANDIDATES.entries()) {
      const replaced = P41_4_FRONTLIGHT_DIRECTION_CANDIDATES[index]!
      expect(candidate.direction[0]).toBe(replaced.direction[0])
      expect(candidate.direction[1]).toBe(replaced.direction[1])
      expect(candidate.direction[2]).toBe(-replaced.direction[2])
      expect(candidate.direction[2]).toBeGreaterThan(0)
    }
    expect(p41FixedShapingExperiment('lightness', { direction: 'backlight-east-v1' }).candidates[0]!.direction).toEqual([
      0.700665949127905,
      0.4003805423588029,
      0.5905612999792342,
    ])
  })

  it('keeps the requested 0.66 Lightness candidate finite, bounded, and pending review', () => {
    const candidate = P41_4_LIGHTNESS_CANDIDATES.find((entry) => entry.id === 'lightness-0.66')
    expect(candidate).toEqual({ id: 'lightness-0.66', lightness: 0.66 })
    expect(Number.isFinite(candidate!.lightness)).toBe(true)
    expect(candidate!.lightness).toBeGreaterThanOrEqual(0)
    expect(candidate!.lightness).toBeLessThanOrEqual(1)
    const experiment = p41FixedShapingExperiment('lightness', { direction: 'backlight-east-v1' })
    expect(experiment.candidates.map((entry) => entry.id)).toEqual([
      'lightness-0.45', 'lightness-0.50', 'lightness-0.55', 'lightness-0.66',
    ])
    expect(experiment.candidateReview).toBe('pending-human-review')
    assertP41FixedShapingSingleVariable(experiment)
  })

  it('fixes only human-approved upstream values for Lightness and Key scans', () => {
    const lightnessWest = p41FixedShapingExperiment('lightness', { direction: 'backlight-west-v1' })
    const lightnessEast = p41FixedShapingExperiment('lightness', { direction: 'backlight-east-v1' })
    const key = p41FixedShapingExperiment('key', { direction: 'backlight-east-v1', lightness: 'lightness-0.50' })

    for (const experiment of [lightnessWest, lightnessEast, key]) {
      expect(experiment.candidateReview).toBe('pending-human-review')
      expect(experiment.humanApprovedInputs.every((input) => input.status === 'human-approved-input' && input.source === 'explicit-cli-human-approved-input')).toBe(true)
      expect(experiment.frozenUpstreamBaselineHash).toBe(p41FixedShapingFrozenUpstreamBaselineHash(experiment.humanApprovedInputs))
      assertP41FixedShapingSingleVariable(experiment)
    }
    expect(lightnessWest.frozenUpstreamBaselineHash).not.toBe(lightnessEast.frozenUpstreamBaselineHash)
    expect(lightnessEast.candidates.map((candidate) => candidate.direction)).not.toEqual(lightnessWest.candidates.map((candidate) => candidate.direction))
    expect(lightnessEast.candidates.map((candidate) => candidate.lightness)).toEqual(lightnessWest.candidates.map((candidate) => candidate.lightness))
    expect(key.candidates.every((candidate) => candidate.lightness === 0.5)).toBe(true)
    expect(key.humanApprovedInputs.map((input) => input.candidate)).toEqual(['backlight-east-v1', 'lightness-0.50'])
    expect(key.humanApprovedInputs.map((input) => input.value)).toEqual([
      lightnessEast.candidates[0]!.direction,
      0.5,
    ])
  })

  it('rejects missing, unknown, duplicated, and multi-stage CLI forms before rendering', () => {
    expect(() => parseP41FixedShapingCommand([])).toThrow(P41_FIXED_SHAPING_USAGE)
    expect(() => parseP41FixedShapingCommand(['--checkpoint', 'lightness'])).toThrow(/requires human-approved --direction/)
    expect(() => parseP41FixedShapingCommand(['--checkpoint', 'lightness', '--direction', 'side-back-east'])).toThrow(/unknown approved direction/)
    expect(() => parseP41FixedShapingCommand(['--checkpoint', 'key', '--direction', 'backlight-east-v1'])).toThrow(/requires human-approved --lightness/)
    expect(() => parseP41FixedShapingCommand(['--checkpoint', 'lightness', '--direction', 'unknown'])).toThrow(/unknown approved direction/)
    expect(() => parseP41FixedShapingCommand(['--checkpoint', 'key', '--direction', 'backlight-east-v1', '--lightness', 'unknown'])).toThrow(/unknown approved Lightness/)
    expect(() => parseP41FixedShapingCommand(['--checkpoint', 'direction', '--checkpoint', 'key'])).toThrow(P41_FIXED_SHAPING_USAGE)
  })

  it('formats approval-bearing reproduction commands exactly', () => {
    const command = parseP41FixedShapingCommand(['--checkpoint', 'key', '--direction', 'backlight-east-v1', '--lightness', 'lightness-0.50'])
    expect(p41FixedShapingReproductionCommand(command)).toBe('npm run evidence:p41.4 -- --checkpoint key --direction backlight-east-v1 --lightness lightness-0.50')
  })

  it('records an explicit approved Key candidate and reproduces its approval command', () => {
    const command = parseP41FixedShapingCommand([
      '--checkpoint', 'key',
      '--direction', 'backlight-east-v1',
      '--lightness', 'lightness-0.66',
      '--approve', 'key-0.45',
    ])
    expect(command.experiment.candidateReview).toBe('approved')
    expect(command.experiment.approvedCandidate).toBe('key-0.45')
    expect(p41FixedShapingReproductionCommand(command)).toBe('npm run evidence:p41.4 -- --checkpoint key --direction backlight-east-v1 --lightness lightness-0.66 --approve key-0.45')
    assertP41FixedShapingSingleVariable(command.experiment)

    expect(() => parseP41FixedShapingCommand([
      '--checkpoint', 'key',
      '--direction', 'backlight-east-v1',
      '--lightness', 'lightness-0.66',
      '--approve', 'key-unknown',
    ])).toThrow(/unknown approved Key candidate/)
  })

  it('uses a v5 follow-up Lightness directory without overwriting v4 evidence', () => {
    expect(p41FixedShapingEvidenceRelativeDirectory('direction')).toBe('data/runs/phase41/p41.4-fixed-shaping-direction-v4-backlight-semantic-fixtures')
    expect(p41FixedShapingEvidenceRelativeDirectory('direction')).not.toBe('data/runs/phase41/p41.4-fixed-shaping-direction')
    expect(p41FixedShapingEvidenceRelativeDirectory('lightness')).toBe('data/runs/phase41/p41.4-fixed-shaping-lightness-v5-backlight-lightness-066-semantic-fixtures')
    expect(p41FixedShapingEvidenceRelativeDirectory('lightness')).not.toBe('data/runs/phase41/p41.4-fixed-shaping-lightness-v4-backlight-semantic-fixtures')
    expect(p41FixedShapingEvidenceRelativeDirectory('lightness')).not.toBe('data/runs/phase41/p41.4-fixed-shaping-lightness-v3-approved-direction-semantic-fixtures')
    expect(p41FixedShapingEvidenceRelativeDirectory('key')).toBe('data/runs/phase41/p41.4-fixed-shaping-key-v5-backlight-lightness-066-semantic-fixtures')
    expect(p41FixedShapingEvidenceRelativeDirectory('key')).not.toBe('data/runs/phase41/p41.4-fixed-shaping-key-v4-backlight-semantic-fixtures')
  })

  it('rejects an approval record whose frozen baseline hash no longer matches', () => {
    const experiment = p41FixedShapingExperiment('lightness', { direction: 'backlight-east-v1' })
    expect(() => assertP41FixedShapingSingleVariable({
      ...experiment,
      frozenUpstreamBaselineHash: '0'.repeat(64),
    })).toThrow(/approval state is invalid/)
  })

  it('models future rows with palette families and visible terrain complexity, never hue or seed categories', () => {
    const row = P41_4_SEMANTIC_FUTURE_ROWS[0]!
    const fixture = {
      movieId: 101,
      title: 'Semantic fixture',
      hue: 1.2,
      seed: 1234,
      primaryGenre: 'Action',
      paletteHex: '#F486AA',
      genres: ['Action'],
      visibleBandCount: 1,
      selectionPredicate: 'categorical palette family and visible terrain complexity',
    }
    expect(() => assertP41FixedShapingFixtureSemantics(row, fixture)).not.toThrow()
    const rowLabel = p41FixedShapingSemanticRowLabel(row, fixture)
    expect(rowLabel).toBe('warm palette family · single-visible-band · primary=Action · visible bands=1')
    expect(rowLabel).not.toMatch(/hue|seed|id|high|low/i)
    expect(p41FixedShapingSemanticRowParameters(row, fixture)).toMatchObject({
      palette_family: 'warm',
      terrain_complexity: 'single-visible-band',
      fixture_movie_id: 101,
      fixture_hue: 1.2,
      fixture_primary_genre: 'Action',
      fixture_visible_band_count: 1,
      fixture_seed: 1234,
    })
    expect(P41_4_SEMANTIC_FUTURE_ROWS.map((entry) => entry.fixture).join(' ')).not.toMatch(/hue-(low|high)|seed-(low|high)/)
    expect(() => assertP41FixedShapingFixtureSemantics(row, { ...fixture, paletteHex: '' })).toThrow(/palette hex is invalid/)
    expect(() => assertP41FixedShapingFixtureSemantics(row, { ...fixture, selectionPredicate: '' })).toThrow(/selection predicate must be non-empty/)
    expect(() => assertP41FixedShapingFixtureSemantics(row, { ...fixture, title: '' })).toThrow(/fixture title must be non-empty/)
    expect(() => assertP41FixedShapingFixtureSemantics(row, { ...fixture, visibleBandCount: 2 })).toThrow(/terrain complexity drifted/)
    expect(() => assertP41FixedShapingFixtureSemantics(row, { ...fixture, primaryGenre: 'Western' })).toThrow(/outside its warm palette family/)
  })

  it('rejects an undeclared shaping change', () => {
    const direction = p41FixedShapingExperiment('direction')
    const invalid = {
      ...direction,
      candidates: direction.candidates.map((candidate, index) => index === 1
        ? { ...candidate, lightness: 0.55 }
        : candidate),
    }
    expect(() => assertP41FixedShapingSingleVariable(invalid)).toThrow(/undeclared lightness/)
  })
})