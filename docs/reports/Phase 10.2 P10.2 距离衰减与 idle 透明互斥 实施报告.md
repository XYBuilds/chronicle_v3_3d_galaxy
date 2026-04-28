# Phase 10.2（P10.2）— 距离衰减与 idle 透明衰减互斥 — 实施报告

> **范围**：仅 P10.2（Phase 10 子项）。在 idle / active **顶点着色器**中计算 `vDistFalloff`，在 **片段着色器**中按 `uDistanceFalloffMode` 将 falloff 乘到 `rgb`，并对 **idle** 的 alpha 在 mode=1 时改为高不透明区间，避免「远暗 + 低 alpha + Bloom」形成光环泄漏。  
> **不动**：`galaxy_data.json` 契约、实例矩阵语义（世界 Z 仍在 `instanceMatrix[3][2]`）、mesh 拓扑、Bloom 默认开关（仍为 P10.3 项）。  
> **计划来源**：`.cursor/plans/phase_10_global_remap_1b67de2d.plan.md`（P10.2 节）  
> **Git 分支**：`phase-10-p102-distance-falloff`  
> **Git 提交**：`055023f`（首版实现：`feat(P10.2): camera distance falloff and idle alpha mutual exclusion`）；`263d9b9`（**定稿**：`fix(P10.2): Z-slab falloff from uZCurrent+uZVisWindow, not camera depth`）

---

## 1. 目标与边界（计划对齐）

| 计划项 | 最终处理 |
|--------|----------|
| vert 中计算 `vDistFalloff`，经 varying 传入 frag | **已实现**（idle / active 一致） |
| 共享 uniform `uDistanceFalloffK`、`uDistanceFalloffMode` | **已实现**（`galaxyMeshes.makeSharedUniforms`） |
| idle.frag：`rgb` 乘 falloff；mode=1 时 idle alpha 锁高区，与 `1 - vInFocus` 互斥 | **已实现** |
| active.frag：`rgb` 乘 falloff；alpha 恒为 1 | **已实现** |
| Leva / 调试暴露 K 与 mode | **已实现**：`window.__galaxyColor.distanceFalloffK` / `distanceFalloffMode`；Storybook `GalaxyThreeLayerLabLevaHost` 等 |
| 计划原文中 `dCam = length(mvPosition.xyz)` 的相机空间距离 | **已偏离并更正**：见下文「2.2」，按产品要求改为 **世界 Z 相对可见窗上沿** 的 `dz`，保证 **`[uZCurrent, uZCurrent+uZVisWindow]` 内不衰减** |

---

## 2. 数学与参数定稿（最终决策）

### 2.1 符号与已有 uniform（复用）

- **`aZ`**：`instanceMatrix[3][2]`，实例世界 Z（decimal year，与 Phase 5.1.5 宏观轴一致）。  
- **`zHi`**：`uZCurrent + uZVisWindow`，与 idle/active.vert 中原有 `inFocus` 计算共用同一 `zHi` 定义。  
- **`uDistanceFalloffMode`**：`0` 关闭本特性（idle 恢复 P8.4 风格 alpha 路径；`rgb` 不乘 falloff）；`1` 开启。

### 2.2 `vDistFalloff`（定稿，第二次提交更正）

**决策**：衰减仅作用于 **时间轴上超过可见窗上沿** 的实例，使 **宏观可见窗 `[uZCurrent, zHi]` 内亮度不受本项衰减**（`zHi = uZCurrent + uZVisWindow`）。

记：

```text
dz = max(0, aZ - zHi)
vDistFalloff = 1 / (1 + uDistanceFalloffK * dz²)
```

- 当 `aZ ≤ zHi`：`dz = 0` → `vDistFalloff = 1`。  
- **`uDistanceFalloffK` 量纲**：每 **平方世界年**（与 `dz` 同单位）；**不是**视图空间米制距离。  
- **`aZ < uZCurrent`** 的粒子同样满足 `aZ ≤ zHi`，故 **本项不对「窗左侧」加压暗**；若未来需要双侧 Z 衰减，需另开需求。

**历史说明**：`055023f` 首版曾用 `dot(mvPosition.xyz, mvPosition.xyz)`（相机视空间到视点距离平方）；`263d9b9` 按验收要求改为上式。

### 2.3 片段着色器（定稿）

**Idle**（`galaxyIdle.frag.glsl`）：

- `m = clamp(float(uDistanceFalloffMode), 0, 1)`。  
- `rgb`：`c = vColor * mix(1.0, vDistFalloff, m)`。  
- `alpha`：  
  - `m = 0`：`clamp(1.0 - vInFocus, 0.14, 0.95)`（与 P8.4 收尾态一致）。  
  - `m = 1`：`mix(…, clamp(1.0, 0.85, 0.95), m)` → **恒为 0.95**（等价于计划中的「锁高 alpha」，由亮度承担远场变暗，减轻 Bloom 晕圈）。

**Active**（`galaxyActive.frag.glsl`）：

- `c = vColor * mix(1.0, vDistFalloff, m)`，`alpha = 1.0`。

