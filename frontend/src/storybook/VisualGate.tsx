import { GalaxyThreeLayerLabCore } from './GalaxyThreeLayerLabCore'
import { SUBSAMPLE_GALAXY_META, SUBSAMPLE_LAB_MOVIES } from '@/storybook/fixtures/subsampleMovies'
import type { VisualGateProps } from '@/storybook/visualGateControls'

export type { VisualGateProps } from '@/storybook/visualGateControls'

/** Args-driven subsample lab. Controls are grouped in the Storybook panel, not Leva. */
export function VisualGate(props: VisualGateProps) {
  return (
    <div className="h-dvh w-full bg-black">
      <GalaxyThreeLayerLabCore meta={SUBSAMPLE_GALAXY_META} movies={SUBSAMPLE_LAB_MOVIES} {...props} />
    </div>
  )
}
