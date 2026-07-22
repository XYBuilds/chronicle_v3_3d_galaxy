import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { ExportArgs } from '../src/args.js'
import { writeArtifactsAtomically } from '../src/artifacts.js'
import { getGitCommit, metadataFor } from '../src/browser.js'
import { generateContactSheet, type ContactSheetInput } from '../src/contactSheet.js'
import type { DataSource } from '../src/data-source.js'
import {
  P41_4_BLOOM_OFF,
  P41_4_DIRECTION_CANDIDATES,
  P41_4_DIRECTION_CONVENTION,
  P41_4_BACKLIGHT_DIRECTION_REVISION,
  P41_4_LIGHTNESS_066_FOLLOW_UP,
  P41_4_LOW_EMISSION_CURVE,
  P41_4_SEMANTIC_FUTURE_ROWS,
  P41_4_VISIBLE_BAND_CAP,
  assertP41FixedShapingFixtureSemantics,
  assertP41FixedShapingSingleVariable,
  p41FixedShapingSemanticRowLabel,
  p41FixedShapingSemanticRowParameters,
  p41FixedShapingEvidenceRelativeDirectory,
  p41FixedShapingReproductionCommand,
  parseP41FixedShapingCommand,
  type P41FixedShapingCheckpoint,
  type P41FixedShapingExperiment,
  type P41FixedShapingFixtureSemantics,
  type P41FixedShapingSemanticRow,
} from '../src/p41FixedShaping.js'
import { writePhase41SemanticFixtures } from '../src/phase41Baseline.js'
import { renderPhase41DiagnosticInBrowser, PHASE41_DIAGNOSTIC_MARKER, type Phase41DiagnosticOverride } from '../src/phase41Diagnostic.js'
import { assertPngSafe } from '../src/png.js'

const root = path.resolve(import.meta.dirname, '../../..')
const resolution = 1024
const padding = 0.08
const sizeRoot = 3 as const

type JsonRecord = Record<string, unknown>
type DiagnosticArtifact = {
  checkpoint: P41FixedShapingCheckpoint
  fixture: string
  fixtureRow: P41FixedShapingSemanticRow
  fixtureSemantics: P41FixedShapingFixtureSemantics
  candidate: string
  png: string
  sidecar: string
  pngSha256: string
  visualConfigHash: string
  diagnostics: JsonRecord
}

type EvidenceMatrixCounts = {
  fixtures: number
  candidates: number
  expectedCells: number
  pngFiles: number
  sidecarFiles: number
  manifestSources: number
  manifestCells: number
  validationCells: number
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P41.4 fixed shaping] ${message}`)
}

function record(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as JsonRecord
}

function number(value: unknown, label: string): number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`)
  return value
}

function text(value: unknown, label: string): string {
  assert(typeof value === 'string' && value.length > 0, `${label} must be non-empty`)
  return value
}

