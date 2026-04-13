# Phase 3.5 粒子星系（Points + 自定义 Shader）— 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 3.5「粒子星系（宏观层）」  
> **规范依据**: 计划 §3.5、`frontend-threejs.mdc`（宏观层：`THREE.Points` + 自定义 `ShaderMaterial`、单 draw call、顶点含 size / color / emissive，片元圆形 + 径向辉光、HDR emissive 供 Bloom）、《TMDB 电影宇宙 Tech Spec.md》§4.3A（`x/y/z`、`size`、`genre_color`、`emissive`）  
> **报告日期**: 2026-04-14  
> **范围**: **`frontend/src/three/galaxy.ts`**、**`frontend/src/three/shaders/point.vert.glsl`**、**`frontend/src/three/shaders/point.frag.glsl`**；扩展 **`scene.ts`** 挂载粒子并维护 **`uPixelRatio`**；**`App.tsx`** 传入 **`data.movies`**；新增 **`src/vite-env.d.ts`** 声明 **`*.glsl`** 模块以满足 **`tsc`**。  
> **不包含**: Phase 3.6（`EffectComposer` / `UnrealBloomPass`）、Phase 4 交互与 HUD。

---

## 1. 摘要

在用户要求 **先新开 Git 分支再做** 的前提下，从 **`main`** 创建分支 **`phase-3.5-galaxy-points-shaders`**，落实开发计划 **Phase 3.5**：

- 新增 **`createGalaxyPoints(movies, pixelRatio)`**（**`galaxy.ts`**）：将 **`GalaxyData.movies`** 写入 **`BufferGeometry`** 的 **`position`**（3）、**`color`**（3，来自 **`genre_color`**）、**`size`**（1）、**`emissive`**（1）；使用 **`ShaderMaterial`** 引用 **`vite-plugin-glsl`** 导入的顶点 / 片元着色器；返回单个 **`THREE.Points`**，实现 **~60K 粒子 1 draw call** 的宏观层基线。
- 顶点着色器（**`point.vert.glsl`**）：**`gl_PointSize`** 按 **视空间深度**（**`-mvPosition.z`**）与 **`size`**、**`uPixelRatio`** 缩放，并 **`clamp(1.0, 256.0)`** 避免极端值。
- 片元着色器（**`point.frag.glsl`**）：基于 **`gl_PointCoord`** 的圆形 **`discard`**、**`smoothstep` 核心** + **指数型 glow**；输出 **`vColor * vEmissive * (…)`**，使 **`emissive`**（管线约定约 **0.1–1.5**）可产生 **高于 1.0 的 RGB**，为 **Phase 3.6 Bloom** 预留亮度余量。
- **`mountGalaxyScene`** 签名扩展为 **`(container, meta, movies)`**：在场景创建后 **`scene.add(galaxy.points)`**；在 **`resize`** 中同步 **`renderer.setPixelRatio(min(dpr, 2))`** 与 **`material.uniforms.uPixelRatio`**；**`dispose`** 时 **`galaxy.points.removeFromParent()`** + **`galaxy.dispose()`**（释放 **geometry / material**），再 **`renderer.dispose()`**。
- **TypeScript**：新增 **`frontend/src/vite-env.d.ts`**，**`declare module '*.glsl'`**，解决 **`import … from '*.glsl'`** 的 **`tsc`** 解析。

**Git 提交（Phase 3.5）**: **`d2bb1b0`** — `feat(frontend): Phase 3.5 galaxy Points + custom point shaders`。

**关于计划中的「Step A / Step B」验收**：计划建议先用 **`PointsMaterial`** 做降级验证，再换自定义 Shader。项目中 **Phase 3.0**（**`scripts/verify_galaxy_3d.html`**）已用 **`PointsMaterial` + `vertexColors`** 验证过坐标与配色；本次交付 **直接落地 Step B（ShaderMaterial）**，未在 Vite 应用内保留可切换的 **`PointsMaterial`** 分支。若需本地回归「纯红球点云」开关，可在后续加环境变量或查询参数单独迭代。

---

