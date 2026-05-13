/** P28.2 — Tally feedback widget: form id from env, default production id when unset. */

declare global {
  interface Window {
    Tally?: { loadEmbeds: () => void }
  }
}

const DEFAULT_FORM_ID = 'pbRpey'
const TALLY_EMBED_SRC = 'https://tally.so/widgets/embed.js'

let embedScriptPromise: Promise<void> | null = null

/**
 * Returns the Tally form key for `data-tally-open`, or `null` when feedback is disabled
 * (`VITE_TALLY_FEEDBACK_FORM_ID` set to empty / `0` / `false`).
 */
export function getTallyFeedbackFormId(): string | null {
  const raw = import.meta.env.VITE_TALLY_FEEDBACK_FORM_ID as string | undefined
  if (raw === undefined) return DEFAULT_FORM_ID
  const t = String(raw).trim()
  if (t === '' || t === '0' || t === 'false') return null
  return t
}

/** Injects Tally `embed.js` once (idempotent). Rejects if the script fails to load. */
export function ensureTallyEmbedScript(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  if (typeof window !== 'undefined' && window.Tally?.loadEmbeds) return Promise.resolve()
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${TALLY_EMBED_SRC}"]`)
  if (existing?.dataset.tallyLoaded === '1') return Promise.resolve()
  if (existing && !existing.dataset.tallyLoaded) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('[Tally] embed script error')), { once: true })
    })
  }
  if (!embedScriptPromise) {
    embedScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = TALLY_EMBED_SRC
      s.async = true
      s.onload = () => {
        s.dataset.tallyLoaded = '1'
        resolve()
      }
      s.onerror = () => {
        embedScriptPromise = null
        reject(new Error('[Tally] embed script failed to load'))
      }
      document.body.appendChild(s)
    })
  }
  return embedScriptPromise
}

/** Re-scan DOM for `[data-tally-open]` after React mounts controls (SPA). */
export function refreshTallyEmbeds(): void {
  window.Tally?.loadEmbeds?.()
}
