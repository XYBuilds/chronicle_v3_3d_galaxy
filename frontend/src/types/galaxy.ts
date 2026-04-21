/**
 * galaxy_data.json — Tech Spec §4 (Python → frontend contract).
 */

/** Normalized sRGB in [0, 1] for GPU / Three.js (§4.3A `genre_color`). */
/** `[r, g, b]` normalized sRGB (§4.3A). */
export type GenreColorRgb = number[]

/** UMAP hyperparameters echoed from the pipeline (§4.2 `umap_params`). */
export interface UmapParams {
  n_neighbors: number
  min_dist: number
  metric: string
  /** Pipeline contract: must be `42` (Tech Spec §2.1 / §4.2). */
  random_state: number
  /** DensMAP flag; newer pipeline exports always set this (Phase 6). */
  densmap?: boolean
}

/** §2.1.3 multimodal fusion weights (`meta.feature_weights`). */
export interface FeatureWeights {
  text: number
  genre: number
  lang: number
}

/** UMAP axis ranges for camera / normalization (§4.2 `xy_range`). Each axis is `[min, max]`. */
export interface XyRange {
  x: number[]
  y: number[]
}

export interface Meta {
  version: string
  generated_at: string
  count: number
  embedding_model: string
  umap_params: UmapParams
  genre_weight_ratio: number
  /** Genre name → sRGB hex (§4.2). */
  genre_palette: Record<string, string>
  feature_weights: FeatureWeights
  /** `[z_min, z_max]` decimal years (§4.2). */
  z_range: number[]
  xy_range: XyRange
}

/**
 * Single movie: GPU buffers (§4.3A) + HUD fields (§4.3B) + keys (§4.3C).
 */
export interface Movie {
  x: number
  y: number
  z: number
  size: number
  emissive: number
  genre_color: GenreColorRgb

  title: string
  original_title: string
  overview: string
  tagline: string | null
  release_date: string
  genres: string[]
  original_language: string
  vote_count: number
  vote_average: number
  popularity: number
  imdb_rating: number | null
  imdb_votes: number | null
  runtime: number | null
  revenue: number
  budget: number
  production_countries: string[]
  production_companies: string[]
  spoken_languages: string[]
  cast: string[]
  director: string[]
  writers: string[]
  producers: string[]
  director_of_photography: string[]
  music_composer: string[]
  poster_url: string

  id: number
  imdb_id: string | null
}

export interface GalaxyData {
  meta: Meta
  movies: Movie[]
}
