import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { MovieDetailDrawerHud } from './Drawer'
import type { Movie } from '@/types/galaxy'
import {
  subsampleMovieHappiness,
  subsampleMovieKika,
  subsampleMovieMarthasVineyard,
  subsampleMovieParadiseRoad,
} from '@/storybook/fixtures/subsampleMovies'

const meta: Meta<typeof MovieDetailDrawerHud> = {
  title: 'Drawer',
  component: MovieDetailDrawerHud,
  args: {
    hasSearchIndex: false,
  },
  decorators: [
    (Story) => (
      <div className="relative h-[720px] w-full min-w-[900px] bg-neutral-950 text-foreground">
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof MovieDetailDrawerHud>

export const Default: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: subsampleMovieKika,
  },
}

/** Subsample row 657018 — empty tagline in CSV. */
export const NoTagline: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: subsampleMovieMarthasVineyard,
  },
}

export const NoPoster: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: { ...subsampleMovieMarthasVineyard, poster_url: '' },
  },
}

/** Subsample `Paradise Road` — long cast list from CSV. */
export const LongCastList: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: subsampleMovieParadiseRoad,
  },
}

/** Subsample `Happiness` — empty cast in source CSV. */
export const EmptyCast: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: subsampleMovieHappiness,
  },
}

/** Interactive: toggle sheet to verify open/close wiring in isolation. */
export const Toggle: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true)
    const movie: Movie = subsampleMovieMarthasVineyard
    return (
      <div className="flex flex-col items-start gap-4 p-6">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close drawer' : 'Open drawer'}
        </button>
        <MovieDetailDrawerHud open={open} onOpenChange={setOpen} movie={movie} />
      </div>
    )
  },
}

// --- P14.6 Details: four groups, `/` placeholders, group 4 rules ---

/** Group 1: runtime + language missing → both values `/`. Group 4 hidden (0/0 budget). */
export const DetailsP14_Group1Slashes_Group4Hidden: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: {
      ...subsampleMovieHappiness,
      runtime: null,
      original_language: '   ',
      budget: 0,
      revenue: 0,
    },
  },
}

/** Group 1: runtime `0` must show `0 min`, not `/`. */
export const DetailsP14_RuntimeZero: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: { ...subsampleMovieHappiness, runtime: 0 },
  },
}

/** Group 4: budget 0 → `/`, revenue positive → currency (Kika fixture). */
export const DetailsP14_Group4BudgetSlash: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: subsampleMovieKika,
  },
}

/** Group 2: only writers (no director / producers) — odd cell wraps in `grid-cols-2`. */
export const DetailsP14_Group2WritersOnly: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: {
      ...subsampleMovieHappiness,
      director: [],
      producers: [],
      writers: ['Solo Writer'],
    },
  },
}

/** Group 2 full + group 3 present — many detail cells (Paradise Road). */
export const DetailsP14_FullCreditsGrid: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: subsampleMovieParadiseRoad,
  },
}
