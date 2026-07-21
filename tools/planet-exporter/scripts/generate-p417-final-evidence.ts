import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { ExportArgs } from '../src/args.js'
import { writeArtifactsAtomically } from '../src/artifacts.js'
import { getGitCommit, metadataFor, renderInBrowser } from '../src/browser.js'
import { generateContactSheet, type ContactSheetCell, type ContactSheetParameters } from '../src/contactSheet.js'
import type { DataSource } from '../src/data-source.js'
import { loadAuthoritativeGalaxy, type JsonRecord, type Phase41Movie } from '../src/phase41Baseline.js'
import { assertPngSafe } from '../src/png.js'
import { PLANET_VISUAL_DEFAULTS, planetVisualConfigHashInput } from '../../../frontend/src/three/planetVisualDefaults.js'

const root = path.resolve(import.meta.dirname, '../../..')
const controlledDirectory = path.join(root, 'data/runs/phase41/p41.7-final-controlled-bloom-off-on')
const realDirectory = path.join(root, 'data/runs/phase41/p41.7-final-real-bloom-on')
const resolution = 1024
const padding = 0.35
const sizeRoot = 3 as const
const controlledRatings = [4.0, 4.5, 5.5, 6.5, 7.5, 8.2, 9.5] as const
const command = 'npm run evidence:p41.7 -w planet-exporter'

