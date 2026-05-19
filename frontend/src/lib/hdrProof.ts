/**
 * Phase 29.3 — Minimal HDR proof (lab / debug only).
 * Side-by-side SDR reference white vs HDR candidate on a WebGPU canvas with
 * `toneMapping.mode: "extended"` vs `"standard"`. Does not touch galaxy shaders.
 */

import {
  probeWebGpuExtendedToneMapping,
  requestWebGpuAdapter,
  type HdrCapabilitiesReport,
} from './hdrCapabilities'

/** scRGB-style linear reference white (≈ SDR 100 nit anchor in extended space). */
export const HDR_PROOF_SDR_REFERENCE_LINEAR = 1.0
/** Candidate highlight above reference; visible separation implies extended headroom. */
export const HDR_PROOF_CANDIDATE_LINEAR = 4.0

export type HdrProofToneMappingMode = 'extended' | 'standard'
export type HdrProofVerdict =
  | 'hdr-output-likely'
  | 'sdr-clamped'
  | 'extended-unavailable'
  | 'inconclusive'

export interface HdrProofPatchSample {
  /** Linear RGB read from canvas (may be clamped by readback). */
  left: [number, number, number]
  right: [number, number, number]
  /** max(right) / max(left) when left > 0. */
  rightToLeftRatio: number
}

export interface HdrProofComparison {
  extended: HdrProofPatchSample | null
  standard: HdrProofPatchSample | null
  extendedConfigureOk: boolean
}

export interface HdrProofReport {
  sdrReferenceLinear: number
  hdrCandidateLinear: number
  comparison: HdrProofComparison
  verdict: HdrProofVerdict
  /** True when verdict is `hdr-output-likely` (D1 pixel-level pass signal). */
  meetsD1Proof: boolean
  capabilities: HdrCapabilitiesReport | null
  probedAt: string
  manualSteps: string[]
  notes: string[]
}

const LOG_PREFIX = '[hdrProof]'
const PROOF_W = 640
const PROOF_H = 320

const WGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOutput {
  let positions = array(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var out: VertexOutput;
  let pos = positions[vid];
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + 0.5;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let sdrRef = vec3f(${HDR_PROOF_SDR_REFERENCE_LINEAR}, ${HDR_PROOF_SDR_REFERENCE_LINEAR}, ${HDR_PROOF_SDR_REFERENCE_LINEAR});
  let hdrCand = vec3f(${HDR_PROOF_CANDIDATE_LINEAR}, ${HDR_PROOF_CANDIDATE_LINEAR}, ${HDR_PROOF_CANDIDATE_LINEAR});
  if (in.uv.x < 0.5) {
    return vec4f(sdrRef, 1.0);
  }
  return vec4f(hdrCand, 1.0);
}
`

/** Blit readback texture to swapchain (swapchain textures are RenderAttachment-only). */
const WGSL_BLIT = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_blit(@builtin(vertex_index) vid: u32) -> VertexOutput {
  let positions = array(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var out: VertexOutput;
  let pos = positions[vid];
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + 0.5;
  return out;
}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;

@fragment
fn fs_blit(in: VertexOutput) -> @location(0) vec4f {
  return textureSample(srcTex, srcSampler, in.uv);
}
`

/** Pure verdict from extended vs standard patch readbacks (best-effort; display may still show HDR). */
export function interpretHdrProofComparison(comparison: HdrProofComparison): {
  verdict: HdrProofVerdict
  meetsD1Proof: boolean
  notes: string[]
} {
  const notes: string[] = []

  if (!comparison.extendedConfigureOk) {
    return {
      verdict: 'extended-unavailable',
      meetsD1Proof: false,
      notes: ['WebGPU extended tone mapping configure failed or API missing.'],
    }
  }

  const ext = comparison.extended
  const std = comparison.standard

  if (!ext || !std) {
    return {
      verdict: 'inconclusive',
      meetsD1Proof: false,
      notes: [
        'Missing extended or standard patch readback — compare patches visually on the canvas.',
        'If the console reported swapchain CopySrc errors, update to a build with offscreen readback (P29.3 fix).',
      ],
    }
  }

  const extRatio = ext.rightToLeftRatio
  const stdRatio = std.rightToLeftRatio
  notes.push(`extended right/left ratio: ${extRatio.toFixed(3)}`)
  notes.push(`standard right/left ratio: ${stdRatio.toFixed(3)}`)

  const headroomInExtended = extRatio > 1.15
  const clampedInStandard = stdRatio < 1.12

  if (headroomInExtended && clampedInStandard) {
    return {
      verdict: 'hdr-output-likely',
      meetsD1Proof: true,
      notes: [
        ...notes,
        'Candidate patch readback exceeds reference in extended mode; standard mode collapses separation.',
      ],
    }
  }

  if (!headroomInExtended && stdRatio < 1.12) {
    return {
      verdict: 'sdr-clamped',
      meetsD1Proof: false,
      notes: [
        ...notes,
        'No measurable separation — likely SDR clamp or OS HDR off.',
      ],
    }
  }

  return {
    verdict: 'inconclusive',
    meetsD1Proof: false,
    notes: [
      ...notes,
      'Readback ambiguous; confirm visually on HDR display (right patch brighter in extended).',
    ],
  }
}

export function buildHdrProofManualSteps(): string[] {
  return [
    'Enable OS HDR and use an HDR-capable display.',
    'Open devtools: window.__hdrProbe.show() then await window.__hdrProbe.runComparison().',
    'Extended frame: left = SDR reference (linear 1.0), right = HDR candidate (linear 4.0).',
    'If right looks clearly brighter than left in extended but not in standard → D1 pass signal.',
    'Save screenshot + copy report; record OS HDR on/off and browser version in 29.7 gate.',
  ]
}

function maxChannel(rgb: [number, number, number]): number {
  return Math.max(rgb[0], rgb[1], rgb[2])
}

function parsePatchSampleFromBuffer(
  data: Uint8Array,
  bytesPerRow: number,
  width: number,
  height: number,
): HdrProofPatchSample {
  const pick = (px: number, py: number): [number, number, number] => {
    const offset = py * bytesPerRow + px * 4
    return [data[offset]! / 255, data[offset + 1]! / 255, data[offset + 2]! / 255]
  }

  const leftX = Math.floor(width * 0.25)
  const rightX = Math.floor(width * 0.75)
  const midY = Math.floor(height * 0.5)
  const left = pick(leftX, midY)
  const right = pick(rightX, midY)
  const leftMax = maxChannel(left)
  const rightMax = maxChannel(right)
  const rightToLeftRatio = leftMax > 1e-4 ? rightMax / leftMax : 1

  return { left, right, rightToLeftRatio }
}

export async function renderHdrProofFrame(
  mode: HdrProofToneMappingMode,
  targetCanvas: HTMLCanvasElement,
): Promise<{ sample: HdrProofPatchSample | null; configureOk: boolean }> {
  targetCanvas.width = PROOF_W
  targetCanvas.height = PROOF_H

  let device: GPUDevice | null = null
  try {
    const adapter = await requestWebGpuAdapter()
    if (!adapter) return { sample: null, configureOk: false }

    device = await adapter.requestDevice()
    const context = targetCanvas.getContext('webgpu')
    if (!context) return { sample: null, configureOk: false }

    const format = navigator.gpu.getPreferredCanvasFormat()
    context.configure({ device, format, toneMapping: { mode } })

    const proofModule = device.createShaderModule({ code: WGSL })
    const proofPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: proofModule, entryPoint: 'vs_main' },
      fragment: { module: proofModule, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    })

    const blitModule = device.createShaderModule({ code: WGSL_BLIT })
    const blitPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: blitModule, entryPoint: 'vs_blit' },
      fragment: { module: blitModule, entryPoint: 'fs_blit', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    })

    const readbackTexture = device.createTexture({
      size: [PROOF_W, PROOF_H],
      format,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
    })
    const readbackView = readbackTexture.createView()
    const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' })
    const blitBindGroup = device.createBindGroup({
      layout: blitPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: readbackView },
        { binding: 1, resource: sampler },
      ],
    })

    const bytesPerRow = Math.ceil((PROOF_W * 4) / 256) * 256
    const readBuffer = device.createBuffer({
      size: bytesPerRow * PROOF_H,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })

    const encoder = device.createCommandEncoder()
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: readbackView,
            clearValue: { r: 0.02, g: 0.02, b: 0.04, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      })
      pass.setPipeline(proofPipeline)
      pass.draw(3)
      pass.end()
    }

    encoder.copyTextureToBuffer(
      { texture: readbackTexture },
      { buffer: readBuffer, bytesPerRow, rowsPerImage: PROOF_H },
      { width: PROOF_W, height: PROOF_H },
    )

    const swapView = context.getCurrentTexture().createView()
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: swapView,
            clearValue: { r: 0.02, g: 0.02, b: 0.04, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      })
      pass.setPipeline(blitPipeline)
      pass.setBindGroup(0, blitBindGroup)
      pass.draw(3)
      pass.end()
    }

    device.queue.submit([encoder.finish()])

    await readBuffer.mapAsync(GPUMapMode.READ)
    const sample = parsePatchSampleFromBuffer(
      new Uint8Array(readBuffer.getMappedRange()),
      bytesPerRow,
      PROOF_W,
      PROOF_H,
    )
    readBuffer.unmap()
    readBuffer.destroy()
    readbackTexture.destroy()

    return { sample, configureOk: true }
  } catch {
    return { sample: null, configureOk: false }
  } finally {
    device?.destroy()
  }
}

