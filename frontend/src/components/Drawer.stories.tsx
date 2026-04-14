import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { MovieDetailDrawerHud } from './Drawer'
import type { Movie } from '@/types/galaxy'

function makeMockMovie(overrides: Partial<Movie> = {}): Movie {
  const base: Movie = {
    x: 0.12,
    y: -0.34,
    z: 2010.42,
    size: 8.2,
    emissive: 0.72,
    genre_color: [0.72, 0.58, 0.22],
    title: 'Subsistence',
    original_title: 'Subsistence',
    overview:
      'A research crew at a remote station discovers that their survival models no longer match reality. As supplies dwindle, they must decide which truths are worth keeping.',
    tagline: 'The map is not the territory.',
    release_date: '2010-07-16',
    genres: ['Science Fiction', 'Thriller', 'Drama'],
    original_language: 'en',
    vote_count: 18432,
    vote_average: 7.8,
    popularity: 42.1,
    imdb_rating: 7.6,
    imdb_votes: 120_003,
    runtime: 118,
    revenue: 88_200_000,
    budget: 32_000_000,
    production_countries: ['United States of America', 'Canada'],
    production_companies: ['Northwind Pictures', 'Arcadia Labs'],
    spoken_languages: ['English', 'French'],
    cast: [
      'Elena Park',
      'Marcus Reid',
      'Sofia Alvarez',
      'Jonas Meier',
      'Amara Okafor',
      'Theo Lindberg',
      'Hannah Cho',
      'Diego Romero',
    ],
    director: ['Iris Okonkwo'],
    writers: ['Iris Okonkwo', 'Noah Feldman'],
    producers: ['Morgan Tate', 'Priya Desai'],
    director_of_photography: ['Luis Ortega'],
    music_composer: ['Yuki Tanaka'],
    poster_url: 'https://image.tmdb.org/t/p/w500/wwemzWs387getahqv6q49oqPlii.jpg',
    id: 603,
    imdb_id: 'tt0133093',
  }
  return { ...base, ...overrides }
}

const meta: Meta<typeof MovieDetailDrawerHud> = {
  title: 'HUD/MovieDetailDrawer',
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
    movie: makeMockMovie(),
  },
}

export const NoTagline: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: makeMockMovie({ tagline: null }),
  },
}

export const NoPoster: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: makeMockMovie({ poster_url: '' }),
  },
}

export const LongCastList: Story = {
  args: {
    open: true,
    onOpenChange: () => undefined,
    movie: makeMockMovie({
      title: 'Ensemble Night',
      cast: Array.from({ length: 28 }, (_, i) => `Actor ${String(i + 1).padStart(2, '0')} — long credit name`),
    }),
  },
}

/** Interactive: toggle sheet to verify open/close wiring in isolation. */
export const Toggle: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true)
    const movie = makeMockMovie()
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
