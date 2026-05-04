-- P18.2 — Supabase schema: movies, galaxy_v1_reference, movies_pending, vote_snapshots, threshold_versions
-- Apply via Supabase SQL editor or `supabase db push` (CLI).

-- ---------------------------------------------------------------------------
-- v1 reference (Procrustes anchor; treat as immutable after initial load)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS galaxy_v1_reference (
  movie_id BIGINT PRIMARY KEY,
  x_v1 DOUBLE PRECISION NOT NULL,
  y_v1 DOUBLE PRECISION NOT NULL,
  z_v1 DOUBLE PRECISION NOT NULL
);

COMMENT ON TABLE galaxy_v1_reference IS
  'P18.2: Frozen UMAP x,y + decimal-year z (same as export). Do not UPDATE/DELETE except explicit universe reset; service_role bypasses RLS.';

ALTER TABLE galaxy_v1_reference ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Current galaxy universe (coordinates updated on monthly refit after Procrustes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movies (
  id BIGINT PRIMARY KEY,
  imdb_id TEXT,
  title TEXT NOT NULL,
  original_title TEXT,
  title_normalized TEXT NOT NULL,
  overview TEXT NOT NULL,
  tagline TEXT,
  poster_path TEXT,
  release_date DATE NOT NULL,
  genres TEXT[] NOT NULL,
  original_language TEXT NOT NULL,
  spoken_languages TEXT[],
  production_countries TEXT[],
  production_companies TEXT[],
  vote_count INTEGER NOT NULL,
  vote_average REAL NOT NULL,
  popularity REAL,
  imdb_rating REAL,
  imdb_votes INTEGER,
  runtime INTEGER,
  revenue BIGINT,
  budget BIGINT,
  cast_list TEXT[],
  director TEXT[],
  writers TEXT[],
  producers TEXT[],
  director_of_photography TEXT[],
  music_composer TEXT[],
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  z DOUBLE PRECISION NOT NULL,
  last_vote_update TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_xy_refit TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies (release_date);
CREATE INDEX IF NOT EXISTS idx_movies_vote_count ON movies (vote_count);

COMMENT ON TABLE movies IS 'P18.2: Canonical movie rows + latest UMAP/Procrustes coordinates.';

-- ---------------------------------------------------------------------------
-- Pending membership (nightly): embeddings stored until monthly refit merges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movies_pending (
  id BIGINT PRIMARY KEY,
  imdb_id TEXT,
  title TEXT NOT NULL,
  original_title TEXT,
  title_normalized TEXT NOT NULL,
  overview TEXT NOT NULL,
  tagline TEXT,
  poster_path TEXT,
  release_date DATE NOT NULL,
  genres TEXT[] NOT NULL,
  original_language TEXT NOT NULL,
  spoken_languages TEXT[],
  production_countries TEXT[],
  production_companies TEXT[],
  vote_count INTEGER NOT NULL,
  vote_average REAL NOT NULL,
  popularity REAL,
  imdb_rating REAL,
  imdb_votes INTEGER,
  runtime INTEGER,
  revenue BIGINT,
  budget BIGINT,
  cast_list TEXT[],
  director TEXT[],
  writers TEXT[],
  producers TEXT[],
  director_of_photography TEXT[],
  music_composer TEXT[],
  z DOUBLE PRECISION NOT NULL,
  text_embedding BYTEA NOT NULL,
  genre_vector BYTEA NOT NULL,
  lang_vector BYTEA NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movies_pending_detected_at ON movies_pending (detected_at);

COMMENT ON TABLE movies_pending IS 'P18.4: New members past frozen threshold; BYTEA = float32 little-endian row vectors.';

-- ---------------------------------------------------------------------------
-- Optional monthly vote history (P18.4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vote_snapshots (
  movie_id BIGINT NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
  snapshot_month DATE NOT NULL,
  vote_count INTEGER NOT NULL,
  vote_average REAL NOT NULL,
  PRIMARY KEY (movie_id, snapshot_month)
);

CREATE INDEX IF NOT EXISTS idx_vote_snapshots_month ON vote_snapshots (snapshot_month);

-- ---------------------------------------------------------------------------
-- Frozen dynamic threshold (P18.4 daily reads active row; P18.5 updates)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS threshold_versions (
  version TEXT PRIMARY KEY,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  quantile REAL NOT NULL,
  alpha REAL NOT NULL,
  rolling_window INTEGER NOT NULL,
  abs_min REAL NOT NULL,
  thresholds_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false
);

-- At most one row may have is_active = true (partial unique index on boolean).
CREATE UNIQUE INDEX IF NOT EXISTS idx_threshold_versions_one_active
  ON threshold_versions (is_active)
  WHERE is_active;

COMMENT ON TABLE threshold_versions IS 'At most one is_active=true; daily cron reads frozen thresholds_json.';
