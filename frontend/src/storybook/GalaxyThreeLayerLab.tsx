import { lazy, Suspense } from 'react'

import { GalaxyThreeLayerLabCore, type GalaxyThreeLayerLabProps } from './GalaxyThreeLayerLabCore'

export type { GalaxyThreeLayerLabProps } from './GalaxyThreeLayerLabCore'

const GalaxyThreeLayerLabLevaHost = import.meta.env.DEV
  ? lazy(() =>
      import('./GalaxyThreeLayerLabLevaHost').then((m) => ({ default: m.GalaxyThreeLayerLabLevaHost })),
    )
  : null

/**
 * Storybook lab: production scene mount. In Vite/Storybook **dev**, a Leva panel (`import.meta.env.DEV`) drives the same knobs as the former Controls; production `build-storybook` uses Story args only.
 */
export function GalaxyThreeLayerLab(props: GalaxyThreeLayerLabProps) {
  if (import.meta.env.DEV && GalaxyThreeLayerLabLevaHost) {
    return (
      <Suspense
        fallback={
          <div className="relative h-full w-full">
            <GalaxyThreeLayerLabCore {...props} />
          </div>
        }
      >
        <GalaxyThreeLayerLabLevaHost {...props} />
      </Suspense>
    )
  }
  return <GalaxyThreeLayerLabCore {...props} />
}
