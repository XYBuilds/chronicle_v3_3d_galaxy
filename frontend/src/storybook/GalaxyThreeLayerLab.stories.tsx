import type { Meta, StoryObj } from '@storybook/react-vite'

import { SUBSAMPLE_GALAXY_META, SUBSAMPLE_LAB_MOVIES, subsampleMovieMarthasVineyard } from '@/storybook/fixtures/subsampleMovies'

import { GalaxyThreeLayerLab } from './GalaxyThreeLayerLab'

/** Same as `SUBSAMPLE_GALAXY_META.z_range` — Storybook slider + camera wheel Z clamp. */
const Z_CONTROL_LO = SUBSAMPLE_GALAXY_META.z_range[0]!
const Z_CONTROL_HI = SUBSAMPLE_GALAXY_META.z_range[1]!
/** Default near the lab movie’s release (~2020). */
const zCurrentDefault = 2020

const meta = {
  title: 'Dev/Galaxy three-layer lab',
  component: GalaxyThreeLayerLab,
  decorators: [
    (Story) => (
      <div className="relative box-border h-[min(85vh,820px)] w-full min-w-[640px] bg-neutral-950 p-2">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    controls: {
      exclude: ['meta', 'movies'],
    },
    docs: {
      description: {
        component:
          'Mounts the production `mountGalaxyScene` with a single subsample point. Use Controls to tune Z slab (A/B split), point sizing, Bloom, and Perlin planet uniforms. Selection uses the real fly-to animation.',
      },
    },
  },
  argTypes: {
    zCurrent: { control: { type: 'range', min: Z_CONTROL_LO, max: Z_CONTROL_HI, step: 0.02 } },
    zVisWindow: { control: { type: 'range', min: 0.05, max: 8, step: 0.05 } },
    uBgPointSizePx: { control: { type: 'range', min: 0.5, max: 8, step: 0.05 } },
    uSizeScale: { control: { type: 'range', min: 0.05, max: 1.2, step: 0.01 } },
    bloomStrength: { control: { type: 'range', min: 0, max: 2.5, step: 0.02 } },
    bloomRadius: { control: { type: 'range', min: 0, max: 1.5, step: 0.01 } },
    bloomThreshold: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    selectedMovieId: { control: 'select', options: [null, ...SUBSAMPLE_LAB_MOVIES.map((m) => m.id)] },
    planetUScale: { control: { type: 'range', min: 0.5, max: 6, step: 0.05 } },
    planetOctaves: { control: { type: 'range', min: 1, max: 8, step: 1 } },
    planetPersistence: { control: { type: 'range', min: 0.08, max: 0.98, step: 0.01 } },
    planetThreshold: { control: { type: 'range', min: 0.002, max: 0.2, step: 0.002 } },
  },
  args: {
    meta: SUBSAMPLE_GALAXY_META,
    movies: SUBSAMPLE_LAB_MOVIES,
    zCurrent: zCurrentDefault,
    zVisWindow: 1,
    uBgPointSizePx: 2.25,
    uSizeScale: 0.3,
    bloomStrength: 0.95,
    bloomRadius: 0.52,
    bloomThreshold: 0.82,
    selectedMovieId: null,
    planetUScale: 2.35,
    planetOctaves: 4,
    planetPersistence: 0.52,
    planetThreshold: 0.048,
  },
} satisfies Meta<typeof GalaxyThreeLayerLab>

export default meta

type Story = StoryObj<typeof GalaxyThreeLayerLab>

export const PointsAndBloom: Story = {}

/** Pre-select a movie so the Perlin planet is visible after the fly-to (~0.7s). */
export const WithSelectedPlanet: Story = {
  args: {
    selectedMovieId: subsampleMovieMarthasVineyard.id,
  },
}
