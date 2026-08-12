import { GalaxyThreeLayerLabCore, type GalaxyThreeLayerLabProps } from './GalaxyThreeLayerLabCore'
import { SUBSAMPLE_GALAXY_META, SUBSAMPLE_LAB_MOVIES } from '@/storybook/fixtures/subsampleMovies'
import { DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL } from '@/three/galaxyUniformDefaults'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'

type VisualGateProps = {
  zCurrent: number
  zVisWindow: number
  uSizeScale: number
  uChroma: number
  focusMovieId: number | null
  planetAreaRatio: number
  postProcessBloom: boolean
  bloomStrength: number
}

const VISUAL_GATE_FIXED: Omit<GalaxyThreeLayerLabProps, keyof VisualGateProps> = {
  meta: SUBSAMPLE_GALAXY_META,
  movies: SUBSAMPLE_LAB_MOVIES,
  uActiveSizeMul: DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL,
  uBgSizeMul: 0.001,
  uLMin: 0.3,
  uLMax: 1.0,
  uHighRatingT: 0.85,
  uHighTierTRangeScale: 0.4,
  uLightnessRatingExponent: 3.0,
  uZCamDistance: 30,
  uDistanceLightnessFloor: 0.5,
  uFocusDimChroma: 1.0,
  uFocusDimL: 1,
  uFocusDimMode: 0,
  bloomRadius: 0.52,
  bloomThreshold: 0.82,
  planetUScale: PLANET_VISUAL_DEFAULTS.noise.scale,
  planetOctaves: PLANET_VISUAL_DEFAULTS.noise.octaves,
  planetPersistence: PLANET_VISUAL_DEFAULTS.noise.persistence,
  planetStepHeight: PLANET_VISUAL_DEFAULTS.bands.stepHeight,
  planetStepSmoothness: PLANET_VISUAL_DEFAULTS.bands.stepSmoothness,
}

/** Args-only subsample lab mount. Production uniforms stay on Core; Controls expose eight knobs. */
export function VisualGate(props: VisualGateProps) {
  return (
    <div className="h-dvh w-full bg-black">
      <GalaxyThreeLayerLabCore {...VISUAL_GATE_FIXED} {...props} />
    </div>
  )
}
