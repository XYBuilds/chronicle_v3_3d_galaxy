import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { writeArtifactsAtomically } from '../src/artifacts.js'
import { getGitCommit, metadataFor, renderInBrowser, type BrowserRender } from '../src/browser.js'
import { generateContactSheet, type ContactSheetCell } from '../src/contactSheet.js'
import { renderPhase41DiagnosticInBrowser } from '../src/phase41Diagnostic.js'
import type { DataSource } from '../src/data-source.js'
import type { ExportArgs } from '../src/args.js'

type FixtureManifest = {
  data_version: string
  focus_emission_profile?: DataSource['focusEmissionProfile']
  focus_emission_profile_url?: string
}
type JsonRecord = Record<string, unknown>
type RuntimeEvidence = {
  entrypoint: string
  entry: string
  fetch_count: number
  requested_url: string
  fetch_transport: string
  resolved_source: string
  profile_id: string
  curve_sha256: string
  samples: number[]
  samples_sha256: string
  source_data_version: string
  source_movie_count: number
}

const root = path.resolve(import.meta.dirname, '../../..')
const command = 'python scripts/cron/run_p426_production_gate.py'
const rawResolution = 1200

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`[P42.6 production gate] ${message}`)
}

function record(value: unknown, label: string): JsonRecord {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as JsonRecord
}

function stable(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'stable number must be finite')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const source = record(value, 'stable value')
  return `{${Object.keys(source).sort().map((key) => `${JSON.stringify(key)}:${stable(source[key])}`).join(',')}}`
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function parseArgs(): string {
  const index = process.argv.indexOf('--evidence-root')
  assert(index >= 0 && typeof process.argv[index + 1] === 'string', 'requires --evidence-root PATH')
  return path.resolve(process.argv[index + 1]!)
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T
}

function actualEvidence(entrypoint: string, render: BrowserRender): RuntimeEvidence {
  const diagnostics = render.visualDiagnostics
  const profileFetches = render.profileFetches ?? []
  const provenance = record(diagnostics.profile_provenance, `${entrypoint} provenance`)
  assert(provenance.source === 'active', `${entrypoint} did not use active profile`)
  assert(profileFetches.length === 1, `${entrypoint} did not fetch exactly one fake immutable profile resource`)
  const requestedUrl = profileFetches[0]!
  const requested = new URL(requestedUrl)
  assert(requested.protocol === 'http:' && (requested.hostname === '127.0.0.1' || requested.hostname === 'localhost') && requested.pathname.endsWith(`/focus-emission-profiles/${String(provenance.profile_id)}.json`), `${entrypoint} did not use a controlled localhost immutable profile URL`)
  const visual = record(record(diagnostics.visual_config_payload, `${entrypoint} config`).visual, `${entrypoint} visual`)
  const focus = record(visual.focus, `${entrypoint} focus config`)
  const emission = record(focus.emission, `${entrypoint} emission config`)
  const samples = emission.samples
  assert(Array.isArray(samples) && samples.length === 201 && samples.every((sample) => typeof sample === 'number' && Number.isFinite(sample)), `${entrypoint} did not expose the active 201-sample LUT`)
  return {
    entrypoint,
    entry: entrypoint,
    fetch_count: profileFetches.length,
    requested_url: requestedUrl,
    fetch_transport: 'localhost-fake-immutable-resource',
    resolved_source: String(provenance.source),
    profile_id: String(provenance.profile_id),
    curve_sha256: String(provenance.curve_sha256),
    samples: [...samples] as number[],
    samples_sha256: sha256(JSON.stringify(samples)),
    source_data_version: String(provenance.source_data_version),
    source_movie_count: Number(provenance.source_movie_count),
  }
}

function visualInvariantSnapshot(diagnostics: JsonRecord): JsonRecord {
  const fields = ['movie_id', 'genres', 'band_count', 'world_radius', 'outer_radius', 'size_root', 'padding', 'visual_config_payload', 'visual_config_hash_input', 'profile_provenance', 'fixed_lightness', 'fixed_chroma', 'bloom', 'key_light', 'noise', 'rotation', 'camera']
  return Object.fromEntries(fields.map((field) => [field, diagnostics[field]]))
}

function assertSingleVariable(baseline: JsonRecord, candidate: JsonRecord, label: string): string {
  const invariant = visualInvariantSnapshot(candidate)
  assert(stable(visualInvariantSnapshot(baseline)) === stable(invariant), `${label} changed an invariant visual field`)
  assert(typeof candidate.rating === 'number' && typeof candidate.emission === 'number', `${label} lacks rating/emission`)
  return sha256(stable(invariant))
}

