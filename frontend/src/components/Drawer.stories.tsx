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
