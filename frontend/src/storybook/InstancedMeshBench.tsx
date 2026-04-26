import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/** P8.4 worst-case steady-state: two full galaxy-sized instance counts (see Phase 8 plan). */
export const BENCH_INSTANCE_COUNT = 60_000

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface InstancedMeshBenchHud {
  webgl2: boolean
  idleVertsPerInstance: number
  activeVertsPerInstance: number
  vertsSubmittedPerFrame: number
  fpsMedian: number
  fpsSampleCount: number
}

/**
 * Storybook-only GPU bench: **MeshA** `IcosahedronGeometry(1,0)` + **MeshB** `IcosahedronGeometry(1,1)`,
 * each `BENCH_INSTANCE_COUNT` instances, **same** instance transforms (max overdraw vs P8.4 dual slab).
 * Materials are `MeshBasicMaterial` (no OKLab / custom GLSL) to isolate vertex + draw cost.
 */
export function InstancedMeshBench() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hud, setHud] = useState<InstancedMeshBenchHud | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x030508)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000)
    camera.position.set(0, 0, 190)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const isWebGL2 = renderer.capabilities.isWebGL2
    console.assert(isWebGL2, '[InstancedMeshBench] Phase 8 prod path targets WebGL2; renderer is WebGL1.')
    if (!isWebGL2) {
      console.error('[InstancedMeshBench] WebGL2 unavailable — fps numbers are not P8.4 gate targets.')
    }

    el.appendChild(renderer.domElement)

    const resize = () => {
      const w = Math.max(1, el.clientWidth)
      const h = Math.max(1, el.clientHeight)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const geoIdle = new THREE.IcosahedronGeometry(1, 0)
    const geoActive = new THREE.IcosahedronGeometry(1, 1)
    const idleVertCount = geoIdle.attributes.position.count
    const activeVertCount = geoActive.attributes.position.count
    // Three r183 `IcosahedronGeometry` is non-indexed: `position.count` is triangle-list expansion
    // (detail 0 → 60, detail 1 → 240), not the polyhedron’s 12 / 42 topological vertices.
    console.log('[InstancedMeshBench] geometry position.count / instance (GPU verts / instance)', {
      idle: idleVertCount,
      active: activeVertCount,
      instances: BENCH_INSTANCE_COUNT,
    })
    const vertsSubmittedPerFrame = BENCH_INSTANCE_COUNT * (idleVertCount + activeVertCount)
    console.log('[InstancedMeshBench] position attributes submitted/frame (two draws)', vertsSubmittedPerFrame)

    const matIdle = new THREE.MeshBasicMaterial({
      color: 0x3399ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
    const matActive = new THREE.MeshBasicMaterial({
      color: 0xff8844,
      transparent: false,
      depthTest: true,
      depthWrite: true,
    })

    const meshIdle = new THREE.InstancedMesh(geoIdle, matIdle, BENCH_INSTANCE_COUNT)
    const meshActive = new THREE.InstancedMesh(geoActive, matActive, BENCH_INSTANCE_COUNT)
    meshIdle.frustumCulled = false
    meshActive.frustumCulled = false

    const m4 = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3(0.11, 0.11, 0.11)
    const rnd = mulberry32(0xbeefcafe)
    const spread = 58
    for (let i = 0; i < BENCH_INSTANCE_COUNT; i++) {
      pos.set((rnd() - 0.5) * 2 * spread, (rnd() - 0.5) * 2 * spread, (rnd() - 0.5) * 2 * spread)
      m4.compose(pos, quat, scale)
      meshIdle.setMatrixAt(i, m4)
      meshActive.setMatrixAt(i, m4)
    }
    meshIdle.instanceMatrix.needsUpdate = true
    meshActive.instanceMatrix.needsUpdate = true

    scene.add(meshIdle)
    scene.add(meshActive)

    let raf = 0
    const fpsWindow: number[] = []
    let prev = performance.now()
    let lastLog = prev

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const dt = now - prev
      prev = now
      if (dt > 0.5 && dt < 200) {
        fpsWindow.push(1000 / dt)
      }
      if (now - lastLog >= 1000 && fpsWindow.length > 0) {
        const sorted = [...fpsWindow].sort((a, b) => a - b)
        const mid = sorted[Math.floor(sorted.length / 2)]!
        console.log('[InstancedMeshBench] fps median (~1s)', mid.toFixed(1), 'n=', sorted.length)
        setHud({
          webgl2: isWebGL2,
          idleVertsPerInstance: idleVertCount,
          activeVertsPerInstance: activeVertCount,
          vertsSubmittedPerFrame,
          fpsMedian: mid,
          fpsSampleCount: sorted.length,
        })
        fpsWindow.length = 0
        lastLog = now
      }
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (renderer.domElement.parentElement === el) {
        el.removeChild(renderer.domElement)
      }
      meshIdle.dispose()
      meshActive.dispose()
      geoIdle.dispose()
      geoActive.dispose()
      matIdle.dispose()
      matActive.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative box-border h-[min(85vh,820px)] w-full min-h-[360px] min-w-[480px] bg-neutral-950"
    >
      {hud ? (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[min(420px,92vw)] rounded-md border border-white/15 bg-black/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/90">
          <div className="text-white/60">P8.0 · dual InstancedMesh bench</div>
          <div>WebGL2: {hud.webgl2 ? 'yes' : 'no'}</div>
          <div>
            instances × (idle verts + active verts) = {BENCH_INSTANCE_COUNT.toLocaleString()} × (
            {hud.idleVertsPerInstance} + {hud.activeVertsPerInstance}) → ~{hud.vertsSubmittedPerFrame.toLocaleString()}{' '}
            verts/frame
          </div>
          <div>
            fps median (~1s): <span className="text-emerald-300">{hud.fpsMedian.toFixed(1)}</span> (n=
            {hud.fpsSampleCount})
          </div>
          <div className="mt-1 text-white/50">
            Record this story on desktop dGPU + iGPU / throttled laptop; write medians into docs/project_docs/「Phase 8 基线 P8.0 性能与 P8.4 准入.md」.
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 font-mono text-[11px] text-white/70">
          Warming up…
        </div>
      )}
    </div>
  )
}