export async function runHdrProofComparison(
  canvas: HTMLCanvasElement,
): Promise<HdrProofComparison> {
  const extended = await renderHdrProofFrame('extended', canvas)
  const standard = await renderHdrProofFrame('standard', canvas)
  const extendedConfigureOk =
    extended.configureOk && (await probeWebGpuExtendedToneMapping())

  return {
    extended: extended.sample,
    standard: standard.sample,
    extendedConfigureOk,
  }
}

export function buildHdrProofReport(
  comparison: HdrProofComparison,
  capabilities: HdrCapabilitiesReport | null,
): HdrProofReport {
  const { verdict, meetsD1Proof, notes } = interpretHdrProofComparison(comparison)
  return {
    sdrReferenceLinear: HDR_PROOF_SDR_REFERENCE_LINEAR,
    hdrCandidateLinear: HDR_PROOF_CANDIDATE_LINEAR,
    comparison,
    verdict,
    meetsD1Proof,
    capabilities,
    probedAt: new Date().toISOString(),
    manualSteps: buildHdrProofManualSteps(),
    notes,
  }
}

export function logHdrProofReport(report: HdrProofReport): void {
  console.log(LOG_PREFIX, report)
}

function buildProofOverlay(): {
  root: HTMLDivElement
  canvas: HTMLCanvasElement
  label: HTMLDivElement
} {
  const root = document.createElement('div')
  root.style.cssText =
    'position:fixed;top:12px;right:12px;z-index:99999;display:none;flex-direction:column;gap:6px;' +
    'font:12px/1.4 system-ui,sans-serif;color:#e8e8e8;pointer-events:auto;'
  const label = document.createElement('div')
  label.textContent = 'HDR proof (29.3): left SDR ref (1.0) | right candidate (4.0)'
  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'width:640px;height:320px;border:1px solid #444;border-radius:4px;display:block;'
  root.append(label, canvas)
  return { root, canvas, label }
}

export interface HdrProofDebug {
  /** Set after `runComparison()`; `null` before first run. */
  report: HdrProofReport | null
  show: () => void
  hide: () => void
  runComparison: () => Promise<HdrProofReport>
  renderMode: (mode: HdrProofToneMappingMode) => Promise<void>
  /** Re-logs `report`; returns it (or `null` if `runComparison()` not run yet). */
  log: () => HdrProofReport | null
  dispose: () => void
}

/** Mounts overlay for `window.__hdrProbe`; hidden until `show()`. */
export function createHdrProofDebug(): HdrProofDebug {
  const { root, canvas, label } = buildProofOverlay()
  document.body.append(root)

  const refreshLabel = (current: HdrProofReport | null, mode?: string) => {
    const verdict = current?.verdict ?? '—'
    const modeHint = mode ? ` [${mode}]` : ''
    label.textContent =
      `HDR proof (29.3)${modeHint} · verdict=${verdict} · left 1.0 | right 4.0 linear`
  }

  /** Plain own property so DevTools `window.__hdrProbe.report` works after `runComparison()`. */
  const api: HdrProofDebug = {
    report: null,
    show: () => {
      root.style.display = 'flex'
      refreshLabel(api.report)
    },
    hide: () => {
      root.style.display = 'none'
    },
    renderMode: async (mode) => {
      await renderHdrProofFrame(mode, canvas)
      refreshLabel(api.report, mode)
    },
    runComparison: async () => {
      const comparison = await runHdrProofComparison(canvas)
      let capabilities: HdrCapabilitiesReport | null = null
      const hdrCap = (window as Window & { __hdrCapabilities?: { report: HdrCapabilitiesReport; refreshWebGpu: () => Promise<HdrCapabilitiesReport> } })
        .__hdrCapabilities
      if (hdrCap) {
        await hdrCap.refreshWebGpu()
        capabilities = hdrCap.report
      }
      api.report = buildHdrProofReport(comparison, capabilities)
      logHdrProofReport(api.report)
      refreshLabel(api.report, 'extended+standard')
      return api.report
    },
    log: () => {
      if (api.report) logHdrProofReport(api.report)
      else console.log(LOG_PREFIX, 'no report yet — call await runComparison() first')
      return api.report
    },
    dispose: () => {
      root.remove()
      api.report = null
    },
  }

  return api
}

