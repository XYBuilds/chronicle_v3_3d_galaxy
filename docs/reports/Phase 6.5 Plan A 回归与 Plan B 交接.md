# Phase 6.5 · Plan A 回归与 Plan B（Phase 7）交接

> 对应 [phase_6_i1_i3_i4_adfb5e1b.plan.md](../../.cursor/plans/phase_6_i1_i3_i4_adfb5e1b.plan.md) **P6.5**：在 **P6.4 I1 最终数据** 定稿后做自动化回归，并给 **Plan B = Phase 7（I2 + I5 + I6）** 留下交接面。

## 1. 最终主数据指纹（`frontend/public/data/galaxy_data.json`）

| 字段 | 值 |
|------|-----|
| **meta.version** | `2026.04.23` |
| **meta.generated_at** | `2026-04-23T20:09:27.581035+00:00` |
| **meta.count** | 59014（与 `movies` 条数一致，`validate_galaxy_json.py` 已通过） |
| **meta.embedding_model** | `paraphrase-multilingual-mpnet-base-v2`（768d mpnet） |
| **meta.umap_params** | `densmap: true`, `n_neighbors: 100`, `min_dist: 0.4`, `metric: cosine`, `random_state: 42` |
| **meta.xy_range** | 以 JSON 内为准（UMAP 重训后范围已更新；拾取为 **屏幕空间圆盘**，不依赖 `xy_range` 推导 threshold） |

**归档对照**：仓库中另有 `frontend/public/data/galaxy_data.densmap384.json(.gz)`（git 未跟踪或按需保留）可作 384d 时期对比；**生产加载路径仍以 `galaxy_data.json` 为准**。

## 2. 自动化回归（本分支已执行）

| 检查 | 结果 |
|------|------|
| `python scripts/validate_galaxy_json.py --input frontend/public/data/galaxy_data.json` | OK |
| `npm run build`（`frontend/`，含 `tsc -b` + `vite build`） | 通过 |
| `npm run lint` | 通过 |

## 3. I3 / I4 人工复测清单（建议在最终数据上再做一轮）

以下需在浏览器（`npm run dev` 或 Storybook `GalaxyThreeLayerLab`）中目检；本次 agent 未替代主观验收。

### I3（P6.3.1 屏幕空间圆盘）

- [ ] 鼠标仅在**可见圆盘内**触发 hover / tooltip；盘外 1px 级不误拾。
- [ ] 同屏多星重叠处稳定命中 **front-most**（视觉上最近的星）。
- [ ] **仅焦点 Z slab** 可 hover/click；时间轴滚到背景层时，背景小点不可点（Phase 5.1.7）。
- [ ] 控制台调节 `window.__galaxyPointScale`（`scale` / `focusSizeMul`）后，hover 半径与视觉**立即一致**（uniform 同源）。

### I4（P6.2.2 单 pass 不透明）

- [ ] 近处星遮挡远处星符合直觉（`depthWrite: true` + 圆盘 discard）。
- [ ] 选中飞入/飞出（600–800ms）无透明度闪烁；`visible` 硬切与 [Phase 6.3.1](Phase%206.3.1%20hover%20%E5%9C%86%E7%9B%98%E6%8B%BE%E5%8F%96%20%E5%AE%9E%E6%96%BD%E6%8A%A5%E5%91%8A.md) 所述方案 X 一致。

### I1（坐标分布）

- [ ] 加载无报错；高密度区域相对旧 384d 主数据更易辨认（主观对比 `densmap384` 归档）。

### 可选

- [ ] `window.__bloom.enable()` / `disable()`：Bloom revive 与当前默认直渲切换无报错。

## 4. Tech Spec / Design Spec 与实现差异（Phase 7 文档回写待办）

实现与 **`.cursor/rules/frontend-threejs.mdc`** 已对齐 **P6.2.2 + P6.3.1**；下列 Spec 章节仍偏 **Phase 5 前 Bloom / Raycaster / emissive** 叙述，**不代表当前代码**。P7.3 扫参定稿时建议一并修订，避免对外文档与仓库行为不一致。

| 文档 | 建议对齐点 |
|------|------------|
| [TMDB 电影宇宙 Tech Spec.md](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) | §1.1：`emissive` → GPU 为 `voteNorm`，颜色在顶点 **OKLCH** 重算；宏观层无 core/halo HDR；选中无 Points alpha ramp。§1.2：Bloom **默认不接入** composer，直渲 + `SRGBColorSpace`；`window.__bloom` revive。§1.1 `depthWrite` / §1.5：拾取为 **CPU 屏幕圆盘**（非 `Raycaster` / 非 `Points.threshold`）。§4 schema 表：`emissive` 字段仍为 JSON 契约名，语义为 vote_average 映射；前端 attribute 名为 `voteNorm`。 |
| [TMDB 电影宇宙 Design Spec.md](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) | 三层表中 A/B 的「径向辉光 + emissive + Bloom」改为 **P6.2.2** 口径：焦点内外**同色**，仅 **size** 随 slab 变化；Bloom 为可选 revive。 |

## 5. Plan B（Phase 7）— I2 参数总表入口（供 P7.1 扫描）

以下文件含 **可调视觉 / 交互常量**，与 [phase_7_i2_i5_i6_05eeb9b1.plan.md](../../.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md) P7.1 清单一致；**当前默认值**摘自 `galaxy.ts` 与 scene 内 debug 钩子。

| 区域 | 主要入口 |
|------|----------|
| 粒子尺寸 / slab | `frontend/src/three/galaxy.ts`：`DEFAULT_POINT_SIZE_SCALE`（0.3）、`uFocusSizeMul`（1.0）、`uBgSizeMul`（0.4）、`gl_PointSize` 内常数 `500.0`（与 `interaction.ts` 耦合） |
| OKLCH | `galaxy.ts`：`uLMin`（0.4）、`uLMax`（0.85）、`uChroma`（0.15）；运行时 `window.__galaxyColor`（见 `scene.ts`） |
| 相机 / 时间窗 | `frontend/src/store/galaxyInteractionStore.ts`、`frontend/src/three/scene.ts`（FOV、near/far、`zVisWindow` 等） |
| 片元圆盘边缘 | `frontend/src/three/shaders/point.frag.glsl`（`r > 1.0` discard、`smoothstep(0.95, 1.0, r)`） |
| Bloom（revive） | `frontend/src/three/scene.ts`：`UnrealBloomPass` 参数与 `window.__bloom` |
| 选中星球 | `frontend/src/three/planet.ts`、`scene.ts` 内 fly-to 时长与 easing |

**Phase 7 前置条件**（摘自 Phase 7 plan）：启动 P7.3 前确认 `meta.umap_params` 含 `densmap=true`、`n_neighbors=100` 且 `meta.version` 已 bump — **当前主数据已满足**。

## 6. 相关链接

- Plan A： [.cursor/plans/phase_6_i1_i3_i4_adfb5e1b.plan.md](../../.cursor/plans/phase_6_i1_i3_i4_adfb5e1b.plan.md)
- Plan B / Phase 7： [.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md](../../.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md)
- I3 实施细节： [Phase 6.3.1 hover 圆盘拾取 实施报告.md](Phase%206.3.1%20hover%20%E5%9C%86%E7%9B%98%E6%8B%BE%E5%8F%96%20%E5%AE%9E%E6%96%BD%E6%8A%A5%E5%91%8A.md)
