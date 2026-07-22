import { createHash } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  RATING_MIDRANK_CDF_LUT_INTENSITY_MAX,
  RATING_MIDRANK_CDF_LUT_INTENSITY_MIN,
  RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
  RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT,
  RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
  createActiveFocusEmissionProfilePointer,
  profileCurveHashInput,
  type ProductionRatingEmissionProfile,
} from '@/three/focusEmission'
import type { GalaxyAssetsManifest } from '@/lib/galaxyAssetUrls'
import {
  loadFocusEmissionProfile,
  resetFocusEmissionProfileLoaderCacheForTests,
} from './focusEmissionProfileLoader'

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex')

function profile(): ProductionRatingEmissionProfile {
  const result = {
    schema_version: 'rating-emission-profile-v1',
    profile_id: 'rating-emission-2026-07-a',
    period: '2026-07',
    model_version: RATING_MIDRANK_CDF_LUT_MODEL_VERSION,
    method: 'midrank-cdf-linear-lut-v1',
    rating_domain: { min: 0, max: 10 },
    sample_step: RATING_MIDRANK_CDF_LUT_SAMPLE_STEP,
    samples: Array.from({ length: RATING_MIDRANK_CDF_LUT_SAMPLE_COUNT }, (_, index) => 0.005 + index / 200 * 0.645),
    emission_endpoints: { min: RATING_MIDRANK_CDF_LUT_INTENSITY_MIN, max: RATING_MIDRANK_CDF_LUT_INTENSITY_MAX },
    source_data_version: '2026.07.monthly.1',
    source_data_sha256: 'a'.repeat(64),
    source_movie_count: 61531,
    source_threshold_version: 'dynamic-vote-count-v1',
    curve_sha256: '0'.repeat(64),
    generated_at: '2026-07-22T00:00:00.000Z',
    git_commit: '0123456789abcdef',
  } as ProductionRatingEmissionProfile
  return { ...result, curve_sha256: sha256(profileCurveHashInput(result)) }
}

function manifestFor(value: ProductionRatingEmissionProfile = profile()): GalaxyAssetsManifest {
  return {
    galaxy_data_gzip_url: 'https://example.test/galaxy.json.gz',
    data_version: value.source_data_version,
    focus_emission_profile: createActiveFocusEmissionProfilePointer(value, '2026-07-22T01:00:00.000Z', sha256),
  }
}

afterEach(() => resetFocusEmissionProfileLoaderCacheForTests())