function sourceForRating(template: JsonRecord, profileBytes: Buffer, pointer: NonNullable<DataSource['focusEmissionProfile']>, profileUrl: string, rating: number): DataSource {
  const galaxy = JSON.parse(JSON.stringify(template)) as JsonRecord
  const movies = galaxy.movies
  assert(Array.isArray(movies) && movies.length === 1, 'single-variable fixture must have exactly one movie')
  const movie = record(movies[0], 'single-variable fixture movie')
  movie.vote_average = rating
  return {
    kind: 'manifest', label: `p42.6-local-fake-adapter-rating-${rating.toFixed(1)}`,
    bytes: Buffer.from(`${JSON.stringify(galaxy)}\n`, 'utf8'), version: String(record(galaxy.meta, 'single-variable meta').version),
    focusEmissionProfile: pointer, profileUrl, profileBytes,
  }
}

async function assertPngSidecarPair(png: string): Promise<void> {
  const [bytes, sidecarText] = await Promise.all([fs.readFile(png), fs.readFile(`${png}.render.json`, 'utf8')])
  const sidecar = JSON.parse(sidecarText) as JsonRecord
  assert(sidecar.png_sha256 === sha256(bytes), `${path.basename(png)} sidecar hash mismatch`)
}

async function main(): Promise<void> {
  const evidenceRoot = parseArgs()
  const rawDirectory = path.join(evidenceRoot, 'raw')
  const derivedDirectory = path.join(evidenceRoot, 'derived')
  const visualDirectory = path.join(derivedDirectory, 'visual')
  const diagnosticDirectory = path.join(derivedDirectory, 'diagnostics')
  await Promise.all([fs.mkdir(path.join(visualDirectory, 'cells'), { recursive: true }), fs.mkdir(diagnosticDirectory, { recursive: true })])

  const manifest = await readJson<FixtureManifest>(path.join(derivedDirectory, 'initial-manifest.json'))
  const website = await readJson<RuntimeEvidence>(path.join(derivedDirectory, 'website-runtime.json'))
  const profileBytes = await fs.readFile(path.join(derivedDirectory, 'initial-profile.json'))
  const template = await readJson<JsonRecord>(path.join(rawDirectory, 'planet-export-fixture.json'))
  assert(manifest.focus_emission_profile !== undefined && manifest.focus_emission_profile_url !== undefined, 'fixture manifest lacks active profile')
  const pointer = manifest.focus_emission_profile
  const profileUrl = manifest.focus_emission_profile_url

  const variants = [{ label: 'low', rating: 4.0 }, { label: 'mid', rating: 6.0 }, { label: 'high', rating: 8.0 }]
  const cells: ContactSheetCell[] = []
  const normal: RuntimeEvidence[] = []
  const renderDiagnostics: JsonRecord[] = []
  for (const variant of variants) {
    const source = sourceForRating(template, profileBytes, pointer, profileUrl, variant.rating)
    const output = path.join(visualDirectory, 'cells', `${variant.label}.png`)
    const args: ExportArgs = { movieId: 40, output, resolution: rawResolution, padding: 0.2, bloom: 'on', sizeRoot: 3, renderMode: 'shader' }
    const render = await renderInBrowser(args, source, root)
    const evidence = actualEvidence('tools/planet-exporter/src/browser.ts:renderInBrowser -> planet-export.html', render)
    normal.push(evidence)
    renderDiagnostics.push(render.visualDiagnostics)
    const sidecar = {
      ...metadataFor(args, source, render, getGitCommit(root)),
      p42_6_production_gate: {
        schema_version: 'p42.6-visual-sidecar-v2', reproduction_command: command, local_fake_adapter: true,
        profile_consumer: evidence, varied_inputs: { vote_average: variant.rating, emission: render.visualDiagnostics.emission },
        allowed_changed_fields: ['rating', 'emission'],
        invariant_snapshot: visualInvariantSnapshot(render.visualDiagnostics),
      },
    }
    await writeArtifactsAtomically({ png: output, metadata: `${output}.render.json` }, render.png, sidecar)
    await assertPngSidecarPair(output)
    const emission = render.visualDiagnostics.emission
    assert(typeof emission === 'number' && Number.isFinite(emission), `${variant.label} emission invalid`)
    cells.push({
      rowKey: 'same-movie', columnKey: variant.label, input: `cells/${variant.label}.png`,
      caption: `${variant.label.toUpperCase()} · same id=40\nrating=${variant.rating} · emission=${emission.toFixed(6)}\nactive ${evidence.profile_id} · Bloom ON · ${rawResolution}×${rawResolution}`,
      parameters: { movie_id: 40, rating: variant.rating, emission, profile_id: evidence.profile_id, curve_sha256: evidence.curve_sha256, png: `cells/${variant.label}.png`, sidecar: `cells/${variant.label}.png.render.json` },
    })
  }
  const invariantSha256 = renderDiagnostics.map((diagnostics, index) => assertSingleVariable(renderDiagnostics[0]!, diagnostics, variants[index]!.label))
  assert(new Set(invariantSha256).size === 1, 'low/mid/high did not preserve a shared visual invariant snapshot')

  // Separate Phase 41 diagnostic page and adapter, with no override, fetches the same fake immutable profile.
  const diagnosticSource = sourceForRating(template, profileBytes, pointer, profileUrl, 6.0)
  const diagnosticArgs: ExportArgs = { movieId: 40, output: path.join(diagnosticDirectory, 'mid.png'), resolution: rawResolution, padding: 0.2, bloom: 'on', sizeRoot: 3, renderMode: 'shader' }
  const diagnosticRender = await renderPhase41DiagnosticInBrowser(diagnosticArgs, diagnosticSource, root)
  const diagnostics = actualEvidence('tools/planet-exporter/src/phase41Diagnostic.ts:renderPhase41DiagnosticInBrowser -> phase41-diagnostics.html', diagnosticRender)
  const diagnosticSidecar = { ...metadataFor(diagnosticArgs, diagnosticSource, diagnosticRender, getGitCommit(root)), p42_6_diagnostic_gate: { reproduction_command: command, local_fake_adapter: true, profile_consumer: diagnostics, override: null } }
  await writeArtifactsAtomically({ png: diagnosticArgs.output, metadata: `${diagnosticArgs.output}.render.json` }, diagnosticRender.png, diagnosticSidecar)
  await assertPngSidecarPair(diagnosticArgs.output)

  const parityFields = (value: RuntimeEvidence): Omit<RuntimeEvidence, 'entrypoint' | 'entry' | 'fetch_count' | 'requested_url' | 'fetch_transport' | 'resolved_source'> => ({ profile_id: value.profile_id, curve_sha256: value.curve_sha256, samples: value.samples, samples_sha256: value.samples_sha256, source_data_version: value.source_data_version, source_movie_count: value.source_movie_count })
  assert(website.fetch_count === 1 && website.fetch_transport === 'localhost-fake-immutable-resource' && website.resolved_source === 'active', 'website evidence did not use one active fake HTTP immutable resource')
  assert(new URL(website.requested_url).protocol === 'http:' && new URL(website.requested_url).hostname === '127.0.0.1', 'website requested URL was not localhost')
  for (const value of [...normal, diagnostics]) {
    assert(value.fetch_count === 1 && value.fetch_transport === 'localhost-fake-immutable-resource' && value.resolved_source === 'active', `${value.entrypoint} did not use one active fake HTTP immutable resource`)
    assert(stable(parityFields(value)) === stable(parityFields(website)), `${value.entrypoint} differs from website loader profile result`)
  }

  await generateContactSheet({
    title: 'P42.6 local production gate · same Focus Planet · rating/emission only · Phase 41 Bloom ON',
    rows: [{ key: 'same-movie', label: 'same id=40 · seed/hue/genres/camera/rotation fixed' }],
    columns: variants.map((variant) => ({ key: variant.label, label: `${variant.label.toUpperCase()} · rating ${variant.rating}` })),
    cells,
  }, { inputRoot: visualDirectory, outputDirectory: visualDirectory, workingDirectory: root, gitCommit: getGitCommit(root), command })
  for (const cell of cells) await assertPngSidecarPair(path.join(visualDirectory, cell.input))

  const consumers = {
    schema_version: 'p42.6-consumer-parity-v2', status: 'pass', reproduction_command: command,
    website_runtime: website,
    normal_planet_exporter: normal,
    diagnostics,
    parity_assertion: { fields: ['profile_id', 'curve_sha256', 'samples[201]', 'samples_sha256', 'source_data_version', 'source_movie_count'], status: 'pass' },
    visual: { contact_sheet: 'visual/contact-sheet.png', raw_pngs: cells.map((cell) => cell.input), raw_png_resolution: rawResolution, diagnostic_png: 'diagnostics/mid.png', invariant_snapshot_sha256: invariantSha256[0], varied_fields_only: ['rating', 'emission'], png_sidecar_pairs: 'pass' },
  }
  const validation = {
    schema_version: 'p42.6-visual-validation-v2', status: 'pending-human-review', reproduction_command: command,
    assertions: { same_movie_identity: 'pass', fixed_seed_hue_genres_camera_rotation: 'pass', only_rating_emission_vary: 'pass', profile_consumer_parity: 'pass', phase41_diagnostic_no_override: 'pass', png_sidecar_pairs: 'pass' },
    allowed_changed_fields: ['rating', 'emission'],
    raw_png_resolution: `${rawResolution}x${rawResolution}`, contact_sheet: 'visual/contact-sheet.png', cells: cells.map((cell, index) => ({ ...cell.parameters, invariant_snapshot_sha256: invariantSha256[index] })),
  }
  await Promise.all([
    fs.writeFile(path.join(derivedDirectory, 'consumer-parity.json'), `${JSON.stringify(consumers, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(derivedDirectory, 'visual-validation.json'), `${JSON.stringify(validation, null, 2)}\n`, 'utf8'),
  ])
  console.log(JSON.stringify({ status: 'pass', profile_id: website.profile_id, curve_sha256: website.curve_sha256, movie_count: 1, ratings: variants.map((variant) => variant.rating), raw_png_resolution: rawResolution, invariant_snapshot_sha256: invariantSha256[0], evidence_root: evidenceRoot }))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})