### 2.4 Uniform 默认值（定稿）

| Uniform | 默认值 | 说明 |
|---------|--------|------|
| `uDistanceFalloffK` | **0.0001** | 与计划草案一致；因 `dz` 为世界年，手感需结合宏观 `zCurrent` / 数据 `z_range` 在 Leva 上微调 |
| `uDistanceFalloffMode` | **1** | 与 Phase 10 总验收「远场距离感、mode=1 默认」一致；若需严格对照 P8.4 全画面，可置 `0` |

---

## 3. 工程操作清单（文件级）

| 文件 | 操作摘要 |
|------|----------|
| `frontend/src/three/shaders/galaxyIdle.vert.glsl` | 声明 `uDistanceFalloffK`；`varying vDistFalloff`；主路径用 `dz`/`zHi` 写 `vDistFalloff`；discard 路径 `vDistFalloff = 1` |
| `frontend/src/three/shaders/galaxyActive.vert.glsl` | 同上（与 idle 公式一致） |
| `frontend/src/three/shaders/galaxyIdle.frag.glsl` | `uDistanceFalloffMode`；`rgb` 与 `alpha` 分支逻辑 |
| `frontend/src/three/shaders/galaxyActive.frag.glsl` | `uDistanceFalloffMode`；`rgb` 乘 falloff |
| `frontend/src/three/galaxyMeshes.ts` | `makeSharedUniforms` 增加两 uniform；`console.assert`（`K ≥ 0`，`mode ∈ {0,1}`）；`console.log` 含 P10.2 字段 |
| `frontend/src/three/scene.ts` | `GalaxyColorDebug` 增加 `distanceFalloffK` / `distanceFalloffMode`（setter 将 mode 规范为 0 或 1）；`log()` 输出 |
| `frontend/src/storybook/GalaxyThreeLayerLabCore.tsx` | Props 与 `useEffect` 同步两 uniform |
| `frontend/src/storybook/GalaxyThreeLayerLabLevaHost.tsx` | Leva：`uDistanceFalloffK` 滑条；`uDistanceFalloffMode` 以布尔「distance falloff on」映射 0/1 |
| `frontend/src/storybook/GalaxyThreeLayerLab.stories.tsx` | `args` / `argTypes` 默认值与范围 |

**Git 流程**：在独立分支 `phase-10-p102-distance-falloff` 上开发并提交（符合「先开分支再改」的约定）。

---

## 4. 验证与验收

### 4.1 自动化

- 在 `frontend` 目录执行 **`npm run build`**（`tsc -b && vite build`）：**通过**（含 Z 修正后的提交）。

### 4.2 人眼验收（建议必做）

P10.2 为 **观感与 Bloom 交互** 类改动，自动化难以覆盖计划中的主观项，建议至少：

1. **mode=1（默认）**：拖动时间轴，确认 **`aZ ≤ uZCurrent+uZVisWindow` 的窗内星**不因本项变暗；窗 **未来侧**（`aZ > zHi`）整体变暗。  
2. **Bloom 开启时**（`window.__bloom.enable()` 或 Storybook Bloom 开关）：远场是否 **不再** 呈现半透明式光晕。  
3. **`__galaxyColor.distanceFalloffMode = 0` / `1` 切换**：mode=0 时 idle alpha 应回到 **`1 - vInFocus` 钳位** 行为；切换无崩溃、无明显单帧逻辑错误。

### 4.3 文档与 Phase 10 后续（本报告不替代）

- Phase 10 计划在 **P10.4** 将 `uDistanceFalloffK` / `uDistanceFalloffMode` 等写入 **`docs/project_docs/视觉参数总表.md`** 并与 fps 出口对照；**若尚未执行 P10.4，请以本报告与代码为准做回写**。  
- P10.3（Bloom 默认开）、P10.4（性能与 Tech Spec 同步）**不在本项交付范围内**。

---

## 5. 运行时调参入口（备忘）

| 入口 | 说明 |
|------|------|
| `window.__galaxyColor.distanceFalloffK` | 浮点，建议 `≥ 0` |
| `window.__galaxyColor.distanceFalloffMode` | `0` 或 `1`（写入非 0/1 时规范为 0/1） |
| `window.__galaxyColor.log()` | 打印含 P10.2 字段的一行摘要 |
| Vite dev 下 Storybook **Galaxy three-layer lab** | Leva 面板 P10.2 项 |

---

## 6. 小结

- **交付**：P10.2 距离衰减（**Z 窗上沿外 `dz²` 模型**）+ idle 在 mode=1 时 **高 alpha 与透明衰减互斥** + 全链路 uniform / Leva / `__galaxyColor`。  
- **与计划差异**：距离变量由初版「视空间径向距离」改为「**世界 Z 超出 `uZCurrent+uZVisWindow` 的正向超出量**」，以满足「窗内星不衰减」的产品决策。  
- **后续**：完成 P10.3/P10.4 后，将本节定稿数值同步进视觉总表与 Phase 8 基线出口节。
