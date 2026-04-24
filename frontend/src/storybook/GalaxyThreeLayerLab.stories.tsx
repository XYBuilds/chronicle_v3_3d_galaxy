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
          'Mounts the production `mountGalaxyScene` with a single subsample point. In **dev** (`npm run storybook`), a **Leva** panel (P7.3 I2) drives the same uniforms; Storybook Controls still push initial/sync values when you change args. Production `build-storybook` uses args only (no Leva bundle path). Selection uses the real fly-to + visibility hard-cuts (P6.2.2).',
      },
    },
  },
  argTypes: {
    zCurrent: { control: { type: 'range', min: Z_CONTROL_LO, max: Z_CONTROL_HI, step: 0.02 } },
    zVisWindow: { control: { type: 'range', min: 0.05, max: 8, step: 0.05 } },
    uFocusSizeMul: { control: { type: 'range', min: 0.2, max: 2, step: 0.02 } },
    uBgSizeMul: { control: { type: 'range', min: 0.1, max: 1.5, step: 0.02 } },
    uLMin: { control: { type: 'range', min: 0.05, max: 0.6, step: 0.01 } },
    uLMax: { control: { type: 'range', min: 0.4, max: 0.99, step: 0.01 } },
    uChroma: { control: { type: 'range', min: 0.02, max: 0.35, step: 0.01 } },
    uSizeScale: { control: { type: 'range', min: 0.05, max: 1.2, step: 0.01 } },
    postProcessBloom: { control: 'boolean' },
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
    uFocusSizeMul: 1.0,
    uBgSizeMul: 0.4,
    uLMin: 0.4,
    uLMax: 0.85,
    uChroma: 0.15,
    uSizeScale: 0.3,
    postProcessBloom: false,
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

export const PointsAndBloom: Story = {
  args: {
    postProcessBloom: true,
  },
}

/** Pre-select a movie so the Perlin planet is visible after the fly-to (~0.7s). */
export const WithSelectedPlanet: Story = {
  args: {
    selectedMovieId: subsampleMovieMarthasVineyard.id,
  },
}
