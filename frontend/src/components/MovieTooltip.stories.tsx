import type { Meta, StoryObj } from '@storybook/react-vite'

import { MovieTooltipHud } from './MovieTooltip'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  SUBSAMPLE_GENRE_PALETTE,
  subsampleMovieHappiness,
  subsampleMovieMarthasVineyard,
} from '@/storybook/fixtures/subsampleMovies'

const meta: Meta<typeof MovieTooltipHud> = {
  title: 'MovieTooltip',
  component: MovieTooltipHud,
  decorators: [
    (Story) => (
      <TooltipProvider delay={0}>
        <div className="relative h-[480px] w-full min-w-[640px] bg-neutral-950">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof MovieTooltipHud>

export const Default: Story = {
  args: {
    open: true,
    anchor: { x: 320, y: 240 },
    title: subsampleMovieHappiness.title,
    genres: subsampleMovieHappiness.genres,
    genrePalette: SUBSAMPLE_GENRE_PALETTE,
  },
}

/** Subsample row 657018 — exercises multi-line title wrapping. */
export const LongTitle: Story = {
  args: {
    open: true,
    anchor: { x: 320, y: 240 },
    title: subsampleMovieMarthasVineyard.title,
    genres: subsampleMovieMarthasVineyard.genres,
    genrePalette: SUBSAMPLE_GENRE_PALETTE,
  },
}

export const NoGenres: Story = {
  args: {
    open: true,
    anchor: { x: 80, y: 400 },
    title: subsampleMovieHappiness.title,
    genres: [],
    genrePalette: SUBSAMPLE_GENRE_PALETTE,
  },
}

export const CornerAnchor: Story = {
  args: {
    open: true,
    anchor: { x: 620, y: 40 },
    title: subsampleMovieHappiness.title,
    genres: subsampleMovieHappiness.genres,
    genrePalette: SUBSAMPLE_GENRE_PALETTE,
  },
}
