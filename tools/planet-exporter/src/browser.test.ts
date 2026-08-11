import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { ExportArgs } from './args.js'
import { stableFocusEmissionJson } from '../../../frontend/src/three/focusEmission.js'
import { assertCanonicalVisualConfig, assertP39LegacyVisualConfig, metadataFor, parsePhase41VisualDiagnostics, parseVisualDiagnostics, type BrowserRender } from './browser.js'
import type { DataSource } from './data-source.js'

const args: ExportArgs = {
  movieId: 157336,
  output: '/tmp/planet.png',
  resolution: 3000,
  padding: 0.08,
  bloom: 'on',
  sizeRoot: 3,
  renderMode: 'shader',
  manifestUrl: 'https://example.test/data/galaxy_assets_manifest.json',
}

const source: DataSource = {
  kind: 'manifest',
  label: 'https://example.test/data/galaxy_assets_manifest.json',
  pageUrl: 'https://example.test/galaxy_data.json.gz',
  version: 'fixture-v1',
  manifestUrl: 'https://example.test/data/galaxy_assets_manifest.json',
  profileUrl: 'https://example.test/galaxy/focus-emission-profiles/rating-emission-2026-07-a.json',
  focusEmissionProfile: {
    profile_id: 'rating-emission-2026-07-a',
    period: '2026-07',
    model_version: 'rating-midrank-cdf-lut-v1',
    curve_sha256: 'a'.repeat(64),
    source_data_version: 'fixture-v1',
    source_movie_count: 1,
    status: 'active',
    activated_at: '2026-07-22T00:00:00.000Z',
  },
}

const visualHash = JSON.stringify({
  planet: JSON.stringify({
    schemaVersion: 4,
    focus: { emission: { modelVersion: 'vote-average-power-clamped-v1', exponent: 3, intensityMin: 0.06, intensityMax: 0.6 } },
    lighting: { keyLightIntensity: 1 },
    color: { pipelineVersion: 'oklch-local-base-linear-emission-fixed-key-single-srgb-v1' },
  }),
  perlinBloom: JSON.stringify({ composition: 'pure-bloom-delta-v1', enabled: true, strength: 0.005, radius: 1, threshold: 0 }),
  exportSizeRoot: 3,
  supportedExportSizeRoots: [2, 3, 4],
})

const visualDiagnostics = {
  movie_id: 157336,
  genres: ['Drama'],
  rating: 5,
  band_count: 1,
  world_radius: 0.01,
  outer_radius: 0.01,
  size_root: 3,
  padding: 0.08,
  emission: 0.1275,
  emission_curve: { model_version: 'vote-average-power-clamped-v1', exponent: 3, intensity_min: 0.06, intensity_max: 0.6 },
  fixed_lightness: 0.55,
  fixed_chroma: 0.15,
  bloom: { enabled: true, composition: 'pure-bloom-delta-v1', strength: 0.005, radius: 1, threshold: 0 },
  key_light: { enabled: true, direction: [0.7, 0.7, -0.14], intensity: 1, flat_shading_mix: 0.8 },
  noise: { seed: 123, scale: 2.35, octaves: 4, persistence: 0.52 },
  rotation: { base_quaternion: [0, 0, 0, 1], seeded_spin_axis_world: [0, 1, 0], revs_per_sec: 0.01 },
  camera: { projection: 'orthographic', position: [0, 0, -20], quaternion: [0, 1, 0, 0], direction: [0, 0, 1], left: -10, right: 10, top: 10, bottom: -10, near: 0.01, far: 40 },
}

const render: BrowserRender = {
  png: Buffer.from('png'),
  dataVersion: 'fixture-v1',
  webglRenderer: 'fixture-gpu',
  visualHash,
  visualDiagnostics,
  chromiumVersion: 'fixture-chromium',
}