## 2. Git 与分支

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 工作分支 | **`phase-3.5-galaxy-points-shaders`** |
| Phase 3.5 提交 | **`d2bb1b0`** — `feat(frontend): Phase 3.5 galaxy Points + custom point shaders` |

---

## 3. 执行操作清单（按时间顺序）

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | `git checkout -b phase-3.5-galaxy-points-shaders` | 满足「新开分支再做」 |
| 2 | 新增 **`frontend/src/three/shaders/point.vert.glsl`** | **`gl_PointSize`**、**`uPixelRatio`**、**`size` / `color` / `emissive`** 属性 |
| 3 | 新增 **`frontend/src/three/shaders/point.frag.glsl`** | 圆形 + glow + **`vColor * vEmissive`** |
| 4 | 新增 **`frontend/src/three/galaxy.ts`** | **`fillMovieBuffers`** + **`createGalaxyPoints`**；**`console.log`** 粒子数与 **1 draw** 说明 |
| 5 | 修改 **`frontend/src/three/scene.ts`** | **`mountGalaxyScene(..., movies)`**；**`resize`** 更新 **pixel ratio** 与 **uniform**；**`dispose`** 释放粒子资源 |
| 6 | 修改 **`frontend/src/App.tsx`** | **`mountGalaxyScene(el, data.meta, data.movies)`** |
| 7 | 新增 **`frontend/src/vite-env.d.ts`** | **`*.glsl` → `string`** 模块声明 |
| 8 | **`npx tsc --noEmit -p tsconfig.app.json`**、**`npm run build`** | 类型检查与生产构建通过 |

---

## 4. 与开发计划 Phase 3.5 的对照

| 计划项 | 结果 |
| --- | --- |
| **`frontend/src/three/galaxy.ts`** — **`THREE.Points`** + **`BufferAttribute`**（**position, size, color, emissive**） | ✅ |
| **`frontend/src/three/shaders/point.vert.glsl`** — **`gl_PointSize`** + 与相机距离相关衰减 | ✅（**`500.0 / max(0.001, -mvPosition.z)`** × **`size`** × **`uPixelRatio`**） |
| **`frontend/src/three/shaders/point.frag.glsl`** — 圆形 + 径向辉光 + **`discard`** + **HDR emissive** 意图 | ✅ |
| Console：**`[Galaxy] Points count: {n} \| draw calls: 1`** | ✅ |
| 计划中 Step A（**`PointsMaterial`** 红球）在应用内再跑一遍 | ⚪ **未在 Vite 内实现**；**Phase 3.0** 已用 **`PointsMaterial`** 做过等价验证（见 §1） |

**本 Phase 明确未实现的内容**（属后续计划）：

- **Phase 3.6**：**`EffectComposer`**、**`UnrealBloomPass`**（阈值 / strength / radius 等）
- **Phase 4**：Raycaster、Tooltip、Drawer、时间轴、选中态行星等

---

## 5. 交付文件与实现要点

### 5.1 新增 / 修改文件一览

| 路径 | 作用 |
| --- | --- |
| `frontend/src/three/galaxy.ts` | **`GalaxyPointsHandle`**（**`points` / `material` / `dispose`**）；**`createGalaxyPoints`** |
| `frontend/src/three/shaders/point.vert.glsl` | 粒子顶点：**`vColor` / `vEmissive`** 传入片元；**`gl_PointSize`** |
| `frontend/src/three/shaders/point.frag.glsl` | 片元：圆形裁切 + core/glow；**`gl_FragColor`** |
| `frontend/src/three/scene.ts` | 集成 **`createGalaxyPoints`**；**`resize`** 同步 **DPR**；**`dispose`** 释放粒子 |
| `frontend/src/App.tsx` | 传入 **`data.movies`** |
| `frontend/src/vite-env.d.ts` | **`declare module '*.glsl'`**，配合 **`vite-plugin-glsl`** 与 **`tsc`** |

### 5.2 数据与 GPU 属性映射

| JSON / `Movie` 字段 | `BufferAttribute` | 说明 |
| --- | --- | --- |
| `x`, `y`, `z` | **`position`** (vec3) | UMAP XY + 小数年份 Z |
| `genre_color[3]` | **`color`** (vec3) | 归一化 sRGB **[0, 1]**（Loader 已校验） |
| `size` | **`size`** (float) | 管线映射自 **`log10(vote_count+1)`** → **[2, 25]** |
| `emissive` | **`emissive`** (float) | 管线映射自 **`vote_average`** → **约 [0.1, 1.5]** |

