# Phase 6.2 · I4 深度/前后关系修复 — 实施报告

**SUPERSEDED by P6.2.2** — 宏观层已改为单 pass 不透明圆点 + OKLCH；Bloom / 深度预通 / `alphaTest` 路径不再作为默认架构。见 `phase_6_i1_i3_i4` Plan **P6.2.2** 与当前 `frontend/src/three/galaxy.ts`。

> 对应 Plan A **P6.2**：依据 [Phase 6.1 I3+I4 根因调查 报告](Phase%206.1%20I3%2bI4%20%E6%A0%B9%E5%9B%A0%E8%B0%83%E6%9F%A5%20%E6%8A%A5%E5%91%8A.md) 在 `frontend/src/three/galaxy.ts` 落地 I4 修复；目标为恢复「相机深度优先」的遮挡关系，同时用 **M1** 的 `alphaTest` 缓解软边对深度写入的干扰。

## 1. 背景与选型

| 项目 | 说明 |
|------|------|
| 根因（P6.1 I4） | 银河粒子使用 `ShaderMaterial`：`transparent: true` 且原 **`depthWrite: false`** 时，同一条 `Points` 内多依赖 **buffer/绘制顺序** 而非片元深度，表现为近处点被远处点错误覆盖。 |
| 本轮方案 | **M1**（报告 §3.3 / §5.3）：**`depthWrite: true` + `alphaTest`**。未采用 M2（CPU 重排）/ M4（按层分 mesh），留作 M1 不可接受时升级。 |
| 未改文件 | `point.vert.glsl` / `point.frag.glsl` 未改；片元已输出 `gl_FragColor.a`，与 `alphaTest` 兼容。 |

## 2. 代码变更摘要

| 位置 | 变更 |
|------|------|
| `createGalaxyPoints` → `ShaderMaterial` | `depthWrite: false` → **`true`** |
| 同上 | 新增 **`alphaTest`**，取值为导出常量 **`GALAXY_POINT_ALPHA_TEST`（0.5）** |
| 文件顶部 | 新增 `GALAXY_POINT_ALPHA_TEST` 及 JSDoc（可 **0.35–0.55** 微调以在「硬边 / Bloom 退化」与深度正确性之间折中） |

实现意图简述：

- **写深度**：让近处点片元通过 `depthTest` 后更新深度，远处后绘不再轻易盖住近处（解决 I4 主诉）。
- **alphaTest**：裁掉过低的 alpha 边缘，避免过薄半透明层在深度上产生毛刺性噪声；与 P6.1 诊断步骤中的 M1 参数（0.5 量级）一致。

## 3. 回归与验收（建议仍人工确认）

Plan 与 P6.1 对 **Bloom**、**三层 Z slab 着色**、**视距窗口过渡** 有验收预期；本变更仅触及深度与 `alphaTest`，逻辑上**不应**需要改 `uZCurrent` / `uZVisWindow` 的 uniform 管线。建议在合并前自行：

- 本地 `npm run dev` 目检：近/远遮挡是否明显改善。
- 关注光晕外缘是否**偏硬**；若可接受性下降，**下调** `GALAXY_POINT_ALPHA_TEST` 做小幅调参，仍不足再按报告评估 M2 / M4。

## 4. 分支与提交（参考）

- 工作分支名示例：`phase-6-2-i4-depth-fix`（以仓库实际记录为准）。
- 提交为 **`galaxy.ts` 单文件** 的功能提交（I4 M1：depthWrite + alphaTest），不含本实施报告时也可独立存在；本报告用于归档与 P6.5 全量回归对照。

## 5. 后续

- **P6.3**（I3 hover / threshold）仍独立在 `interaction.ts` 等路径。
- **P6.5** 建议在最终主数据上再次共测 I3 + I4。

---

*与 `phase_6_i1_i3_i4_adfb5e1b.plan` P6.2 对齐 · 2026-04-22*
