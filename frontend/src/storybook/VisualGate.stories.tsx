import type { Meta, StoryObj } from '@storybook/react-vite'

import { SUBSAMPLE_GALAXY_META, SUBSAMPLE_LAB_MOVIES, subsampleMovieMarthasVineyard } from '@/storybook/fixtures/subsampleMovies'

import { VisualGate } from './VisualGate'
import { DEFAULT_GALAXY_U_SIZE_SCALE } from '@/three/galaxyUniformDefaults'

const Z_CONTROL_LO = SUBSAMPLE_GALAXY_META.z_range[0]!
const Z_CONTROL_HI = SUBSAMPLE_GALAXY_META.z_range[1]!

const meta = {
  title: 'Visual Gate',
  component: VisualGate,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Curated subsample lab for visual acceptance. Controls are the eight Variant B knobs only — not the former Leva surface. Narrow HUD viewports are layout evidence, not mobile WebGL support; use lab-desktop here.',
      },
    },
  },
  globals: {
    viewport: { value: 'lab-desktop', isRotated: false },
  },
  argTypes: {
    zCurrent: { control: { type: 'range', min: Z_CONTROL_LO, max: Z_CONTROL_HI, step: 0.02 } },
    zVisWindow: { control: { type: 'range', min: 0.05, max: 8, step: 0.05 } },
    uSizeScale: { control: { type: 'range', min: 0.05, max: 1.2, step: 0.01 } },
    uChroma: { control: { type: 'range', min: 0.02, max: 0.35, step: 0.01 } },
    focusMovieId: { control: 'select', options: [null, ...SUBSAMPLE_LAB_MOVIES.map((m) => m.id)] },
    planetAreaRatio: { control: { type: 'range', min: 0.15, max: 1.2, step: 0.005 } },
    postProcessBloom: { control: 'boolean' },
    bloomStrength: { control: { type: 'range', min: 0, max: 2.5, step: 0.02 } },
  },
  args: {
    zCurrent: 2020,
    zVisWindow: 1,
    uSizeScale: DEFAULT_GALAXY_U_SIZE_SCALE,
    uChroma: 0.18,
    focusMovieId: null,
    planetAreaRatio: 1 / ((1 + Math.sqrt(5)) / 2),
    postProcessBloom: false,
    bloomStrength: 0.95,
  },
} satisfies Meta<typeof VisualGate>

export default meta

type Story = StoryObj<typeof VisualGate>

export const IdleParticles: Story = {}

export const FocusedPlanet: Story = {
  args: {
    focusMovieId: subsampleMovieMarthasVineyard.id,
  },
}

export const FocusedBloomDebug: Story = {
  args: {
    focusMovieId: subsampleMovieMarthasVineyard.id,
    postProcessBloom: true,
  },
}
