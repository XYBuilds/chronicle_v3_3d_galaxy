import type { Meta, StoryObj } from '@storybook/react-vite'

import { MovieTooltipHud } from './MovieTooltip'
import { TooltipProvider } from '@/components/ui/tooltip'
import { normalizeGenreHex } from '@/lib/genreColor'
import {
  SUBSAMPLE_GENRE_PALETTE,
  subsampleMovieHappiness,
  subsampleMovieMarthasVineyard,
} from '@/storybook/fixtures/subsampleMovies'

function primaryGenreColorFromFixtures(genres: string[]): string | null {
  const g0 = genres[0]
  if (!g0) return null
  const raw = SUBSAMPLE_GENRE_PALETTE[g0]?.trim()
  if (!raw) return null
  return normalizeGenreHex(raw)
}

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
    primaryGenreLabel: subsampleMovieHappiness.genres[0] ?? null,
    primaryGenreColorHex: primaryGenreColorFromFixtures(subsampleMovieHappiness.genres),
  },
}

/** Subsample row 657018 — exercises multi-line title wrapping. */
export const LongTitle: Story = {
  args: {
    open: true,
    anchor: { x: 320, y: 240 },
    title: subsampleMovieMarthasVineyard.title,
    primaryGenreLabel: subsampleMovieMarthasVineyard.genres[0] ?? null,
    primaryGenreColorHex: primaryGenreColorFromFixtures(subsampleMovieMarthasVineyard.genres),
  },
}

export const NoPrimaryGenre: Story = {
  args: {
    open: true,
    anchor: { x: 80, y: 400 },
    title: subsampleMovieHappiness.title,
    primaryGenreLabel: null,
    primaryGenreColorHex: null,
  },
}

export const CornerAnchor: Story = {
  args: {
    open: true,
    anchor: { x: 620, y: 40 },
    title: subsampleMovieHappiness.title,
    primaryGenreLabel: subsampleMovieHappiness.genres[0] ?? null,
    primaryGenreColorHex: primaryGenreColorFromFixtures(subsampleMovieHappiness.genres),
  },
}
