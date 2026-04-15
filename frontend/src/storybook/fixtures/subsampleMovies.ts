/**
 * HUD / Storybook fixtures built from `data/subsample/tmdb2025_random20.csv`
 * (TMDB id 657018, 77223, 8223, 489533). Galaxy fields (x, y, z, size, emissive,
 * genre_color) are synthetic placeholders for UI previews only.
 */
import type { Movie } from '@/types/galaxy'

export function releaseDateToDecimalYear(iso: string): number {
  const parts = iso.split('-').map(Number)
  const y = parts[0]!
  const m = parts[1]!
  const d = parts[2]!
  const t0 = Date.UTC(y, 0, 1)
  const t1 = Date.UTC(y + 1, 0, 1)
  const t = Date.UTC(y, m - 1, d)
  const span = t1 - t0
  const out = y + (t - t0) / span
  assert(Number.isFinite(out), `decimal year for ${iso}`)
  return out
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`[subsampleMovies] ${msg}`)
}

function splitCommaList(raw: string | undefined | null): string[] {
  if (raw == null || raw.trim() === '') return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const MARTHA_CAST =
  'Chelsea Hobbs, Michael Ryan, Brenda Crichlow, Kendall Cross, Sunita Prasad, Bradley Stryker, Houston Stevenson, Teisha Rae Robinson, Eric Keenleyside, Jesse Metcalfe, Jaycie Dotin, Andrew Moxham, Keenan Tracey, Chris Wood, Yolanda Corbett, Barry W. Levy, Caleb Marshall, Christine Willes, Jess Brown, Denis Corbett, Mark Brandon, Sarah Lind, Janet Kidder, Naika Toussaint'

const PARADISE_CAST =
  'Jennifer Ehle, Alwine Seinen, Frances McDormand, Susie Porter, Cate Blanchett, Nicholas Hammond, Elizabeth Spriggs, Wendy Hughes, Julianna Margulies, Aden Young, Lia Scallon, Penne Hackforth-Jones, Robert Grubb, Vincent Ball, Pamela Rabe, Clyde Kusatsu, Arthur Dignam, Glenn Close, Lisa Hensley, Mitsu Sato, Pauline Collins, Noel Ferrier, Yoshi Adachi, Tanya Bird, Johanna ter Steege, Steven Grives, Pauline Chan, Anita Hegh, Marijke Mann, Paul Bishop, John Proper, David Chung, Stan Egi, Stephen O\'Rourke, Kitty Clignett, Sab Shimono, Marta Dusseldorp, Tessa Humphries, Shira van Essen, Taka Nagano'

const KIKA_CAST =
  'Santiago Lajusticia, Claudia Aros, Victoria Abril, Rossy de Palma, Peter Coyote, Blanca Li, Manuel Bandera, Charo López, Verónica Forqué, Francisca Caballero, Mónica Bardem, Joaquín Climent, Anabel Alonso, Bibiana Fernández, Karra Elejalde, Agustín Almodóvar, Àlex Casanovas, Jesús Bonilla'

function galaxyPlaceholders(seed: number, voteAverage: number): Pick<Movie, 'x' | 'y' | 'size' | 'emissive' | 'genre_color'> {
  const t = (seed % 7) * 0.03
  const emissive = Math.min(1.45, Math.max(0.12, 0.25 + voteAverage * 0.12))
  return {
    x: -0.2 + t,
    y: 0.15 - t * 0.5,
    size: 6 + (seed % 5),
    emissive,
    genre_color: [0.55 + t, 0.42, 0.68 - t],
  }
}

export const subsampleMovieMarthasVineyard: Movie = {
  ...galaxyPlaceholders(657018, 7.4),
  z: releaseDateToDecimalYear('2020-01-12'),
  title: "A Beautiful Place to Die: A Martha's Vineyard Mystery",
  original_title: "A Beautiful Place to Die: A Martha's Vineyard Mystery",
  overview:
    "After being forced into early retirement, former detective Jeff Jackson returns to a quiet life on Martha's Vineyard. Quiet, at least, until a body washes up and he's drawn back into crime solving.",
  tagline: null,
  release_date: '2020-01-12',
  genres: ['Mystery', 'Drama', 'TV Movie'],
  original_language: 'en',
  vote_count: 45,
  vote_average: 7.4,
  popularity: 1.9866,
  imdb_rating: 6.7,
  imdb_votes: 1723,
  runtime: 85,
  revenue: 0,
  budget: 0,
  production_countries: ['Canada', 'United States of America'],
  production_companies: ['Muse Entertainment', 'Hallmark Media'],
  spoken_languages: ['English'],
  cast: splitCommaList(MARTHA_CAST),
  director: ['Mark Jean'],
  writers: ['Teena Booth', 'Kraig Wenman', 'Philip R. Craig'],
  producers: ['Charles Cooper', 'Jesse Metcalfe', 'Michael Prupas', 'Joel S. Rice'],
  director_of_photography: ['William McKnight'],
  music_composer: ['Matthew Rogers'],
  poster_url: 'https://image.tmdb.org/t/p/w500/3FGGJh5S9G29YGIRYqe3zca40yL.jpg',
  id: 657018,
  imdb_id: 'tt10768536',
}

export const subsampleMovieParadiseRoad: Movie = {
  ...galaxyPlaceholders(77223, 6.4),
  z: releaseDateToDecimalYear('1997-02-11'),
  title: 'Paradise Road',
  original_title: 'Paradise Road',
  overview:
    'A group of English, American, Dutch and Australian women creates a vocal orchestra while being imprisoned in a Japanese POW camp on Sumatra during World War II.',
  tagline: 'Courage echoes forever.',
  release_date: '1997-02-11',
  genres: ['War', 'Drama', 'History'],
  original_language: 'en',
  vote_count: 91,
  vote_average: 6.4,
  popularity: 1.4514,
  imdb_rating: 6.8,
  imdb_votes: 6284,
  runtime: 122,
  revenue: 2_007_100,
  budget: 16_000_000,
  production_countries: ['Australia', 'United States of America'],
  production_companies: [
    'Samson Productions',
    'Fox Searchlight Pictures',
    'Village Roadshow',
    'Australian Film Commission',
    'Pacific Film and Television Commission',
  ],
  spoken_languages: ['日本語', 'English', 'Nederlands', 'Bahasa melayu'],
  cast: splitCommaList(PARADISE_CAST),
  director: ['Bruce Beresford'],
  writers: ['Alfred Uhry', 'Bruce Beresford'],
  producers: [],
  director_of_photography: ['Peter James'],
  music_composer: ['Ross Edwards'],
  poster_url: 'https://image.tmdb.org/t/p/w500/mEA7Iv1e6HqpSGMfVUdUfYOusNU.jpg',
  id: 77223,
  imdb_id: 'tt0119859',
}

export const subsampleMovieKika: Movie = {
  ...galaxyPlaceholders(8223, 6.4),
  z: releaseDateToDecimalYear('1993-10-29'),
  title: 'Kika',
  original_title: 'Kika',
  overview:
    "When American author Nicholas brings in a cosmetologist named Kika to prepare the corpse of his recently deceased son, she inadvertently revives the young man, then falls in love with him. Forces conspire against the couple, though, as Nicholas wants Kika for himself.",
  tagline: 'A memorable, surreal and bizarre comedy in the best Almódovar style!',
  release_date: '1993-10-29',
  genres: ['Comedy', 'Drama'],
  original_language: 'es',
  vote_count: 316,
  vote_average: 6.4,
  popularity: 1.7512,
  imdb_rating: 6.5,
  imdb_votes: 15988,
  runtime: 117,
  revenue: 2_019_069,
  budget: 0,
  production_countries: ['Spain', 'France'],
  production_companies: ['El Deseo', 'CiBy 2000'],
  spoken_languages: ['Español'],
  cast: splitCommaList(KIKA_CAST),
  director: ['Pedro Almodóvar'],
  writers: ['Pedro Almodóvar'],
  producers: ['Agustín Almodóvar'],
  director_of_photography: ['Alfredo Mayo'],
  music_composer: [],
  poster_url: 'https://image.tmdb.org/t/p/w500/jUEBKaMqcvrz0HHF8Cei8asjRWr.jpg',
  id: 8223,
  imdb_id: 'tt0107315',
}

/** Short film from subsample with empty `cast` in CSV — useful for drawer edge cases. */
export const subsampleMovieHappiness: Movie = {
  ...galaxyPlaceholders(489533, 7.123),
  z: releaseDateToDecimalYear('2017-06-12'),
  title: 'Happiness',
  original_title: 'Happiness',
  overview: "The story of a rodent's unrelenting quest for happiness and fulfillment.",
  tagline: null,
  release_date: '2017-06-12',
  genres: ['Animation', 'Drama'],
  original_language: 'en',
  vote_count: 122,
  vote_average: 7.123,
  popularity: 0.3811,
  imdb_rating: 7.7,
  imdb_votes: 2483,
  runtime: 5,
  revenue: 0,
  budget: 0,
  production_countries: ['United Kingdom'],
  production_companies: [],
  spoken_languages: ['No Language'],
  cast: [],
  director: ['Steve Cutts'],
  writers: [],
  producers: [],
  director_of_photography: [],
  music_composer: [],
  poster_url: 'https://image.tmdb.org/t/p/w500/y3Xv1IEZd46sMQSDRnXyBMwPqsB.jpg',
  id: 489533,
  imdb_id: 'tt7704920',
}

const zMartha = subsampleMovieMarthasVineyard.z
const zParadise = subsampleMovieParadiseRoad.z
const zKika = subsampleMovieKika.z
const zHappy = subsampleMovieHappiness.z

export const SUBSAMPLE_DECIMAL_Z_RANGE = [Math.min(zKika, zParadise, zHappy, zMartha) - 0.5, Math.max(zKika, zParadise, zHappy, zMartha) + 0.5] as const

assert(SUBSAMPLE_DECIMAL_Z_RANGE[0] < SUBSAMPLE_DECIMAL_Z_RANGE[1], 'z range order')
