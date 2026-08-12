import type { GenreSelectSession, PersonSelectSession } from '@/lib/exploration'
import {
  subsampleMovieHappiness,
  subsampleMovieKika,
  subsampleMovieMarthasVineyard,
  subsampleMovieParadiseRoad,
} from '@/storybook/fixtures/subsampleMovies'

const MASK_CAST = 1
const MASK_CREW = 2
const MASK_PRODUCERS = 16

/** Seeded person session spanning all four subsample films so constellation chains have segments. */
export const STORYBOOK_PERSON_SELECT: PersonSelectSession = {
  relation: { kind: 'person', key: 'storybook-demo-person' },
  movieIds: [
    subsampleMovieKika.id,
    subsampleMovieParadiseRoad.id,
    subsampleMovieHappiness.id,
    subsampleMovieMarthasVineyard.id,
  ],
  metadata: {
    fullName: 'Storybook demo person',
    roleMask: MASK_CAST | MASK_CREW | MASK_PRODUCERS,
    movieRoles: {
      [String(subsampleMovieKika.id)]: MASK_CAST | MASK_PRODUCERS,
      [String(subsampleMovieParadiseRoad.id)]: MASK_CREW | MASK_PRODUCERS,
      [String(subsampleMovieHappiness.id)]: MASK_CAST | MASK_CREW,
      [String(subsampleMovieMarthasVineyard.id)]: MASK_CAST,
    },
  },
}

/** Drama is on every subsample film. */
export const STORYBOOK_GENRE_SELECT: GenreSelectSession = {
  relation: { kind: 'genre', key: 'genre:drama' },
  movieIds: [
    subsampleMovieKika.id,
    subsampleMovieParadiseRoad.id,
    subsampleMovieHappiness.id,
    subsampleMovieMarthasVineyard.id,
  ],
  conditions: {
    operator: 'and',
    genres: ['Drama'],
  },
}

export type VisualGateSessionKind = 'idle' | 'person' | 'genre'
