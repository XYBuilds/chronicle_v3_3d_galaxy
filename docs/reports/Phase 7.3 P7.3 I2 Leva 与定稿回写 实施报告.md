# Phase 7.3 · P7.3 I2 Leva 与定稿回写 — 实施报告

> 对应 [Phase 7 plan（I2 + I5 + I6）](../../.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md) 中的 **P7.3（I2 人工扫参）**：在 P7.1 总表结论（uniform 常调项 ≥10，建议 dev-only GUI）基础上，引入 **`leva`** 的 dev-only 扫参面板；将用户定稿的宏观参数回写源码，并同步 **视觉参数总表**、**Tech Spec**、**Design Spec** 相关小节。

## 1. 做了什么事

| 项目 | 说明 |
|------|------|
| **Git 分支** | 在分支 **`feat/p7-3-i2-leva-visual-tune`** 上完成实现与文档提交（与 P7.1/P7.2 报告惯例一致：便于 review 与 cherry-pick）。 |
| **dev-only Leva（不入生产 bundle 路径）** | [`frontend/package.json`](../../frontend/package.json) 增加 **`leva`** 为 **devDependency**。 [`GalaxyThreeLayerLab.tsx`](../../frontend/src/storybook/GalaxyThreeLayerLab.tsx) 在 **`import.meta.env.DEV`** 下通过 **`React.lazy`** 加载 [`GalaxyThreeLayerLabLevaHost.tsx`](../../frontend/src/storybook/GalaxyThreeLayerLabLevaHost.tsx)，外层 **`Suspense`**；非 DEV（含 `npm run build`、`build-storybook`）仅渲染 Core，避免生产 Storybook 依赖 Leva。 |
| **场景挂载拆分** | 原 Storybook 挂载与 uniform 同步逻辑迁至 [`GalaxyThreeLayerLabCore.tsx`](../../frontend/src/storybook/GalaxyThreeLayerLabCore.tsx)；Leva 面板读取/同步控件后向 Core 传合并后的 props。 |
| **Leva 面板范围** | 命名空间 **`Galaxy · I2 (P7.3)`**：宏观（`zCurrent`、`zVisWindow`、`uFocusSizeMul`、`uBgSizeMul`、`uLMin`/`uLMax`/`uChroma`、`uSizeScale`）、Bloom（开关与 strength/radius/threshold）、Perlin 星球（`selectedMovieId` 下拉、`planetUScale` / octaves / persistence / threshold）。Storybook **args 变更**时通过 **`useEffect` + `set`** 与 Leva 对齐。 |
| **Storybook 默认与量程** | [`GalaxyThreeLayerLab.stories.tsx`](../../frontend/src/storybook/GalaxyThreeLayerLab.stories.tsx) 的 **默认 args** 与 **Controls** 量程与定稿及 Leva 一致（例如 `uBgSizeMul` 支持极小步进）。文档说明已注明 dev 用 Leva、静态 Storybook 用 args。 |
| **定稿数值回写（源码）** | 提交 **`f0cd533`**（`tune(I2): …`）：**`uBgSizeMul = 0.001`**、**`uFocusSizeMul = 0.2`**（[`galaxy.ts`](../../frontend/src/three/galaxy.ts) ShaderMaterial uniforms）；**`zCamDistance = 30`** 为 **`mountGalaxyScene` 常量**，**不再**使用 `max(2, zSpan*0.045+1.2)`（[`scene.ts`](../../frontend/src/three/scene.ts)）；Zustand 默认 **`galaxyInteractionStore.ts`** 同步为 **30**。 |
| **文档回写** | 提交 **`a832cb9`**（`docs(P7.3): …`）：更新 [`docs/project_docs/视觉参数总表.md`](../project_docs/视觉参数总表.md)（定稿说明、行号、§8 Storybook/Leva、§11.2 实施记录、附录定稿表、防回归表）；[`TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §1.4.1 `zCamDistance` 与 §1.1 A/B 层表（对齐 `uBgSizeMul`/`uFocusSizeMul` 实现，废弃文档中过时的 `uBgPointSizePx` 表述）；[`TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) §2.1 `zCamDistance` 与粒子分层一句定稿说明。 |
| **质量 gate** | 实施过程中 **`npm run lint -w frontend`**、**`npm run build -w frontend`**、**`npm run build-storybook -w frontend`** 均通过。 |

### 1.1 定稿常数一览（与源码一致）

| 名称 | 定稿值 | 主要源码位置 |
|------|--------|----------------|
| `zCamDistance` | **30**（世界单位，与 `zSpan` 解耦） | `frontend/src/three/scene.ts` 挂载；`frontend/src/store/galaxyInteractionStore.ts` 默认 |
| `uFocusSizeMul` | **0.2** | `frontend/src/three/galaxy.ts` |
| `uBgSizeMul` | **0.001** | `frontend/src/three/galaxy.ts` |

## 2. 未纳入本次的范围

- **主应用 `localhost:5173` 内嵌 Leva**：当前 Leva 仅挂在 **Storybook `GalaxyThreeLayerLab`** 路径；主站未增加全局调参面板（与 plan 中「Storybook 场景扫参」一致，可按需后续加 dev 路由）。  
- **P7.4 / P7.5**：INFO 按键 UI、Phase 7 收尾汇总未在本次实施。  
- **其余 I2 旋钮**：Bloom、Perlin、HUD、FOV 等未改定稿值；仅文档中与宏观定稿强相关的段落已同步。

## 3. 验收对照（计划 P7.3 条目）

- [x] 按 P7.1 结论引入 **dev-only** GUI（**`leva`**），且由 **`import.meta.env.DEV`**（+ lazy）控制，生产构建不依赖该路径。  
- [x] Storybook **`GalaxyThreeLayerLab`** 场景下可调宏观 / Bloom / Perlin 相关项。  
- [x] **定稿数值**已回写 **`galaxy.ts` / `scene.ts` / `galaxyInteractionStore.ts`**，并与 Storybook 默认对齐。  
- [x] **Tech Spec / Design Spec** 及 **视觉参数总表** 已同步相关小节。  
- [ ] **用户侧肉眼复测**（三层层次、Bloom 策略、C 层边界等）建议在本地 **`npm run storybook -w frontend`** 与完整数据 **`npm run dev`** 各走一遍；本报告不替代主观验收签字。

## 4. 相关提交（参考）

| 提交 | 摘要 |
|------|------|
| `3b6d06f` | `feat(p7.3): dev-only Leva panel for Galaxy three-layer lab (I2 tuning)` |
| `f0cd533` | `tune(I2): uBgSizeMul 0.001, uFocusSizeMul 0.2, zCamDistance fixed 30` |
| `a832cb9` | `docs(P7.3): sync 视觉参数总表 + Tech/Design Spec with finalized I2 values` |

## 5. 相关链接

- Plan：[`.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md`](../../.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md)  
- 视觉参数总表：`docs/project_docs/视觉参数总表.md`  
- 前置报告：[Phase 7.1 P7.1 I2 视觉参数总表 实施报告](./Phase%207.1%20P7.1%20I2%20视觉参数总表%20实施报告.md)
