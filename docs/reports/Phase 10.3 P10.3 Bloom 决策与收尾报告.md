# Phase 10.3（P10.3）— Bloom 默认开 — **决策与收尾报告**

> **性质**：产品/工程收尾记录（非「Bloom 上线」实施报告）。  
> **日期**：2026-04-28  
> **计划来源**：`.cursor/plans/phase_10_global_remap_1b67de2d.plan.md`（§ P10.3；§ P10.4 中与 Bloom-on 绑定部分一并取消）

---

## 1. 原计划摘要（P10.3）

| 计划项 | 说明 |
|--------|------|
| 目标 | 在 `scene.ts` 中将 `UnrealBloomPass` **默认接入** `EffectComposer`（`postFxBloomEnabled = true`，初始化 `composer.addPass(bloomPass)`） |
| 参数 | `strength / radius / threshold` 初值保持 **0.95 / 0.52 / 0.82**（与 `TMDB 电影宇宙 Tech Spec.md` §1.2 叙述一致） |
| 调试 | 保留 `window.__bloom.disable()` 等接口 |
| 依赖 | 与 P10.1（`uLMax` 等）、P10.2（idle alpha 与距离衰减）在同一视觉栈上叠加验收 |

---

## 2. 已执行过的工程操作（时间线）

以下反映仓库内曾进行或讨论过的 **P10.3 相关代码路径**（具体以当前 `main` / 合并分支上的 `git log` 为准）。

1. **实现「Bloom 默认开」**（独立分支，例如 `phase-10-p103-bloom-default-on`）：在 `frontend/src/three/scene.ts` 中于 `RenderPass` 之后 **`composer.addPass(bloomPass)`**，并将 **`postFxBloomEnabled = true`**，渲染循环走 **`composer.render()`**。
2. **调参与对照**：通过 `window.__bloom` 调整 `threshold` / `strength` / `radius`；与 [three.js `webgl_postprocessing_unreal_bloom_selective`](https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html) 的「柔和大光晕」进行主观对照（用户明确 **不需要** 该示例的 selective 分层逻辑，仅追求观感对齐）。
3. **现象记录**：开关 Bloom 可感知差异（例如背景场轻微闪烁等），但 **未**出现预期中的 **沿物体周围明显延展的泛光晕**；在现有「极小 footprint 透明 idle icosphere + 默认 LDR composer」管线下调参无法达到官方示例级观感。
4. **根因归纳（工程结论）**：
   - **内容尺度**：背景星在屏幕上多为 **极少像素** 的高亮，Bloom 可扩散的「原料」过薄，与示例中大球体 + IBL + 大面积高光 **不在同一量级**。
   - **管线差异**：官方柔和大光晕示例依赖 **HalfFloat RT、tone mapping + exposure、`OutputPass`** 等整条 HDR/合成链；当前生产路径为 **`new EffectComposer(renderer)` + `RenderPass` +（可选）`UnrealBloomPass`**，且 idle **透明混合**会拉低写入 RT 的有效亮度，进一步削弱泛光。
   - **若要「观感对齐」**：需 **独立需求评审**（HDR composer、可能的双 composer、输出色彩路径、与 P8 性能基线再对齐、以及是否改几何/软边材质等），**改动面与风险显著大于** Phase 10 原计划中的「uniform + 默认开关」范围。

---

## 3. 视觉验收结论

| 项 | 结论 |
|----|------|
| 是否达到产品可用的 Bloom 观感 | **否** — 当前 pipeline 下 **无法作为默认后处理交付** |
| 与官方示例级「柔和大光晕」 | **不对齐**；在不重做管线的前提下 **不预期可对齐** |
| 副作用 | 曾观察到 **背景场随 Bloom 开关变化的闪烁/噪声感**（程度因设备与参数而异），接受度不足 |

---

## 4. 最终决策（产品 + 工程）

1. **P10.3 交付形态**：**不**将 Bloom 作为生产默认；**未来里程碑不将 `UnrealBloomPass` 作为产品叙事依赖**（即：**未来默认不走 Bloom**）。
2. **代码保留策略**：
   - **保留** `UnrealBloomPass` 实例与 **`window.__bloom`**（`enable` / `disable`、读写 `strength` / `radius` / `threshold`、`log`），便于本地、Storybook 或临时对比。
   - **生产默认**：**关闭** — `postFxBloomEnabled = false`，初始化 **仅** `composer.addPass(renderPass)`，**不**在首帧 `addPass(bloomPass)`；主循环在关闭态使用 **`renderer.render(scene, camera)`**。
3. **文档与计划**：
   - **本报告**为 P10.3 **唯一**收尾说明；`.cursor/plans/phase_10_global_remap_1b67de2d.plan.md` 中 **p103** 标为 **completed**（内容更新为收尾说明）、**p104** 中与 **「Bloom 默认 on / Tech Spec 改 on」** 绑定项标为 **cancelled**。
   - `docs/project_docs/视觉参数总表.md` §5 已描述 Bloom **默认关闭** + `window.__bloom.enable()` 打开 — **与代码一致，无需因 P10.3 再改**。
   - `TMDB 电影宇宙 Tech Spec.md` §1.2 仍以 **技术方案与参数区间** 描述 `UnrealBloomPass`；**产品默认以后处理与本文为准**（不在本次强制改写 Tech Spec 默认态语句，避免与历史 §1.2 技术叙述冲突；若日后要精简文档，可单开「文档去 Bloom 叙事」任务）。

---

## 5. 代码锚点（收尾态）

| 文件 | 说明 |
|------|------|
| `frontend/src/three/scene.ts` | `EffectComposer` + `RenderPass` + `UnrealBloomPass` 构造；**默认**不 `addPass(bloomPass)`；`window.__bloom` 挂载；注释指向本报告 |
| `frontend/src/three/galaxyMeshes.ts` | P10.1 / P10.2 **保留**；P10.2 中关于「避免 bloom 泄漏」的 alpha 策略 **仍**对将来若临时 `enable()` Bloom 有工程意义 |

---

## 6. 后续若需「发光感」的替代方向（不在本次范围）

仅作 backlog **备忘**，不构成承诺：

- **Shader 内**软边、晕圈 disc、或 **非后处理** 的 emissive 层；
- **独立 PRD** 评审后再动 **HDR 全链**（HalfFloat、`OutputPass`、tone mapping/exposure 与性能回归）。

---

## 7. 相关链接

- Phase 10 总计划（已同步 P10.3/P10.4 状态）：`.cursor/plans/phase_10_global_remap_1b67de2d.plan.md`
- Three.js 参考示例（观感对照用）：[webgl_postprocessing_unreal_bloom_selective](https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html)

---

**结论一句话**：P10.3 经历实现与验收后 **正式收尾为「Bloom 不默认、未来产品不依赖 Bloom」**；管线代码与调试接口 **保留**，完整决策与操作以 **本文** 为准。
