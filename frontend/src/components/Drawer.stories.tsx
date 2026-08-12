import type { Meta, StoryObj } from '@storybook/react-vite'

import { MovieDetailDrawerHud } from './Drawer'
import {
  subsampleMovieHappiness,
  subsampleMovieKika,
  subsampleMovieMarthasVineyard,
  subsampleMovieParadiseRoad,
} from '@/storybook/fixtures/subsampleMovies'
import { HudCanvas } from '@/storybook/hudStoryHarness'

const meta: Meta<typeof MovieDetailDrawerHud> = {
  title: 'Drawer',
  component: MovieDetailDrawerHud,
  args: {
    hasSearchIndex: false,
    open: true,
    onOpenChange: () => undefined,
  },
  decorators: [
    (Story) => (
      <HudCanvas>
        <Story />
      </HudCanvas>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof MovieDetailDrawerHud>

export const Default: Story = {
  args: {
    movie: subsampleMovieKika,
  },
}

export const NoPoster: Story = {
  args: {
    movie: { ...subsampleMovieMarthasVineyard, poster_url: '' },
  },
}

export const BadPoster: Story = {
  args: {
    movie: {
      ...subsampleMovieKika,
      poster_url: 'https://invalid.example/poster.jpg',
    },
  },
}

export const LongCastList: Story = {
  args: {
    movie: subsampleMovieParadiseRoad,
  },
}

export const EmptyCast: Story = {
  args: {
    movie: subsampleMovieHappiness,
  },
}

export const MissingDetails: Story = {
  args: {
    movie: {
      ...subsampleMovieHappiness,
      runtime: null,
      original_language: '   ',
      budget: 0,
      revenue: 0,
    },
  },
}
