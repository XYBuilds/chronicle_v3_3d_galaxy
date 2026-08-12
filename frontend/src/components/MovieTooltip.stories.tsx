import type { Meta, StoryObj } from '@storybook/react-vite'

import { MovieTooltipHud } from './MovieTooltip'
import { TooltipProvider } from '@/components/ui/tooltip'
import { normalizeGenreHex } from '@/lib/genreColor'
import {
  SUBSAMPLE_GENRE_PALETTE,
  subsampleMovieHappiness,
  subsampleMovieMarthasVineyard,
} from '@/storybook/fixtures/subsampleMovies'
import { HudCanvas } from '@/storybook/hudStoryHarness'

function primaryGenreColorFromFixtures(genres: string[]): string | null {
  const g0 = genres[0]
  if (!g0) return null
  const raw = SUBSAMPLE_GENRE_PALETTE[g0]?.trim()
  if (!raw) return null
  return normalizeGenreHex(raw)
}

const meta: Meta<typeof MovieTooltipHud> = {
  title: 'Hover/MovieTooltip',
  component: MovieTooltipHud,
  decorators: [
    (Story) => (
      <HudCanvas>
        <TooltipProvider delay={0}>
          <Story />
        </TooltipProvider>
      </HudCanvas>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof MovieTooltipHud>

export const Default: Story = {
  args: {
    open: true,
    anchor: { x: 420, y: 280 },
    title: subsampleMovieHappiness.title,
    primaryGenreLabel: subsampleMovieHappiness.genres[0] ?? null,
    primaryGenreColorHex: primaryGenreColorFromFixtures(subsampleMovieHappiness.genres),
  },
}

export const LongTitle: Story = {
  args: {
    open: true,
    anchor: { x: 420, y: 280 },
    title: subsampleMovieMarthasVineyard.title,
    primaryGenreLabel: subsampleMovieMarthasVineyard.genres[0] ?? null,
    primaryGenreColorHex: primaryGenreColorFromFixtures(subsampleMovieMarthasVineyard.genres),
  },
}

export const NoPrimaryGenre: Story = {
  args: {
    open: true,
    anchor: { x: 160, y: 520 },
    title: subsampleMovieHappiness.title,
    primaryGenreLabel: null,
    primaryGenreColorHex: null,
  },
}