describe('visual diagnostics parser', () => {
  it('accepts a complete finite diagnostics snapshot', () => {
    expect(parseVisualDiagnostics(JSON.stringify(visualDiagnostics))).toEqual(visualDiagnostics)
  })

  it.each([
    ['missing rotation', { ...visualDiagnostics, rotation: undefined }],
    ['null nested object', { ...visualDiagnostics, key_light: null }],
    ['null numeric value', { ...visualDiagnostics, emission: null }],
    [
      'invalid quaternion tuple',
      {
        ...visualDiagnostics,
        rotation: { ...visualDiagnostics.rotation, base_quaternion: [0, 0, 1] },
      },
    ],
    ['invalid movie id', { ...visualDiagnostics, movie_id: 0 }],
    ['invalid size root', { ...visualDiagnostics, size_root: 5 }],
    ['invalid padding', { ...visualDiagnostics, padding: 0.5 }],
    ['outer radius below world radius', { ...visualDiagnostics, outer_radius: 0.001 }],
    ['invalid band count', { ...visualDiagnostics, band_count: 9 }],
    ['invalid bloom radius', { ...visualDiagnostics, bloom: { ...visualDiagnostics.bloom, radius: 2 } }],
    ['invalid bloom strength', { ...visualDiagnostics, bloom: { ...visualDiagnostics.bloom, strength: -1 } }],
    [
      'invalid noise seed',
      { ...visualDiagnostics, noise: { ...visualDiagnostics.noise, seed: -1 } },
    ],
    [
      'invalid noise octaves',
      { ...visualDiagnostics, noise: { ...visualDiagnostics.noise, octaves: 0 } },
    ],
    [
      'invalid camera frustum',
      { ...visualDiagnostics, camera: { ...visualDiagnostics.camera, far: 0.001 } },
    ],
  ])('rejects %s', (_label, candidate) => {
    expect(() => parseVisualDiagnostics(JSON.stringify(candidate))).toThrow(/visual diagnostics/)
  })

  it('requires a complete canonical payload and an exact dataset hash on current exporter paths', () => {
    const payload = { resolved: { bloom: true, emission: 'active-profile' } }
    const canonicalInput = stableFocusEmissionJson(payload)
    const canonical = { ...visualDiagnostics, visual_config_payload: payload, visual_config_hash_input: canonicalInput }
    expect(() => assertCanonicalVisualConfig({ ...canonical, visual_config_payload: undefined }, canonicalInput, 'planet export')).toThrow(/visual_config_payload/)
    expect(() => assertCanonicalVisualConfig({ ...canonical, visual_config_hash_input: '' }, '', 'planet export')).toThrow(/visual_config_hash_input/)
    expect(() => assertCanonicalVisualConfig(canonical, 'different-input', 'planet export')).toThrow(/dataset visual hash disagrees/)
  })

  it('rejects a payload altered behind unchanged visual-config aliases', () => {
    const payload = { resolved: { bloom: true, emission: 'active-profile' } }
    const canonicalInput = stableFocusEmissionJson(payload)
    const tampered = { ...visualDiagnostics, visual_config_payload: { resolved: { bloom: false, emission: 'active-profile' } }, visual_config_hash_input: canonicalInput }
    expect(() => assertCanonicalVisualConfig(tampered, canonicalInput, 'planet export')).toThrow(/does not match its canonical payload/)
  })

  it('requires the production renderer snapshot to agree with final diagnostics and active provenance', () => {
    const provenance = {
      profile_id: 'rating-emission-2026-08-a',
      period: '2026-08',
      model_version: 'rating-midrank-cdf-lut-v1',
      curve_sha256: 'a'.repeat(64),
      source_data_version: 'fixture-v1',
      source_movie_count: 1,
      source: 'active',
    }
    const payload = {
      resolved: { bloom: true, emission: 'active-profile' },
      emission_profile: provenance,
    }
    const canonicalInput = stableFocusEmissionJson(payload)
    const rendererSnapshot = {
      canonicalHashInput: canonicalInput,
      profileProvenance: {
        profile_id: provenance.profile_id,
        period: provenance.period,
        model_version: provenance.model_version,
        curve_sha256: provenance.curve_sha256,
        source_data_version: provenance.source_data_version,
        source_movie_count: provenance.source_movie_count,
      },
      profileSource: 'active',
      movieId: visualDiagnostics.movie_id,
      worldRadius: visualDiagnostics.world_radius,
      outerRadius: visualDiagnostics.outer_radius,
      emission: visualDiagnostics.emission,
      focus: { lightness: visualDiagnostics.fixed_lightness, chroma: visualDiagnostics.fixed_chroma },
      lighting: {
        enabled: visualDiagnostics.key_light.enabled,
        direction: visualDiagnostics.key_light.direction,
        keyLightIntensity: visualDiagnostics.key_light.intensity,
        flatShadingMix: visualDiagnostics.key_light.flat_shading_mix,
      },
      noise: visualDiagnostics.noise,
      bands: { bandCount: visualDiagnostics.band_count },
      bloom: {
        enabled: visualDiagnostics.bloom.enabled,
        strength: visualDiagnostics.bloom.strength,
        radius: visualDiagnostics.bloom.radius,
        threshold: visualDiagnostics.bloom.threshold,
      },
    }
    const canonical = {
      ...visualDiagnostics,
      visual_config_payload: payload,
      visual_config_hash_input: canonicalInput,
      profile_provenance: provenance,
      renderer_snapshot: rendererSnapshot,
    }

    expect(assertCanonicalVisualConfig(canonical, canonicalInput, 'planet export', true)).toBe(canonicalInput)
    expect(() => assertCanonicalVisualConfig({
      ...canonical,
      renderer_snapshot: { ...rendererSnapshot, emission: rendererSnapshot.emission + 0.1 },
    }, canonicalInput, 'planet export', true)).toThrow(/renderer snapshot disagrees/)
    expect(() => assertCanonicalVisualConfig({
      ...canonical,
      profile_provenance: { ...provenance, source: 'legacy-fallback' },
    }, canonicalInput, 'planet export', true)).toThrow(/active profile provenance/)

    const mismatchedPayload = {
      ...payload,
      emission_profile: { ...provenance, profile_id: 'different-active-profile' },
    }
    const mismatchedHashInput = stableFocusEmissionJson(mismatchedPayload)
    expect(() => assertCanonicalVisualConfig({
      ...canonical,
      visual_config_payload: mismatchedPayload,
      visual_config_hash_input: mismatchedHashInput,
      renderer_snapshot: { ...rendererSnapshot, canonicalHashInput: mismatchedHashInput },
    }, mismatchedHashInput, 'planet export', true)).toThrow(/active profile provenance/)
  })

  it('requires P39 legacy identity, power mode, and renderer readback to agree', () => {
    const evidenceIdentity = 'p39.11-checkpoint-c2-radius-pure-delta-v1'
    const provenance = {
      profile_id: 'legacy-focus-emission-fallback-v1',
      period: 'legacy',
      model_version: 'rating-midrank-cdf-lut-v1',
      curve_sha256: 'b'.repeat(64),
      source_data_version: 'phase39-fixture',
      source_movie_count: 1,
      source: 'legacy-fallback',
    }
    const compatibility = {
      proof: 'p39.11-frozen-profile-fixture',
      evidenceIdentity,
      historicalVisualHash: '{"diagnostic":"p39.11-checkpoint-c2-radius-pure-delta-v1"}',
      historicalMetadata: { checkpoint: 'C2-radius', bloomRadius: 0.5 },
    }
    const derivation = {
      kind: 'legacy-power',
      modelVersion: 'vote-average-power-clamped-v1',
      exponent: 2,
      intensityMin: 0.06,
      intensityMax: 0.6,
    }
    const payload = {
      schema_version: 'canonical-planet-visual-state-v1',
      emission_profile: provenance,
      override_provenance: 'none',
      legacy_compatibility: compatibility,
      emission_derivation: derivation,
    }
    const canonicalInput = stableFocusEmissionJson(payload)
    const snapshot = {
      canonicalHashInput: canonicalInput,
      profileProvenance: {
        profile_id: provenance.profile_id,
        period: provenance.period,
        model_version: provenance.model_version,
        curve_sha256: provenance.curve_sha256,
        source_data_version: provenance.source_data_version,
        source_movie_count: provenance.source_movie_count,
      },
      profileSource: 'legacy-fallback',
      overrideProvenance: 'none',
      legacyCompatibility: compatibility,
      emissionDerivation: derivation,
      movieId: visualDiagnostics.movie_id,
      worldRadius: visualDiagnostics.world_radius,
      outerRadius: visualDiagnostics.outer_radius,
      emission: visualDiagnostics.emission,
      focus: { lightness: visualDiagnostics.fixed_lightness, chroma: visualDiagnostics.fixed_chroma },
      lighting: {
        enabled: visualDiagnostics.key_light.enabled,
        direction: visualDiagnostics.key_light.direction,
        keyLightIntensity: visualDiagnostics.key_light.intensity,
        flatShadingMix: visualDiagnostics.key_light.flat_shading_mix,
      },
      noise: visualDiagnostics.noise,
      bands: { bandCount: visualDiagnostics.band_count },
      bloom: visualDiagnostics.bloom,
    }
    const legacy = {
      ...visualDiagnostics,
      visual_config_payload: payload,
      visual_config_hash_input: canonicalInput,
      profile_provenance: provenance,
      override_provenance: 'none',
      renderer_snapshot: snapshot,
      legacy_compatibility: compatibility,
      emission_derivation: derivation,
    }

    expect(assertP39LegacyVisualConfig(legacy, canonicalInput, evidenceIdentity)).toBe(canonicalInput)
    expect(() => assertP39LegacyVisualConfig({
      ...legacy,
      legacy_compatibility: { ...compatibility, evidenceIdentity: 'different-evidence' },
    }, canonicalInput, evidenceIdentity)).toThrow(/legacy compatibility identity/)
    expect(() => assertP39LegacyVisualConfig({
      ...legacy,
      override_provenance: 'phase41-diagnostic-override',
    }, canonicalInput, evidenceIdentity)).toThrow(/must not use Phase 41 override semantics/)
    expect(() => assertP39LegacyVisualConfig({
      ...legacy,
      diagnostic_marker: 'phase41-visual-diagnostic-v1',
    }, canonicalInput, evidenceIdentity)).toThrow(/must not use Phase 41 override semantics/)
    expect(() => assertP39LegacyVisualConfig({
      ...legacy,
      legacy_compatibility: {
        ...compatibility,
        historicalVisualHash: '{"diagnostic":"different-evidence"}',
      },
    }, canonicalInput, evidenceIdentity)).toThrow(/legacy compatibility identity/)
    expect(() => assertP39LegacyVisualConfig({
      ...legacy,
      renderer_snapshot: { ...snapshot, emission: snapshot.emission + 0.1 },
    }, canonicalInput, evidenceIdentity)).toThrow(/renderer snapshot disagrees/)
    expect(() => assertP39LegacyVisualConfig({
      ...legacy,
      renderer_snapshot: {
        ...snapshot,
        emissionDerivation: { ...derivation, exponent: 3 },
      },
    }, canonicalInput, evidenceIdentity)).toThrow(/historical power emission identity/)
  })

  const phase41Provenance = {
    profile_id: 'fixture-profile',
    period: '2026-07',
    model_version: 'rating-midrank-cdf-lut-v1',
    curve_sha256: 'a'.repeat(64),
    source_data_version: 'fixture',
    source_movie_count: 1,
    source: 'active',
  }
  const phase41Payload = {
    resolved: { diagnostic: 'phase41' },
    emission_profile: phase41Provenance,
    override_provenance: 'none',
    diagnostic_marker: 'phase41-visual-diagnostic-v1',
  }
  const phase41HashInput = stableFocusEmissionJson(phase41Payload)
  const phase41Snapshot = {
    canonicalHashInput: phase41HashInput,
    diagnosticMarker: 'phase41-visual-diagnostic-v1',
    overrideProvenance: 'none',
    profileProvenance: {
      profile_id: phase41Provenance.profile_id,
      period: phase41Provenance.period,
      model_version: phase41Provenance.model_version,
      curve_sha256: phase41Provenance.curve_sha256,
      source_data_version: phase41Provenance.source_data_version,
      source_movie_count: phase41Provenance.source_movie_count,
    },
    profileSource: 'active',
    movieId: visualDiagnostics.movie_id,
    worldRadius: visualDiagnostics.world_radius,
    outerRadius: visualDiagnostics.outer_radius,
    emission: visualDiagnostics.emission,
    focus: { lightness: visualDiagnostics.fixed_lightness, chroma: visualDiagnostics.fixed_chroma },
    lighting: {
      enabled: visualDiagnostics.key_light.enabled,
      direction: visualDiagnostics.key_light.direction,
      keyLightIntensity: visualDiagnostics.key_light.intensity,
      flatShadingMix: visualDiagnostics.key_light.flat_shading_mix,
    },
    noise: visualDiagnostics.noise,
    bands: { bandCount: visualDiagnostics.band_count },
    bloom: visualDiagnostics.bloom,
  }
  const phase41 = {
    ...visualDiagnostics,
    profile_provenance: phase41Provenance,
    override_provenance: 'none',
    diagnostic_marker: 'phase41-visual-diagnostic-v1',
    visual_config_payload: phase41Payload,
    visual_config_hash_input: phase41HashInput,
    renderer_snapshot: phase41Snapshot,
    phase41_resolved_profile: {
      curve: { modelVersion: 'vote-average-power-clamped-v1', exponent: 3, intensityMin: 0.06, intensityMax: 0.6 },
      lightness: 0.55,
      chroma: 0.15,
      keyLightIntensity: 1,
      direction: [0.7, 0.7, -0.14],
      flatShadingMix: 0.8,
      bloom: visualDiagnostics.bloom,
      productionVisualConfigInput: phase41HashInput,
      resolvedVisualConfigInput: phase41HashInput,
      emissionSource: 'active',
      overrideProvenance: 'none',
      diagnosticMarker: 'phase41-visual-diagnostic-v1',
      camera: visualDiagnostics.camera,
      seed: visualDiagnostics.noise.seed,
      rotation: visualDiagnostics.rotation,
    },
  }

  it('requires the resolved profile to agree with renderer-owned values', () => {
    expect(parsePhase41VisualDiagnostics(JSON.stringify(phase41), phase41.visual_config_hash_input)).toEqual(phase41)
    expect(() => parsePhase41VisualDiagnostics(JSON.stringify({
      ...phase41,
      renderer_snapshot: {
        ...phase41.renderer_snapshot,
        emission: phase41.renderer_snapshot.emission + 0.1,
      },
    }), phase41.visual_config_hash_input)).toThrow(/renderer snapshot disagrees/)
    expect(() => parsePhase41VisualDiagnostics(JSON.stringify({
      ...phase41,
      renderer_snapshot: { ...phase41.renderer_snapshot, focus: undefined },
    }), phase41.visual_config_hash_input)).toThrow(/renderer_snapshot.focus/)
    expect(() => parsePhase41VisualDiagnostics(JSON.stringify({ ...phase41, visual_config_payload: undefined }), phase41.visual_config_hash_input)).toThrow(/visual_config_payload/)
    expect(() => parsePhase41VisualDiagnostics(JSON.stringify({ ...phase41, visual_config_hash_input: '' }), '')).toThrow(/visual_config_hash_input/)
    expect(() => parsePhase41VisualDiagnostics(JSON.stringify(phase41), 'different-input')).toThrow(/dataset visual hash disagrees/)
    expect(() => parsePhase41VisualDiagnostics(JSON.stringify({
      ...phase41,
      phase41_resolved_profile: { ...phase41.phase41_resolved_profile, curve: { ...phase41.phase41_resolved_profile.curve, exponent: 2 } },
    }), phase41.visual_config_hash_input)).toThrow(/curve disagrees/)
    expect(() => parsePhase41VisualDiagnostics(JSON.stringify({
      ...phase41,
      phase41_resolved_profile: { ...phase41.phase41_resolved_profile, bloom: { ...visualDiagnostics.bloom, strength: 0 } },
    }), phase41.visual_config_hash_input)).toThrow(/Bloom disagrees/)
    const nonEmissionPayload = {
      ...phase41Payload,
      override_provenance: 'phase41-diagnostic-override',
    }
    const nonEmissionHashInput = stableFocusEmissionJson(nonEmissionPayload)
    const nonEmissionOverride = {
      ...phase41,
      override_provenance: 'phase41-diagnostic-override',
      visual_config_payload: nonEmissionPayload,
      visual_config_hash_input: nonEmissionHashInput,
      renderer_snapshot: {
        ...phase41.renderer_snapshot,
        canonicalHashInput: nonEmissionHashInput,
        overrideProvenance: 'phase41-diagnostic-override',
      },
      phase41_resolved_profile: {
        ...phase41.phase41_resolved_profile,
        productionVisualConfigInput: nonEmissionHashInput,
        resolvedVisualConfigInput: nonEmissionHashInput,
        overrideProvenance: 'phase41-diagnostic-override',
      },
    }
    expect(parsePhase41VisualDiagnostics(JSON.stringify(nonEmissionOverride), nonEmissionHashInput)).toEqual(nonEmissionOverride)
    expect(() => parsePhase41VisualDiagnostics(JSON.stringify({
      ...nonEmissionOverride,
      phase41_resolved_profile: { ...nonEmissionOverride.phase41_resolved_profile, emissionSource: 'diagnostic-override' },
    }), nonEmissionHashInput)).toThrow(/emission source disagrees/)
    const anchoredProvenance = {
      ...phase41Provenance,
      source: 'diagnostic-override',
    }
    const anchoredPayload = {
      ...phase41Payload,
      emission_profile: anchoredProvenance,
      override_provenance: 'phase41-diagnostic-override',
    }
    const anchoredHashInput = stableFocusEmissionJson(anchoredPayload)
    const anchored = {
      ...phase41,
      emission: 0.3,
      emission_curve: { model_version: 'vote-average-anchored-smoothstep-v1', rating_low_anchor: 4.5, rating_high_anchor: 8.2, intensity_min: 0.005, intensity_max: 0.65 },
      profile_provenance: anchoredProvenance,
      override_provenance: 'phase41-diagnostic-override',
      visual_config_payload: anchoredPayload,
      visual_config_hash_input: anchoredHashInput,
      renderer_snapshot: {
        ...phase41.renderer_snapshot,
        canonicalHashInput: anchoredHashInput,
        profileSource: 'diagnostic-override',
        overrideProvenance: 'phase41-diagnostic-override',
        emission: 0.3,
      },
      phase41_resolved_profile: {
        ...phase41.phase41_resolved_profile,
        curve: { modelVersion: 'vote-average-anchored-smoothstep-v1', ratingLowAnchor: 4.5, ratingHighAnchor: 8.2, intensityMin: 0.005, intensityMax: 0.65 },
        productionVisualConfigInput: anchoredHashInput,
        resolvedVisualConfigInput: anchoredHashInput,
        emissionSource: 'diagnostic-override',
        overrideProvenance: 'phase41-diagnostic-override',
      },
    }
    expect(parsePhase41VisualDiagnostics(JSON.stringify(anchored), anchoredHashInput)).toEqual(anchored)
  })
})

