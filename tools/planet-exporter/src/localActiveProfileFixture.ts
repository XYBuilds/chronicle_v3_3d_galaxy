import { createHash } from 'node:crypto'

import {
  generateRatingMidrankCdfLutProfile,
  profileCurveHashInput,
  serializeProductionRatingEmissionProfile,
  type ProductionRatingEmissionProfile,
} from '../../../frontend/src/three/focusEmission.js'
import type { ActiveProfilePointer } from './data-source.js'

const LOCAL_PROFILE_ID = 'planet-export-fixture-2026-08-a'
const LOCAL_PROFILE_PERIOD = '2026-08'
const LOCAL_PROFILE_ACTIVATED_AT = '2026-08-01T00:00:00.000Z'

export type LocalActiveProfileFixture = {
  profile: ProductionRatingEmissionProfile
  pointer: ActiveProfilePointer
  bytes: Buffer
}

function curveSha256(profile: ProductionRatingEmissionProfile): string {
  return createHash('sha256').update(profileCurveHashInput(profile)).digest('hex')
}

export function createLocalActiveProfileFixture(): LocalActiveProfileFixture {
  const curve = generateRatingMidrankCdfLutProfile([7])
  const unsignedProfile: ProductionRatingEmissionProfile = {
    schema_version: 'rating-emission-profile-v1',
    profile_id: LOCAL_PROFILE_ID,
    period: LOCAL_PROFILE_PERIOD,
    model_version: curve.modelVersion,
    method: 'midrank-cdf-linear-lut-v1',
    rating_domain: { min: curve.ratingMin, max: curve.ratingMax },
    sample_step: curve.sampleStep,
    samples: curve.samples,
    emission_endpoints: { min: curve.intensityMin, max: curve.intensityMax },
    source_data_version: 'planet-export-fixture-v1',
    source_data_sha256: '0000000000000000000000000000000000000000000000000000000000000000',
    source_movie_count: 1,
    source_threshold_version: 'planet-export-fixture-v1',
    curve_sha256: '0000000000000000000000000000000000000000000000000000000000000000',
    generated_at: LOCAL_PROFILE_ACTIVATED_AT,
    git_commit: 'f17e0000000',
  }
  const profile: ProductionRatingEmissionProfile = {
    ...unsignedProfile,
    curve_sha256: curveSha256(unsignedProfile),
  }
  const pointer: ActiveProfilePointer = {
    profile_id: profile.profile_id,
    period: profile.period,
    model_version: profile.model_version,
    curve_sha256: profile.curve_sha256,
    source_data_version: profile.source_data_version,
    source_movie_count: profile.source_movie_count,
    status: 'active',
    activated_at: LOCAL_PROFILE_ACTIVATED_AT,
  }

  return {
    profile,
    pointer,
    bytes: Buffer.from(serializeProductionRatingEmissionProfile(profile), 'utf8'),
  }
}