function textArray(value: unknown, label: string): string[] {
  assert(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array`)
  return value.map((entry, index) => text(entry, `${label}[${index}]`))
}

function tuple(value: unknown, label: string): [number, number, number] {
  assert(Array.isArray(value) && value.length === 3, `${label} must be a three-vector`)
  return [number(value[0], `${label}[0]`), number(value[1], `${label}[1]`), number(value[2], `${label}[2]`)]
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameDirection(left: unknown, right: unknown): boolean {
  const actual = tuple(left, 'actual direction')
  const expected = tuple(right, 'expected direction')
  return actual.every((entry, index) => Math.abs(entry - expected[index]!) <= 1e-12)
}

async function readJson(file: string, label: string): Promise<JsonRecord> {
  return record(JSON.parse(await fs.readFile(file, 'utf8')) as unknown, label)
}

async function assertFile(file: string, label: string): Promise<void> {
  await fs.access(file).catch(() => {
    throw new Error(`[P41.4 fixed shaping] ${label} is missing: ${relative(file)}`)
  })
}

function evidenceCellKey(fixture: string, candidate: string): string {
  return `${fixture}\u0000${candidate}`
}

function assertExactMatrixKeys(keys: readonly string[], expected: ReadonlySet<string>, label: string): void {
  assert(keys.length === expected.size, `${label} count ${keys.length} does not equal expected ${expected.size}`)
  assert(new Set(keys).size === keys.length, `${label} contains duplicate matrix entries`)
  for (const key of keys) assert(expected.has(key), `${label} references an undeclared matrix entry`)
}

async function verifyPublishedMatrix(
  directory: string,
  experiment: P41FixedShapingExperiment,
  artifacts: readonly DiagnosticArtifact[],
): Promise<EvidenceMatrixCounts> {
  const fixtureCount = P41_4_SEMANTIC_FUTURE_ROWS.length
  const candidateCount = experiment.candidates.length
  const expectedCells = fixtureCount * candidateCount
  assert(artifacts.length === expectedCells, `rendered artifact count ${artifacts.length} does not equal ${fixtureCount} fixtures × ${candidateCount} candidates`)

  const expectedKeys = new Set(artifacts.map((artifact) => evidenceCellKey(artifact.fixture, artifact.candidate)))
  assert(expectedKeys.size === expectedCells, 'rendered artifacts contain duplicate fixture/candidate cells')
  for (const artifact of artifacts) {
    await assertFile(path.join(directory, artifact.png), `rendered PNG for ${artifact.fixture}/${artifact.candidate}`)
    await assertFile(path.join(directory, artifact.sidecar), `rendered sidecar for ${artifact.fixture}/${artifact.candidate}`)
  }

  const manifest = await readJson(path.join(directory, 'contact-sheet.manifest.json'), 'contact sheet manifest')
  const sources = manifest.sources
  const normalizedInput = record(manifest.normalized_input, 'contact sheet normalized input')
  assert(Array.isArray(sources), 'contact sheet manifest sources must be an array')
  assert(Array.isArray(normalizedInput.cells), 'contact sheet manifest normalized cells must be an array')
  const manifestKeys: string[] = []
  for (const [index, source] of sources.entries()) {
    const entry = record(source, `manifest source ${index}`)
    const fixture = text(entry.row_key, `manifest source ${index} row key`)
    const candidate = text(entry.column_key, `manifest source ${index} column key`)
    const input = text(entry.input, `manifest source ${index} PNG`)
    const parameters = record(entry.parameters, `manifest source ${index} parameters`)
    const sidecar = text(parameters.sidecar, `manifest source ${index} sidecar`)
    await assertFile(path.resolve(root, input), `manifest PNG for ${fixture}/${candidate}`)
    await assertFile(path.join(directory, sidecar), `manifest sidecar for ${fixture}/${candidate}`)
    manifestKeys.push(evidenceCellKey(fixture, candidate))
  }
  assertExactMatrixKeys(manifestKeys, expectedKeys, 'contact sheet manifest sources')
  assert(normalizedInput.cells.length === expectedCells, `contact sheet manifest cells count ${normalizedInput.cells.length} does not equal expected ${expectedCells}`)

  const validation = await readJson(path.join(directory, 'validation.json'), 'validation')
  const cells = validation.cells
  assert(Array.isArray(cells), 'validation cells must be an array')
  const validationKeys: string[] = []
  for (const [index, cell] of cells.entries()) {
    const entry = record(cell, `validation cell ${index}`)
    const fixture = text(entry.fixture, `validation cell ${index} fixture`)
    const candidate = text(entry.candidate, `validation cell ${index} candidate`)
    const png = text(entry.png, `validation cell ${index} PNG`)
    const sidecar = text(entry.sidecar, `validation cell ${index} sidecar`)
    await assertFile(path.join(directory, png), `validation PNG for ${fixture}/${candidate}`)
    await assertFile(path.join(directory, sidecar), `validation sidecar for ${fixture}/${candidate}`)
    validationKeys.push(evidenceCellKey(fixture, candidate))
  }
  assertExactMatrixKeys(validationKeys, expectedKeys, 'validation cells')

  const cellFiles = await fs.readdir(path.join(directory, 'cells'))
  const pngFiles = cellFiles.filter((file) => file.endsWith('.png')).length
  const sidecarFiles = cellFiles.filter((file) => file.endsWith('.png.render.json')).length
  assert(pngFiles === expectedCells, `cells directory contains ${pngFiles} PNG files; expected ${expectedCells}`)
  assert(sidecarFiles === expectedCells, `cells directory contains ${sidecarFiles} sidecars; expected ${expectedCells}`)
  return {
    fixtures: fixtureCount,
    candidates: candidateCount,
    expectedCells,
    pngFiles,
    sidecarFiles,
    manifestSources: sources.length,
    manifestCells: normalizedInput.cells.length,
    validationCells: cells.length,
  }
}

function relative(file: string): string {
  return path.relative(root, file).replaceAll('\\', '/')
}

function checkpointDirectory(checkpoint: P41FixedShapingCheckpoint): string {
  return path.resolve(root, p41FixedShapingEvidenceRelativeDirectory(checkpoint))
}

function evidenceConfigHash(rendererVisualConfigInput: string | undefined, experiment: P41FixedShapingExperiment): string {
  return createHash('sha256').update(JSON.stringify({
    renderer_visual_config_input: rendererVisualConfigInput ?? '',
    human_approved_inputs: experiment.humanApprovedInputs,
    approved_candidate: experiment.approvedCandidate ?? null,
    candidate_review: experiment.candidateReview,
    frozen_upstream_baseline_hash: experiment.frozenUpstreamBaselineHash,
    ...(experiment.checkpoint === 'direction' ? { backlight_direction_revision: P41_4_BACKLIGHT_DIRECTION_REVISION } : {}),
  })).digest('hex')
}

async function fixtureInfo(file: string): Promise<Omit<P41FixedShapingFixtureSemantics, 'seed' | 'visibleBandCount'>> {
  const parsed = record(JSON.parse(await fs.readFile(file, 'utf8')) as unknown, `${relative(file)} fixture`)
  const movies = parsed.movies
  assert(Array.isArray(movies) && movies.length === 1, `${relative(file)} must contain exactly one movie`)
  const movie = record(movies[0], `${relative(file)} movie`)
  const genres = textArray(movie.genres, 'fixture movie genres')
  const primaryGenre = genres[0]!
  const meta = record(parsed.meta, `${relative(file)} fixture meta`)
  const palette = record(meta.genre_palette, `${relative(file)} fixture genre palette`)
  const phaseFixture = record(parsed.phase41_fixture, `${relative(file)} phase41 fixture metadata`)
  return {
    movieId: number(movie.id, 'fixture movie id'),
    title: text(movie.title, 'fixture movie title'),
    hue: number(movie.genre_hue, 'fixture movie genre_hue'),
    primaryGenre,
    paletteHex: text(palette[primaryGenre], `fixture palette ${primaryGenre}`),
    genres,
    selectionPredicate: text(phaseFixture.selection, 'fixture selection predicate'),
  }
}

function expectedOverride(candidate: P41FixedShapingExperiment['candidates'][number]): Phase41DiagnosticOverride {
  return {
    diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
    emissionCurve: { ...P41_4_LOW_EMISSION_CURVE },
    lightness: candidate.lightness,
    keyLightIntensity: candidate.keyLightIntensity,
    direction: [...candidate.direction],
    bloom: { ...P41_4_BLOOM_OFF },
  }
}

function profileFor(artifact: DiagnosticArtifact): JsonRecord {
  return record(artifact.diagnostics.phase41_resolved_profile, `${artifact.png} phase41 profile`)
}

function snapshot(artifact: DiagnosticArtifact): JsonRecord {
  const profile = profileFor(artifact)
  const keyLight = record(artifact.diagnostics.key_light, `${artifact.png} key light`)
  return {
    curve: profile.curve,
    lightness: profile.lightness,
    chroma: profile.chroma,
    keyLightIntensity: profile.keyLightIntensity,
    direction: profile.direction,
    bloom: profile.bloom,
    flatShadingMix: profile.flatShadingMix,
    camera: profile.camera,
    seed: profile.seed,
    rotation: profile.rotation,
    renderedLightness: artifact.diagnostics.fixed_lightness,
    renderedKey: keyLight.intensity,
    renderedDirection: keyLight.direction,
  }
}

function withoutVariable(value: JsonRecord, variable: P41FixedShapingExperiment['variable']): JsonRecord {
  const copy = JSON.parse(JSON.stringify(value)) as JsonRecord
  const map: Record<P41FixedShapingExperiment['variable'], string[]> = {
    direction: ['direction', 'renderedDirection'],
    lightness: ['lightness', 'renderedLightness'],
    keyLightIntensity: ['keyLightIntensity', 'renderedKey'],
  }
  for (const field of map[variable]) delete copy[field]
  return copy
}

function assertArtifactDiagnostics(artifact: DiagnosticArtifact, candidate: P41FixedShapingExperiment['candidates'][number]): void {
  const diagnostics = artifact.diagnostics
  const bloom = record(diagnostics.bloom, `${artifact.png} bloom`)
  assert(bloom.enabled === false, `${artifact.png} must disable Bloom`)
  assert(bloom.composition === 'pure-bloom-delta-v1', `${artifact.png} must retain pure Bloom composition`)
  assert(bloom.strength === P41_4_BLOOM_OFF.strength && bloom.radius === P41_4_BLOOM_OFF.radius && bloom.threshold === P41_4_BLOOM_OFF.threshold, `${artifact.png} Bloom parameters drifted`)
  assert(diagnostics.fixed_lightness === candidate.lightness, `${artifact.png} Lightness drifted`)
  const keyLight = record(diagnostics.key_light, `${artifact.png} key light`)
  assert(keyLight.intensity === candidate.keyLightIntensity, `${artifact.png} Key drifted`)
  assert(keyLight.flat_shading_mix === 0.8, `${artifact.png} flatShadingMix drifted`)
  assert(sameDirection(keyLight.direction, candidate.direction), `${artifact.png} direction drifted`)
  const curve = record(diagnostics.emission_curve, `${artifact.png} emission curve`)
  assert(same(curve, {
    model_version: P41_4_LOW_EMISSION_CURVE.modelVersion,
    exponent: P41_4_LOW_EMISSION_CURVE.exponent,
    intensity_min: P41_4_LOW_EMISSION_CURVE.intensityMin,
    intensity_max: P41_4_LOW_EMISSION_CURVE.intensityMax,
  }), `${artifact.png} must use fixed low emission`)
  assert(diagnostics.emission === P41_4_LOW_EMISSION_CURVE.intensityMin, `${artifact.png} emission must stay low and rating-independent`)
  const profile = profileFor(artifact)
  assert(profile.overrideProvenance === 'phase41-diagnostic-override', `${artifact.png} must record isolated override provenance`)
  assert(text(profile.resolvedVisualConfigInput, `${artifact.png} resolved config`) === text(diagnostics.visual_config_hash_input, `${artifact.png} canonical renderer config`), `${artifact.png} diagnostics must carry the same canonical resolved configuration`)
  assert(profile.productionSource === 'resolved-emission-profile', `${artifact.png} must retain resolved-emission provenance`)
}

function assertMatrix(experiment: P41FixedShapingExperiment, artifacts: readonly DiagnosticArtifact[]): void {
  assertP41FixedShapingSingleVariable(experiment)
  assert(artifacts.length === P41_4_SEMANTIC_FUTURE_ROWS.length * experiment.candidates.length, `${experiment.checkpoint} matrix has incomplete cells`)
  for (const fixtureRow of P41_4_SEMANTIC_FUTURE_ROWS) {
    const fixture = fixtureRow.fixture
    const row = artifacts.filter((artifact) => artifact.fixture === fixture)
    assert(row.length === experiment.candidates.length, `${experiment.checkpoint}/${fixture} has incomplete candidates`)
    const baseline = row[0]!
    const baselineSnapshot = snapshot(baseline)
    for (const candidate of experiment.candidates) {
      const artifact = row.find((entry) => entry.candidate === candidate.id)
      assert(artifact, `${experiment.checkpoint}/${fixture} lacks ${candidate.id}`)
      assertArtifactDiagnostics(artifact, candidate)
      assert(same(withoutVariable(snapshot(artifact), experiment.variable), withoutVariable(baselineSnapshot, experiment.variable)), `${experiment.checkpoint}/${fixture}/${candidate.id} changed an undeclared variable`)
    }
  }
  for (const candidate of experiment.candidates) {
    const column = artifacts.filter((artifact) => artifact.candidate === candidate.id)
    assert(column.length === P41_4_SEMANTIC_FUTURE_ROWS.length, `${experiment.checkpoint}/${candidate.id} has incomplete fixture rows`)
    for (const artifact of column) assertArtifactDiagnostics(artifact, candidate)
  }
}

function directionText(value: [number, number, number]): string {
  return `[${value.map((entry) => entry.toFixed(3)).join(',')}]`
}

/** Preserves unnormalized user-approved geometry separately from renderer input. */
function directionEvidenceVectors(candidate: P41FixedShapingExperiment['candidates'][number]): {
  raw_direction: [number, number, number]
  normalized_renderer_direction: [number, number, number]
} {
  const raw = P41_4_DIRECTION_CANDIDATES.find((entry) => entry.id === candidate.id)
  assert(raw, `${candidate.id} must resolve to a current backlight raw direction candidate`)
  return {
    raw_direction: [...raw.direction],
    normalized_renderer_direction: [...candidate.direction],
  }
}

function inputForContactSheet(
  experiment: P41FixedShapingExperiment,
  artifacts: readonly DiagnosticArtifact[],
  evidenceDirectory: string,
): ContactSheetInput {
  return {
    title: `P41.4 Bloom OFF fixed shaping — ${experiment.checkpoint}${experiment.approvedCandidate ? ` (approved: ${experiment.approvedCandidate})` : ' (all candidates pending human review)'}`,
    rows: P41_4_SEMANTIC_FUTURE_ROWS.map((fixtureRow) => {
      const artifact = artifacts.find((entry) => entry.fixture === fixtureRow.fixture)!
      return { key: fixtureRow.fixture, label: p41FixedShapingSemanticRowLabel(fixtureRow, artifact.fixtureSemantics) }
    }),
    columns: experiment.candidates.map((candidate) => ({ key: candidate.id, label: candidate.id })),
    cells: artifacts.map((artifact) => {
      const candidate = experiment.candidates.find((entry) => entry.id === artifact.candidate)!
      return {
        rowKey: artifact.fixture,
        columnKey: artifact.candidate,
        input: artifact.png,
        caption: [
          `L=${candidate.lightness.toFixed(3)} Key=${candidate.keyLightIntensity.toFixed(3)} Flat=0.800`,
          `Dir=${directionText(candidate.direction)}`,
          'Emission=0.005 (power-clamped-v1)',
          'Bloom=OFF strength=0.01 radius=1 threshold=0',
        ].join('\n'),
        parameters: {
          checkpoint: experiment.checkpoint,
          evidence_directory: evidenceDirectory,
          varied_parameter: experiment.variable,
          candidate: candidate.id,
          png: artifact.png,
          sidecar: artifact.sidecar,
          candidate_review: experiment.candidateReview,
          ...(experiment.approvedCandidate ? { approved_candidate: experiment.approvedCandidate } : {}),
          human_approved_inputs: experiment.humanApprovedInputs,
          frozen_upstream_baseline_hash: experiment.frozenUpstreamBaselineHash,
          direction_convention: P41_4_DIRECTION_CONVENTION,
          backlight_direction_revision: P41_4_BACKLIGHT_DIRECTION_REVISION,
          ...(experiment.checkpoint !== 'direction' ? { lightness_follow_up: P41_4_LIGHTNESS_066_FOLLOW_UP } : {}),
          ...(experiment.checkpoint === 'direction' ? directionEvidenceVectors(candidate) : {}),
          fixture: artifact.fixture,
          ...p41FixedShapingSemanticRowParameters(artifact.fixtureRow, artifact.fixtureSemantics),
          diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
          lightness: candidate.lightness,
          key_light_intensity: candidate.keyLightIntensity,
          direction: candidate.direction,
          flat_shading_mix: 0.8,
          emission_curve: P41_4_LOW_EMISSION_CURVE,
          bloom: P41_4_BLOOM_OFF,
        },
      }
    }),
  }
}

async function renderCell(
  directory: string,
  experiment: P41FixedShapingExperiment,
  fixtureRow: P41FixedShapingSemanticRow,
  fixtureFile: string,
  evidenceDirectory: string,
  candidate: P41FixedShapingExperiment['candidates'][number],
): Promise<DiagnosticArtifact> {
  const fixture = fixtureRow.fixture
  const fixtureBytes = await fs.readFile(fixtureFile)
  const source: DataSource = { kind: 'file', label: `file:${fixtureFile}`, bytes: fixtureBytes }
  const info = await fixtureInfo(fixtureFile)
  const png = `${fixture}__${candidate.id}.png`
  const args: ExportArgs = {
    movieId: info.movieId,
    output: path.join(directory, 'cells', png),
    resolution,
    padding,
    bloom: 'off',
    sizeRoot,
    renderMode: 'shader',
    dataFile: fixtureFile,
  }
  const render = await renderPhase41DiagnosticInBrowser(args, source, root, expectedOverride(candidate))
  assertPngSafe(render.png, resolution)
  const diagnostics = render.visualDiagnostics
  const seed = number(record(diagnostics.noise, `${png} noise`).seed, `${png} seed`)
  const fixtureSemantics: P41FixedShapingFixtureSemantics = {
    ...info,
    seed,
    visibleBandCount: Math.min(info.genres.length, P41_4_VISIBLE_BAND_CAP),
  }
  assertP41FixedShapingFixtureSemantics(fixtureRow, fixtureSemantics)
  assert(number(diagnostics.band_count, `${png} rendered band count`) === fixtureSemantics.visibleBandCount, `${png} rendered terrain complexity drifted`)
  const renderedMetadata = metadataFor(args, source, render, getGitCommit(root))
  const visualConfigHash = evidenceConfigHash(render.visualHash, experiment)
  const metadata = {
    ...renderedMetadata,
    renderer_visual_config_hash: renderedMetadata.visual_config_hash,
    visual_config_hash: visualConfigHash,
  }
  const sidecar = `${png}.render.json`
  await writeArtifactsAtomically(
    { png: path.join(directory, 'cells', png), metadata: path.join(directory, 'cells', sidecar) },
    render.png,
    {
      ...metadata,
      p41_4_fixed_shaping: {
        checkpoint: experiment.checkpoint,
        evidence_directory: evidenceDirectory,
        varied_parameter: experiment.variable,
        candidate: candidate.id,
        candidate_review: experiment.candidateReview,
        ...(experiment.approvedCandidate ? { approved_candidate: experiment.approvedCandidate } : {}),
        human_approved_inputs: experiment.humanApprovedInputs,
        frozen_upstream_baseline_hash: experiment.frozenUpstreamBaselineHash,
        direction_convention: P41_4_DIRECTION_CONVENTION,
        backlight_direction_revision: P41_4_BACKLIGHT_DIRECTION_REVISION,
        ...(experiment.checkpoint !== 'direction' ? { lightness_follow_up: P41_4_LIGHTNESS_066_FOLLOW_UP } : {}),
        ...(experiment.checkpoint === 'direction' ? directionEvidenceVectors(candidate) : {}),
        human_review_required: experiment.candidateReview !== 'approved',
        fixture,
        fixture_semantics: {
          palette_family: fixtureRow.paletteFamily,
          terrain_complexity: fixtureRow.terrainComplexity,
          expected_visible_band_count: fixtureRow.expectedVisibleBandCount,
          movie_id: fixtureSemantics.movieId,
          title: fixtureSemantics.title,
          hue: fixtureSemantics.hue,
          primary_genre: fixtureSemantics.primaryGenre,
          palette_hex: fixtureSemantics.paletteHex,
          genres: fixtureSemantics.genres,
          visible_band_count: fixtureSemantics.visibleBandCount,
          selection_predicate: fixtureSemantics.selectionPredicate,
          seed: fixtureSemantics.seed,
        },
        diagnostic_only: PHASE41_DIAGNOSTIC_MARKER,
        override: expectedOverride(candidate),
      },
    },
  )
  return {
    checkpoint: experiment.checkpoint,
    fixture,
    fixtureRow,
    fixtureSemantics,
    candidate: candidate.id,
    png: path.join('cells', png).replaceAll('\\', '/'),
    sidecar: path.join('cells', sidecar).replaceAll('\\', '/'),
    pngSha256: createHash('sha256').update(render.png).digest('hex'),
    visualConfigHash: text(metadata.visual_config_hash, `${png} visual config hash`),
    diagnostics,
  }
}

async function writeValidation(
  directory: string,
  evidenceDirectory: string,
  experiment: P41FixedShapingExperiment,
  artifacts: readonly DiagnosticArtifact[],
  command: string,
): Promise<void> {
  const validation = {
    schema_version: 'p41.4-fixed-shaping-validation-v1',
    evidence_directory: evidenceDirectory,
    checkpoint: experiment.checkpoint,
    human_review_required: experiment.candidateReview !== 'approved',
    production_lock: experiment.candidateReview === 'approved' ? 'locked' : 'not-locked',
    candidate_review: experiment.candidateReview,
    ...(experiment.approvedCandidate ? { approved_candidate: experiment.approvedCandidate } : {}),
    human_approved_inputs: experiment.humanApprovedInputs,
    frozen_upstream_baseline_hash: experiment.frozenUpstreamBaselineHash,
    direction_convention: P41_4_DIRECTION_CONVENTION,
    backlight_direction_revision: P41_4_BACKLIGHT_DIRECTION_REVISION,
    ...(experiment.checkpoint !== 'direction' ? { lightness_follow_up: P41_4_LIGHTNESS_066_FOLLOW_UP } : {}),
    ...(experiment.checkpoint === 'direction' ? {
      direction_vectors: experiment.candidates.map((candidate) => ({ candidate: candidate.id, ...directionEvidenceVectors(candidate) })),
    } : {}),
    reproduction_command: command,
    matrix: {
      fixtures: P41_4_SEMANTIC_FUTURE_ROWS.map((row) => ({
        fixture: row.fixture,
        palette_family: row.paletteFamily,
        terrain_complexity: row.terrainComplexity,
        expected_visible_band_count: row.expectedVisibleBandCount,
      })),
      candidates: experiment.candidates,
      varied_parameter: experiment.variable,
      fixed: {
        emission_curve: P41_4_LOW_EMISSION_CURVE,
        bloom: P41_4_BLOOM_OFF,
        flat_shading_mix: 0.8,
      },
    },
    assertions: {
      complete_matrix: 'pass',
      single_variable: `pass (${experiment.variable} only)`,
      same_fixture_rows: 'pass',
      low_emission: 'pass (0.005 fixed)',
      bloom_off: 'pass',
      flat_shading_mix: 'pass (0.8)',
      human_approved_inputs: experiment.humanApprovedInputs.length === 0 ? 'not-required (direction gate)' : 'pass (explicit upstream approval bound into sidecars, manifest, and visual config hash)',
      isolated_diagnostic_override: 'pass',
      production_defaults_unchanged_by_override: 'pass (profile records production source and distinct resolved config)',
    },
    cells: artifacts.map((artifact) => ({
      fixture: artifact.fixture,
      ...p41FixedShapingSemanticRowParameters(artifact.fixtureRow, artifact.fixtureSemantics),
      candidate: artifact.candidate,
      png: artifact.png,
      sidecar: artifact.sidecar,
      png_sha256: artifact.pngSha256,
      visual_config_hash: artifact.visualConfigHash,
    })),
  }
  await fs.writeFile(path.join(directory, 'validation.json'), `${JSON.stringify(validation, null, 2)}\n`, 'utf8')
}

async function generateCheckpoint(commandInput: ReturnType<typeof parseP41FixedShapingCommand>): Promise<void> {
  const { checkpoint, experiment } = commandInput
  const evidenceDirectory = p41FixedShapingEvidenceRelativeDirectory(checkpoint)
  const directory = checkpointDirectory(checkpoint)
  await fs.mkdir(path.join(directory, 'cells'), { recursive: true })
  const artifacts: DiagnosticArtifact[] = []
  for (const fixtureRow of P41_4_SEMANTIC_FUTURE_ROWS) {
    const fixtureFile = path.join(root, 'data/runs/phase41/baseline/fixtures/semantic', `real-${fixtureRow.fixture}.json`)
    for (const candidate of experiment.candidates) {
      artifacts.push(await renderCell(directory, experiment, fixtureRow, fixtureFile, evidenceDirectory, candidate))
    }
  }
  assertMatrix(experiment, artifacts)
  const command = p41FixedShapingReproductionCommand(commandInput)
  await generateContactSheet(inputForContactSheet(experiment, artifacts, evidenceDirectory), {
    inputRoot: directory,
    outputDirectory: directory,
    workingDirectory: root,
    gitCommit: getGitCommit(root),
    command,
  })
  await writeValidation(directory, evidenceDirectory, experiment, artifacts, command)
  const counts = await verifyPublishedMatrix(directory, experiment, artifacts)
  console.log(JSON.stringify({ checkpoint, directory: evidenceDirectory, ...counts, command, humanApprovedInputs: experiment.humanApprovedInputs }))
}

async function main(argv: readonly string[]): Promise<void> {
  const command = parseP41FixedShapingCommand(argv)
  await writePhase41SemanticFixtures(root)
  await generateCheckpoint(command)
}

void main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})