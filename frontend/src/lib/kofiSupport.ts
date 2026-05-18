/** P28.1 — Ko-fi support page: env override, else built-in maintainer page; empty / disabled → hide HUD entry. */

/** Default when `VITE_KOFI_URL` is unset (overridable per deploy). */
const DEFAULT_KOFI_URL = 'https://ko-fi.com/xybuilds'

function normalizeSupportUrl(input: string): string | null {
  const t = input.trim()
  try {
    const u = new URL(t)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      console.warn('[support] URL must be http(s); hiding support button.')
      return null
    }
    return u.href
  } catch {
    return null
  }
}

/**
 * Returns a validated support URL, or `null` when the support button should be hidden
 * (`VITE_KOFI_URL` empty / `0` / `false`, or not a valid `http:`/`https:` URL).
 * When `VITE_KOFI_URL` is **unset**, uses {@link DEFAULT_KOFI_URL}.
 */
export function getKofiSupportUrl(): string | null {
  const raw = import.meta.env.VITE_KOFI_URL as string | undefined
  if (raw === undefined) {
    return normalizeSupportUrl(DEFAULT_KOFI_URL)
  }
  const t = String(raw).trim()
  if (t === '' || t === '0' || t === 'false') return null
  const ok = normalizeSupportUrl(t)
  if (!ok) console.warn('[support] VITE_KOFI_URL is not a valid URL; hiding support button.')
  return ok
}
