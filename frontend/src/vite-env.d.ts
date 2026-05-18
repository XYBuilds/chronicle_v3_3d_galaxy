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
  /** P28.1: Ko-fi or other support page URL. **Unset**: built-in default ``https://ko-fi.com/xybuilds``; empty / ``0`` / ``false``: hide HUD support button. */
  readonly VITE_KOFI_URL?: string
  /** P28.2: Tally form key for ``data-tally-open``. Empty / ``0`` / ``false`` hides the HUD feedback button. */
  readonly VITE_TALLY_FEEDBACK_FORM_ID?: string
  /** P28.3 optional: Discord invite URL (``https://discord.gg/…``). Empty falls back to ``https://discord.com/``. */
  readonly VITE_DISCORD_INVITE_URL?: string
}

declare module '*.glsl' {
  const source: string
  export default source
}