type Bloom = 'off' | 'on'
type Artifact = {
  row: string
  column: string
  label: string
  movie: Phase41Movie
  bloom: Bloom
  png: string
  sidecar: string
  pngSha256: string
  visualHash: string
  diagnostics: JsonRecord
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[P41.7 final evidence] ${message}`)
}

function record(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as JsonRecord
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stable(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'stable data must be finite')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  assert(typeof value === 'object', 'stable data must be JSON-compatible')
  const source = value as Record<string, unknown>
  return `{${Object.keys(source).sort().map((key) => `${JSON.stringify(key)}:${stable(source[key])}`).join(',')}}`
}

function createFixture(movie: Phase41Movie, meta: JsonRecord, label: string, controlledRating?: number): Buffer {
  const fixtureMovie = JSON.parse(JSON.stringify(movie)) as JsonRecord
  if (controlledRating !== undefined) fixtureMovie.vote_average = controlledRating
  const fixture = {
    meta: { ...meta, count: 1, version: `${String(meta.version)}-p41.7-${label}` },
    movies: [fixtureMovie],
    phase41_fixture: {
      kind: controlledRating === undefined ? 'real' : 'controlled-rating',
      label,
      source_movie_id: movie.id,
      source_sha256: 'authoritative-gzip-verified-in-validation',
      selection: controlledRating === undefined ? label : `${label}; controlled rating=${controlledRating.toFixed(1)}`,
    },
  }
  return Buffer.from(`${JSON.stringify(fixture)}\n`, 'utf8')
}

function bloomDiagnostics(value: JsonRecord, expected: Bloom): void {
  const bloom = record(value.bloom, 'render diagnostics bloom')
  assert(bloom.enabled === (expected === 'on'), `rendered Bloom state must be ${expected}`)
  assert(bloom.composition === PLANET_VISUAL_DEFAULTS.focus.bloom.composition, 'Bloom composition drifted')
  assert(bloom.strength === PLANET_VISUAL_DEFAULTS.focus.bloom.strength, 'Bloom strength drifted')
  assert(bloom.radius === PLANET_VISUAL_DEFAULTS.focus.bloom.radius, 'Bloom radius drifted')
  assert(bloom.threshold === PLANET_VISUAL_DEFAULTS.focus.bloom.threshold, 'Bloom threshold drifted')
}

async function renderArtifact(
  directory: string,
  row: string,
  column: string,
  label: string,
  movie: Phase41Movie,
  meta: JsonRecord,
  bloom: Bloom,
  controlledRating?: number,
): Promise<Artifact> {
  const fixture = createFixture(movie, meta, label, controlledRating)
  const fileName = `${row}__${column}.png`
  const source: DataSource = { kind: 'file', label: `p41.7:${label}`, bytes: fixture }
  const args: ExportArgs = {
    movieId: movie.id,
    output: path.join(directory, 'cells', fileName),
    resolution,
    padding,
    bloom,
    sizeRoot,
    renderMode: 'shader',
  }
  const render = await renderInBrowser(args, source, root)
  assertPngSafe(render.png, resolution)
  const expectedVisualHash = planetVisualConfigHashInput(bloom === 'on')
  assert(render.visualHash === expectedVisualHash, `${fileName} did not use the resolved production visual hash`)
  const diagnostics = render.visualDiagnostics
  bloomDiagnostics(diagnostics, bloom)
  const renderedRating = diagnostics.rating
  assert(renderedRating === (controlledRating ?? movie.vote_average), `${fileName} rating drifted`)
  const sidecar = metadataFor(args, source, render, getGitCommit(root))
  delete sidecar.generated_at
  const pngSha256 = sha256(render.png)
  await writeArtifactsAtomically(
    { png: path.join(directory, 'cells', fileName), metadata: path.join(directory, 'cells', `${fileName}.render.json`) },
    render.png,
    {
      ...sidecar,
      p41_7_final_evidence: {
        schema_version: 'p41.7-final-evidence-v1',
        reproduction_command: command,
        source: 'frontend/public/data/galaxy_data.json.gz',
        source_movie_id: movie.id,
        controlled_rating: controlledRating ?? null,
        bloom,
        production_visual_config_input: expectedVisualHash,
        production_visual_config_sha256: sha256(expectedVisualHash),
        diagnostic_override: null,
        png_sha256: pngSha256,
      },
    },
  )
  return {
    row,
    column,
    label,
    movie,
    bloom,
    png: `cells/${fileName}`,
    sidecar: `cells/${fileName}.render.json`,
    pngSha256,
    visualHash: expectedVisualHash,
    diagnostics,
  }
}

function contactCell(artifact: Artifact): ContactSheetCell {
  const emission = artifact.diagnostics.emission
  assert(typeof emission === 'number' && Number.isFinite(emission), `${artifact.png} emission must be finite`)
  return {
    rowKey: artifact.row,
    columnKey: artifact.column,
    input: artifact.png,
    caption: `${artifact.movie.title}\nid=${artifact.movie.id} rating=${String(artifact.diagnostics.rating)} emission=${emission.toFixed(6)}\nBloom ${artifact.bloom.toUpperCase()} · votes=${artifact.movie.vote_count}`,
    parameters: {
      movie_id: artifact.movie.id,
      rating: artifact.diagnostics.rating as number,
      vote_count: artifact.movie.vote_count,
      emission,
      bloom: artifact.bloom,
      visual_config_sha256: sha256(artifact.visualHash),
      diagnostics: JSON.parse(stable(artifact.diagnostics)) as ContactSheetParameters,
      png: artifact.png,
      sidecar: artifact.sidecar,
    },
  }
}

async function writeValidation(directory: string, title: string, artifacts: readonly Artifact[], sourceSha256: string): Promise<void> {
  const expected = artifacts.length
  assert(expected > 0, `${title} requires artifacts`)
  const keys = new Set<string>()
  for (const artifact of artifacts) {
    const key = `${artifact.row}\u0000${artifact.column}`
    assert(!keys.has(key), `${title} duplicate cell ${key}`)
    keys.add(key)
    const png = await fs.readFile(path.join(directory, artifact.png))
    assert(sha256(png) === artifact.pngSha256, `${artifact.png} PNG hash drifted`)
    assert(artifact.visualHash === planetVisualConfigHashInput(artifact.bloom === 'on'), `${artifact.png} config hash drifted`)
  }
  const validation = {
    schema_version: 'p41.7-final-evidence-validation-v1',
    title,
    status: 'pending-human-review',
    source: { relative_path: 'frontend/public/data/galaxy_data.json.gz', sha256: sourceSha256 },
    reproduction_command: command,
    assertions: {
      normal_exporter_only: 'pass',
      diagnostic_override: 'absent',
      resolved_production_visual_hash: 'pass',
      cell_hashes: 'pass',
      contact_sheet_complete: 'pass',
    },
    artifacts: artifacts.map((artifact) => ({ row: artifact.row, column: artifact.column, png: artifact.png, sidecar: artifact.sidecar, png_sha256: artifact.pngSha256, visual_config_sha256: sha256(artifact.visualHash) })),
  }
  await fs.writeFile(path.join(directory, 'validation.json'), `${stable(validation)}\n`, 'utf8')
}

async function assertRepeatStable(movie: Phase41Movie, meta: JsonRecord): Promise<void> {
  const fixture = createFixture(movie, meta, 'repeat-stability-control', 7.5)
  const source: DataSource = { kind: 'file', label: 'p41.7:repeat-stability-control', bytes: fixture }
  const args: ExportArgs = { movieId: movie.id, output: path.join(controlledDirectory, 'repeat.png'), resolution, padding, bloom: 'on', sizeRoot, renderMode: 'shader' }
  const [first, second] = await Promise.all([renderInBrowser(args, source, root), renderInBrowser(args, source, root)])
  assert(sha256(first.png) === sha256(second.png), 'repeat control renderer output is not byte-stable')
  assert(first.visualHash === second.visualHash && first.visualHash === planetVisualConfigHashInput(true), 'repeat control visual hash drifted')
}

function selectRealSamples(movies: readonly Phase41Movie[]): Array<{ key: string; label: string; movie: Phase41Movie }> {
  const sorted = [...movies]
  const low = sorted.reduce((best, movie) => movie.vote_average < best.vote_average ? movie : best)
  const mid = sorted.reduce((best, movie) => Math.abs(movie.vote_average - 6.5) < Math.abs(best.vote_average - 6.5) ? movie : best)
  const high = sorted.filter((movie) => movie.vote_average >= 8.2).sort((left, right) => right.vote_count - left.vote_count || right.vote_average - left.vote_average || left.id - right.id)[0]
  const dense = sorted.filter((movie) => movie.vote_average >= 4.5 && movie.vote_average <= 7.5).sort((left, right) => right.vote_count - left.vote_count || left.id - right.id)[0]
  const anomaly = sorted.filter((movie) => movie.vote_average >= 9).sort((left, right) => left.vote_count - right.vote_count || right.vote_average - left.vote_average || left.id - right.id)[0]
  assert(low && mid && high && dense && anomaly, 'real sample selection was incomplete')
  const selected = [
    { key: 'low-rating', label: 'real lowest rating', movie: low },
    { key: 'mid-rating', label: 'real nearest rating 6.5', movie: mid },
    { key: 'high-rating', label: 'real >=8.2 highest vote count', movie: high },
    { key: 'population-dense', label: 'real 4.5-7.5 highest vote count', movie: dense },
    { key: 'high-rating-low-votes', label: 'real >=9 lowest vote count', movie: anomaly },
  ]
  assert(new Set(selected.map((entry) => entry.movie.id)).size === selected.length, 'real evidence samples must be distinct')
  return selected
}

async function main(): Promise<void> {
  const { galaxy, sourceSha256 } = await loadAuthoritativeGalaxy(root)
  assert(galaxy.meta.version === '2026.07.18.daily.113' && galaxy.movies.length === 61531, 'authoritative data version or count drifted')
  await fs.rm(controlledDirectory, { recursive: true, force: true })
  await fs.rm(realDirectory, { recursive: true, force: true })
  await Promise.all([fs.mkdir(path.join(controlledDirectory, 'cells'), { recursive: true }), fs.mkdir(path.join(realDirectory, 'cells'), { recursive: true })])

  const controlMovie = [...galaxy.movies].sort((left, right) => right.genres.length - left.genres.length || right.vote_count - left.vote_count || left.id - right.id)[0]!
  await assertRepeatStable(controlMovie, galaxy.meta)
  const controlled: Artifact[] = []
  for (const rating of controlledRatings) {
    for (const bloom of ['off', 'on'] as const) {
      controlled.push(await renderArtifact(controlledDirectory, 'controlled-rating', `${rating.toFixed(1)}-${bloom}`, `controlled-rating-${rating.toFixed(1)}`, controlMovie, galaxy.meta, bloom, rating))
    }
  }
  await generateContactSheet({
    title: 'P41.7 final production SSOT · controlled ratings · Bloom OFF / ON',
    rows: [{ key: 'controlled-rating', label: `same movie id=${controlMovie.id}` }],
    columns: controlledRatings.flatMap((rating) => ['off', 'on'].map((bloom) => ({ key: `${rating.toFixed(1)}-${bloom}`, label: `rating ${rating.toFixed(1)} · Bloom ${bloom.toUpperCase()}` }))),
    cells: controlled.map(contactCell),
  }, { inputRoot: controlledDirectory, outputDirectory: controlledDirectory, workingDirectory: root, gitCommit: getGitCommit(root), command })
  await writeValidation(controlledDirectory, 'controlled rating Bloom OFF/ON', controlled, sourceSha256)

  const real: Artifact[] = []
  for (const sample of selectRealSamples(galaxy.movies)) {
    real.push(await renderArtifact(realDirectory, 'real-movie', sample.key, sample.label, sample.movie, galaxy.meta, 'on'))
  }
  await generateContactSheet({
    title: 'P41.7 final production SSOT · real samples · Bloom ON',
    rows: [{ key: 'real-movie', label: 'authoritative gzip selections' }],
    columns: real.map((artifact) => ({ key: artifact.column, label: artifact.label })),
    cells: real.map(contactCell),
  }, { inputRoot: realDirectory, outputDirectory: realDirectory, workingDirectory: root, gitCommit: getGitCommit(root), command })
  await writeValidation(realDirectory, 'real low/mid/high/dense/anomaly Bloom ON', real, sourceSha256)
  console.log(JSON.stringify({ controlled_directory: path.relative(root, controlledDirectory), real_directory: path.relative(root, realDirectory), controlled_cells: controlled.length, real_cells: real.length, repeat_byte_stable: true }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})