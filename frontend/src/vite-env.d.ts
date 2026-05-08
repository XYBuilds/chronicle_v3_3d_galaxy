/// <reference types="vite/client" />

interface Window {
  /** P22.8 — dev override: `'inverted' | 'normal'`; takes precedence over `?orbitDrag=`. */
  __galaxyOrbitDragMode?: string
}

interface ImportMetaEnv {
  /** P18.6b: absolute URL to ``galaxy_data.json.gz`` on R2 (optional; manifest is fallback). */
  readonly VITE_GALAXY_DATA_GZIP_URL?: string
  /** P18.6b: absolute URL to ``galaxy_search_index.json.gz`` on R2 (optional). */
  readonly VITE_GALAXY_SEARCH_INDEX_GZIP_URL?: string
  /** P23.1: absolute URL to ``today.json`` (optional; manifest ``today_url`` or bundled file is fallback). */
  readonly VITE_TODAY_JSON_URL?: string
}

declare module '*.glsl' {
  const source: string
  export default source
}
