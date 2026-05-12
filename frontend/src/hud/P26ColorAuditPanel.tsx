import { useCallback, useMemo, useState } from 'react'

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const h = (x: number) => x.toString(16).padStart(2, '0')
  return a === 255 ? `#${h(r)}${h(g)}${h(b)}` : `#${h(r)}${h(g)}${h(b)}${h(a)}`
}

/** WebGL framebuffer readPixels uses lower-left origin. */
function sampleWebglCenterRgba(): { rgba: string; note: string } | null {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-galaxy-webgl="1"]')
  if (!canvas) return null
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null
  if (!gl) return null
  const w = canvas.width
  const h = canvas.height
  if (w < 1 || h < 1) return null
  const x = Math.floor((w - 1) / 2)
  const y = Math.floor((h - 1) / 2)
  const pixel = new Uint8Array(4)
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
  const [r, g, b, a] = pixel
  return {
    rgba: rgbaToHex(r, g, b, a),
    note: `readPixels(${x},${y}) lower-left space, ${w}×${h}`,
  }
}

type Swatch = { label: string; css: string }

/**
 * P26.1 — floating QA panel: shared CSS OKLCH tokens, sRGB references, optional WebGL center sample.
 * Not part of product HUD; English-only copy.
 */
export function P26ColorAuditPanel() {
  const [webglSample, setWebglSample] = useState<string | null>(null)
  const [webglErr, setWebglErr] = useState<string | null>(null)

  const swatches: Swatch[] = useMemo(
    () => [
      { label: '--foreground', css: 'var(--foreground)' },
      { label: '--border', css: 'var(--border)' },
      { label: '--muted-foreground', css: 'var(--muted-foreground)' },
      { label: '--background', css: 'var(--background)' },
      { label: '--ring', css: 'var(--ring)' },
      { label: '--cosmos-brand-muted', css: 'var(--cosmos-brand-muted)' },
      { label: '--cosmos-universe-bg', css: 'var(--cosmos-universe-bg)' },
      { label: '--ui-edge-canvas', css: 'var(--ui-edge-canvas-color)' },
    ],
    [],
  )

  const srgbRefs = useMemo(
    () => [
      { label: '#FFFFFF', css: '#ffffff' },
      { label: '#808080', css: '#808080' },
      { label: '#000000', css: '#000000' },
    ],
    [],
  )

  const onSampleWebgl = useCallback(() => {
    setWebglErr(null)
    try {
      const out = sampleWebglCenterRgba()
      if (!out) {
        setWebglSample(null)
        setWebglErr('No WebGL2 canvas (data-galaxy-webgl) — open after scene mount.')
        return
      }
      setWebglSample(`${out.rgba} (${out.note})`)
      console.log('[P26.1] WebGL center sample', out)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setWebglErr(msg)
      setWebglSample(null)
    }
  }, [])

  const hdrHint = useMemo(() => {
    if (typeof window === 'undefined') return ''
    try {
      const hi = window.matchMedia('(dynamic-range: high)')
      return `dynamic-range: high → ${hi.matches}`
    } catch {
      return 'dynamic-range: (unavailable)'
    }
  }, [])

  return (
    <aside
      data-p26-color-audit="1"
      className="pointer-events-auto fixed bottom-3 left-3 z-[100] max-h-[min(70vh,520px)] w-[min(calc(100vw-1.5rem),320px)] overflow-y-auto rounded-lg border border-white/20 bg-black/80 p-3 text-[11px] leading-snug text-zinc-200 shadow-xl backdrop-blur-sm"
      aria-label="P26.1 HDR color audit (QA)"
    >
      <div className="mb-2 font-semibold text-zinc-50">P26.1 color audit</div>
      <p className="mb-2 text-zinc-400">
        Compare idle/active stars, Perlin focus, rating reference, cover type, and HUD chrome against these
        patches. Record OS HDR on/off, browser, and display. WebGL path uses{' '}
        <code className="text-zinc-300">SRGBColorSpace</code> (see <code className="text-zinc-300">scene.ts</code>
        ).
      </p>
      <p className="mb-2 break-all text-zinc-500">
        {typeof navigator !== 'undefined' ? navigator.userAgent : ''}
      </p>
      <p className="mb-2 text-zinc-400">{hdrHint}</p>

      <div className="mb-1 text-zinc-500">CSS tokens (current theme)</div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {swatches.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <div
              className="h-8 w-full rounded border border-white/15"
              style={{ backgroundColor: s.css }}
              title={s.label}
            />
            <span className="break-all text-[10px] text-zinc-500">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="mb-1 text-zinc-500">sRGB flat references</div>
      <div className="mb-3 flex gap-2">
        {srgbRefs.map((s) => (
          <div key={s.label} className="flex flex-1 flex-col gap-0.5">
            <div
              className="h-8 w-full rounded border border-white/15"
              style={{ backgroundColor: s.css }}
              title={s.label}
            />
            <span className="text-[10px] text-zinc-500">{s.label}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mb-2 w-full rounded border border-white/25 bg-white/10 px-2 py-1.5 text-left text-zinc-100 hover:bg-white/15"
        onClick={onSampleWebgl}
      >
        Sample WebGL center RGBA
      </button>
      {webglSample ? <p className="mb-1 break-all text-emerald-300">{webglSample}</p> : null}
      {webglErr ? <p className="mb-1 break-all text-amber-300">{webglErr}</p> : null}
      <p className="text-[10px] text-zinc-500">
        Optional: <code className="text-zinc-400">?todayMovieId=&lt;TMDB&gt;</code> or{' '}
        <code className="text-zinc-400">?p26Today=&lt;TMDB&gt;</code> to pin cover/focus to one row (must exist in
        bundle). Combine with <code className="text-zinc-400">?p26ColorAudit=1</code>.
      </p>
    </aside>
  )
}