### 5.3 渲染状态（`ShaderMaterial`）

- **`transparent: true`**、**`depthTest: true`**、**`depthWrite: false`**、**`NormalBlending`**：减轻密集粒子互相遮挡时的硬边与写入顺序问题；具体观感可在 Phase 3.6 与 Bloom 联调时再细调。

### 5.4 与 Phase 3.4 的 API 差异

- **Phase 3.4**：**`mountGalaxyScene(container, meta)`**  
- **Phase 3.5 起**：**`mountGalaxyScene(container, meta, movies)`** — 调用方需传入与 **`meta.count`** 一致的 **`movies`** 数组（由 **`loadGalaxyData`** 保证）。

---

## 6. 验收与复现

### 6.1 准备数据

将管线输出的 **`galaxy_data.json`** 置于 **`frontend/public/data/galaxy_data.json`**（与 Phase 3.3 起一致）。

### 6.2 命令

在 **`frontend/`** 目录：

```bash
npm run dev
```

或：

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

### 6.3 预期现象

- 应用 **`ready`** 后：全屏黑色背景上可见 **彩色粒子云**（颜色随 **`genre_color`**），粒子 **尺寸与亮度** 随 JSON 的 **`size` / `emissive`** 变化，而非单一红色或等大圆点（与 Phase 3.0 纯 **`PointsMaterial`** 相比，视觉差异明显）。
- **DevTools Console**：
  - 既有 **`[GalaxyData] Loaded …`**（Phase 3.3）
  - 新增 **`[Galaxy] Points count: {n} | draw calls: 1 (single Points mesh)`**
  - 既有 **`[Scene] Renderer: WebGL2 | …`**（Phase 3.4）
- 若 **GLSL 编译失败**：浏览器 Console 会出现 **WebGL / shader 编译错误**，不会静默失败。

### 6.4 性能与规模说明

- 当前仍为 **单 mesh、单材质、单 draw** 的 **`Points`**；全量 **~60K** 粒子时，帧率受 GPU / 填充率 / 片元 overdraw 影响，需结合 Phase 3.6（分辨率、Bloom、tone mapping）与后续 profiling 再优化。

---

## 7. 后续建议（非本次范围）

1. **Phase 3.6**：接入 **Bloom** 后，根据 **threshold** 与 **`emissive`** 分布微调片元中的 **亮度系数**，避免过曝或光晕过弱。  
2. **可选**：增加 **`VITE_GALAXY_SIMPLE_POINTS`** 或 URL 参数，一键切回 **`PointsMaterial`**，便于在无 Bloom 时快速回归「仅几何是否正确」。  
3. **Phase 4**：Raycaster 需与 **`Points`** 的 **`size`** / 屏幕投影一致；若拾取不准，可能需要共享 **`gl_PointSize`** 逻辑或使用 **`THREE.Points`** 的拾取辅助策略。

---

## 8. 附录：关键代码引用（便于审阅）

以下为实施后的核心接口与挂载方式（以仓库 **`d2bb1b0`** 为准，若后续提交有改动请以 Git 为准）。

**`createGalaxyPoints` 与材质选项**（`frontend/src/three/galaxy.ts`）：

```51:77:frontend/src/three/galaxy.ts
export function createGalaxyPoints(
  movies: Movie[],
  pixelRatio: number,
): GalaxyPointsHandle {
  const geometry = fillMovieBuffers(movies)

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader: pointVertexShader,
    fragmentShader: pointFragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })

  const points = new THREE.Points(geometry, material)

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { points, material, dispose }
}
```

**`App.tsx` 传入 `movies`**：

```20:26:frontend/src/App.tsx
  useEffect(() => {
    if (status !== 'ready' || !data) return
    const el = canvasHostRef.current
    if (!el) return
    const mount = mountGalaxyScene(el, data.meta, data.movies)
    return () => mount.dispose()
  }, [status, data])
```

---

*报告结束。*
