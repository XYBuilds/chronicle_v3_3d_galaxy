import type { CSSProperties } from 'react'

const COLOR_MIX_OKLCH_GENRE =
  typeof CSS !== 'undefined' &&
  (CSS as unknown as { supports?: (property: string, value: string) => boolean }).supports?.(
    'background',
    'color-mix(in oklch, #ff0000 18%, transparent)',
  ) === true

/**
 * Parse #RRGGBB, RRGGBB, or #RGB from pipeline / meta `genre_palette`.
 * Returns 8-bit channels or null if invalid.
 */
export function parseHex6ToRgb(input: string): [number, number, number] | null {
  const t = input.trim()
  const m = t.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/i)
  if (!m) return null
  const raw = m[1]!
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw
  const n = parseInt(full, 16)
  if (!Number.isFinite(n) || n < 0 || n > 0xffffff) return null
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return [r, g, b]
}

/** Canonical `#rrggbb` for CSS variables and stable equality. */
export function normalizeGenreHex(input: string): string | null {
  const rgb = parseHex6ToRgb(input)
  if (!rgb) return null
  const [r, g, b] = rgb
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Surface styles for the `genre` badge variant: oklch color-mix on supporting
 * engines; explicit rgb alpha fallback otherwise (P9.2).
 */
export function getGenreChipSurfaceStyle(normalizedHex: string): CSSProperties {
  if (import.meta.env.DEV) {
    if (!parseHex6ToRgb(normalizedHex)) {
      throw new Error(`[getGenreChipSurfaceStyle] expected normalized hex, got: ${JSON.stringify(normalizedHex)}`)
    }
  }
  if (COLOR_MIX_OKLCH_GENRE) {
    return { ['--genre-color' as string]: normalizedHex }
  }
  const rgb = parseHex6ToRgb(normalizedHex)
  if (!rgb) return {}
  const [r, g, b] = rgb
  return {
    background: `rgb(${r} ${g} ${b} / 0.18)`,
    borderColor: `rgb(${r} ${g} ${b} / 0.6)`,
  }
}
