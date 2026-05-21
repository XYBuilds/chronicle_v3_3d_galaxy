import { useCallback, useEffect, useRef, useState } from 'react'

import {
  buildHdrProofReport,
  logHdrProofReport,
  renderHdrProofFrame,
  runHdrProofComparison,
  type HdrProofReport,
  type HdrProofToneMappingMode,
} from '@/lib/hdrProof'

/** Standalone HDR proof lab (Phase 29.3); not mounted in production galaxy. */
export function HdrProofLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [report, setReport] = useState<HdrProofReport | null>(null)
  const [mode, setMode] = useState<HdrProofToneMappingMode>('extended')

  const render = useCallback(async (m: HdrProofToneMappingMode) => {
    const canvas = canvasRef.current
    if (!canvas) return
    await renderHdrProofFrame(m, canvas)
    setMode(m)
  }, [])

  const runFull = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const comparison = await runHdrProofComparison(canvas)
    const next = buildHdrProofReport(comparison, null)
    setReport(next)
    logHdrProofReport(next)
    setMode('extended')
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    void renderHdrProofFrame('extended', canvas)
  }, [])

  return (
    <div className="flex flex-col gap-3 text-sm text-neutral-200">
      <p className="max-w-[640px]">
        Left: SDR reference white (linear {1}). Right: HDR candidate (linear {4}). Compare{' '}
        <code className="text-amber-200">extended</code> vs <code className="text-amber-200">standard</code>{' '}
        WebGPU tone mapping on an HDR display with OS HDR enabled.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-neutral-700 px-3 py-1 hover:bg-neutral-600"
          onClick={() => void render('extended')}
        >
          Render extended
        </button>
        <button
          type="button"
          className="rounded bg-neutral-700 px-3 py-1 hover:bg-neutral-600"
          onClick={() => void render('standard')}
        >
          Render standard
        </button>
        <button
          type="button"
          className="rounded bg-amber-800 px-3 py-1 hover:bg-amber-700"
          onClick={() => void runFull()}
        >
          Run comparison
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="block border border-neutral-600"
        style={{ width: 640, height: 320 }}
      />
      <p className="text-neutral-400">Current mode: {mode}</p>
      {report ? (
        <pre className="max-h-48 overflow-auto rounded bg-neutral-900 p-2 text-xs">
          {JSON.stringify({ verdict: report.verdict, meetsD1Proof: report.meetsD1Proof, notes: report.notes }, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}