describe('browser render metadata', () => {
  it('SHA-256 hashes the exact page-supplied complete visual configuration and PNG', () => {
    const metadata = metadataFor(args, source, render, 'fixture-commit')
    const expected = createHash('sha256').update(visualHash).digest('hex')
    const expectedPng = createHash('sha256').update(render.png).digest('hex')

    expect(metadata.visual_config_hash).toBe(expected)
    expect(metadata.visual_config_hash).not.toBe(visualHash)
    expect(metadata.png_sha256).toBe(expectedPng)
  })

  it('persists the page-supplied renderer diagnostics without recreating visual values', () => {
    const metadata = metadataFor(args, source, render, 'fixture-commit')

    expect(metadata.visual_diagnostics).toBe(visualDiagnostics)
    expect(metadata.visual_diagnostics).toMatchObject({
      rating: 5,
      emission: 0.1275,
      emission_curve: { model_version: 'vote-average-power-clamped-v1', exponent: 3 },
      fixed_lightness: 0.55,
      fixed_chroma: 0.15,
      key_light: { intensity: 1 },
      noise: { seed: 123 },
      rotation: { base_quaternion: [0, 0, 0, 1], seeded_spin_axis_world: [0, 1, 0], revs_per_sec: 0.01 },
      camera: { projection: 'orthographic', position: [0, 0, -20] },
    })
  })

  it('records selected data and profile provenance for Daily verification', () => {
    const metadata = metadataFor(args, source, render, 'fixture-commit')

    expect(metadata).toMatchObject({
      data_version: 'fixture-v1',
      data_source: source.label,
      manifest_url: args.manifestUrl,
      profile_url: source.profileUrl,
      requested_focus_emission_profile: source.focusEmissionProfile,
    })
  })

  it('does not rebuild the visual hash from exporter bloom or render-mode arguments', () => {
    const shaderMetadata = metadataFor(args, source, render, 'fixture-commit')
    const basicMetadata = metadataFor(
      { ...args, bloom: 'off', renderMode: 'basic' },
      source,
      render,
      'fixture-commit',
    )

    expect(basicMetadata.visual_config_hash).toBe(shaderMetadata.visual_config_hash)
    expect(shaderMetadata.visual_config_hash).toBe(createHash('sha256').update(visualHash).digest('hex'))
  })
})
