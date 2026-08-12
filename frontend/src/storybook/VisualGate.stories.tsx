import type { Meta, StoryObj } from '@storybook/react-vite'

import { SUBSAMPLE_GALAXY_META, subsampleMovieMarthasVineyard } from '@/storybook/fixtures/subsampleMovies'
import { VisualGate } from './VisualGate'
import { visualGateArgTypes, visualGateDefaultArgs } from '@/storybook/visualGateControls'

/** Four-film lab is sparse vs production 60k; enlarge points so idle/select states are reviewable. */
const LAB_FIELD = {
  zCurrent: SUBSAMPLE_GALAXY_META.z_range[0]! + 0.5,
  zVisWindow: 40,
  uBgSizeMul: 0.08,
  uActiveSizeMul: 0.08,
} as const

const meta = {
  title: 'Visual Gate',
  component: VisualGate,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Subsample Three.js lab. Default knobs match production scene mount (zVisWindow 0.5, planet bloom on at threshold 10, UnrealBloomPass off). Controls are grouped by scene object. Desktop only — use lab-desktop. Idle/select stories enlarge the four-film field so it is visible; FocusedPlanet keeps production scale.',
      },
    },
  },
  globals: {
    viewport: { value: 'lab-desktop', isRotated: false },
  },
  argTypes: visualGateArgTypes,
  args: visualGateDefaultArgs,
} satisfies Meta<typeof VisualGate>

export default meta

type Story = StoryObj<typeof VisualGate>

export const IdleField: Story = {
  args: {
    ...LAB_FIELD,
  },
}

export const FocusedPlanet: Story = {
  args: {
    focusMovieId: subsampleMovieMarthasVineyard.id,
    zCurrent: subsampleMovieMarthasVineyard.z,
  },
}

export const PersonSelect: Story = {
  args: {
    ...LAB_FIELD,
    sessionKind: 'person',
    constellationChainOpacity: 0.2,
  },
}

export const GenreSelect: Story = {
  args: {
    ...LAB_FIELD,
    sessionKind: 'genre',
  },
}

export const FocusNeighborhood: Story = {
  args: {
    focusMovieId: subsampleMovieMarthasVineyard.id,
    zCurrent: subsampleMovieMarthasVineyard.z,
    focusNeighborRadius: 30,
  },
}