describe('Focus emission runtime profile loader', () => {
  it('validates an active controlled artifact once and caches it across selections', async () => {
    const value = profile()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(value), { status: 200 })) as unknown as typeof fetch
    const first = await loadFocusEmissionProfile({ manifest: manifestFor(value), fetchImpl, sha256: async (input) => sha256(input), log: vi.fn() })
    const second = await loadFocusEmissionProfile({ manifest: manifestFor(value), fetchImpl, sha256: async (input) => sha256(input), log: vi.fn() })

    expect(first.source).toBe('active')
    expect(first.provenance).toMatchObject({ profile_id: value.profile_id, curve_sha256: value.curve_sha256 })
    expect(second.lut.samples).toEqual(first.lut.samples)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })


  it('does not reuse a URL cache entry when the trusted pointer identity changes', async () => {
    const value = profile()
    const changedPointer = {
      ...manifestFor(value).focus_emission_profile!,
      source_data_version: '2026.07.monthly.2',
    }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(value), { status: 200 })) as unknown as typeof fetch
    await loadFocusEmissionProfile({ manifest: manifestFor(value), profileUrl: 'https://example.test/data/focus-emission-profiles/rating-emission-2026-07-a.json', fetchImpl, sha256: async (input) => sha256(input) })
    await expect(loadFocusEmissionProfile({
      manifest: { ...manifestFor(value), focus_emission_profile: changedPointer },
      profileUrl: 'https://example.test/data/focus-emission-profiles/rating-emission-2026-07-a.json',
      fetchImpl,
      sha256: async (input) => sha256(input),
    })).rejects.toThrow(/pointer/)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('removes a failed active cache promise so the same trusted pointer can retry', async () => {
    const value = profile()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('not json', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(value), { status: 200 })) as unknown as typeof fetch
    const options = { manifest: manifestFor(value), fetchImpl, sha256: async (input: string) => sha256(input) }
    await expect(loadFocusEmissionProfile(options)).rejects.toThrow()
    await expect(loadFocusEmissionProfile(options)).resolves.toMatchObject({ source: 'active' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not let an old rejected request delete a newer same-key cache entry', async () => {
    const value = profile()
    let rejectOld: ((error: Error) => void) | undefined
    let resolveRetry: ((response: Response) => void) | undefined
    const fetchImpl = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { rejectOld = reject }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRetry = resolve }))
      .mockResolvedValueOnce(new Response(JSON.stringify(value), { status: 200 })) as unknown as typeof fetch
    const options = { manifest: manifestFor(value), fetchImpl, sha256: async (input: string) => sha256(input) }

    const oldRequest = loadFocusEmissionProfile(options)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    // Test-only cache isolation simulates a retry replacing the same trusted key while
    // the original request is still in flight. The old rejection cleanup runs afterward.
    resetFocusEmissionProfileLoaderCacheForTests()
    const retry = loadFocusEmissionProfile(options)
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    rejectOld?.(new Error('temporary fetch failure'))
    await expect(oldRequest).rejects.toThrow(/temporary fetch failure/)

    const joinedRetry = loadFocusEmissionProfile(options)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    resolveRetry?.(new Response(JSON.stringify(value), { status: 200 }))
    await expect(Promise.all([retry, joinedRetry])).resolves.toEqual([
      expect.objectContaining({ source: 'active' }),
      expect.objectContaining({ source: 'active' }),
    ])
  })

  it('requires explicit legacy fallback for a manifest without a profile', async () => {
    const manifest: GalaxyAssetsManifest = { galaxy_data_gzip_url: 'fixture.json.gz', data_version: 'fixture-v1' }
    await expect(loadFocusEmissionProfile({ manifest, allowLegacyFallback: false })).rejects.toThrow(/legacy fallback/)
    await expect(loadFocusEmissionProfile({ manifest, allowLegacyFallback: true })).resolves.toMatchObject({ source: 'legacy-fallback' })
  })

  it('never treats a declared invalid pointer as an absent legacy-compatible manifest field', async () => {
    const manifest = {
      galaxy_data_gzip_url: 'fixture.json.gz',
      data_version: 'fixture-v1',
      focus_emission_profile: { status: 'active' },
    } as unknown as GalaxyAssetsManifest
    await expect(loadFocusEmissionProfile({ manifest, allowLegacyFallback: true })).rejects.toThrow(/trusted contract/)
  })
  it.each([
    ['hash mismatch', (value: ProductionRatingEmissionProfile) => ({ ...value, curve_sha256: 'b'.repeat(64) })],
    ['pointer mismatch', (value: ProductionRatingEmissionProfile) => ({ ...manifestFor(value), focus_emission_profile: { ...manifestFor(value).focus_emission_profile!, profile_id: 'rating-emission-2026-07-b' } })],
  ])('fails closed for active %s', async (_label, makeInvalid) => {
    const value = profile()
    const invalid = makeInvalid(value)
    const manifest = 'focus_emission_profile' in invalid ? invalid as GalaxyAssetsManifest : manifestFor(value)
    const body = 'curve_sha256' in invalid ? invalid : value
    await expect(loadFocusEmissionProfile({
      manifest,
      fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 }),
      sha256: async (input) => sha256(input),
    })).rejects.toThrow()
  })

  it('rejects userinfo in an explicit exporter profile URL before fetch', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await expect(loadFocusEmissionProfile({
      manifest: manifestFor(),
      profileUrl: 'https://user:password@example.test/data/focus-emission-profiles/rating-emission-2026-07-a.json',
      fetchImpl,
    })).rejects.toThrow(/controlled immutable resource contract/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})