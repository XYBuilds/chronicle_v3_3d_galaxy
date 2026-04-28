# Phase 11.2（P11.2）— focus 态非焦点 **idle** 降 chroma / L（乘子定稿）— 实施报告

> **范围**：P11.2「非焦点降 chroma/L」中，**仅**对 **idle** `InstancedMesh` 着色；**active** 层 **不改** L/chroma（非目标 active 仍由 **P11.1** 的 `uFocusNonTargetActiveAlpha` 处理）。  
> **主文件**：`frontend/src/three/galaxyMeshes.ts`、`frontend/src/three/shaders/galaxyIdle.vert.glsl`、`frontend/src/three/scene.ts`；Storybook 接线：`GalaxyThreeLayerLabCore.tsx`、`GalaxyThreeLayerLabLevaHost.tsx`、`GalaxyThreeLayerLab.stories.tsx`  
> **计划来源**：`.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md`（P11.2；实施中采纳用户细化：**idle 降 C/L，active 不受影响**）  
> **定稿日期**：2026-04-28  

---

## 1. 目标与边界

### 1.1 产品目标

| 目标 | 最终处理 |
|------|----------|
| 进入 focus（`uFocusedInstanceId ≥ 0`）后，背景 **idle** 星相对变灰、变暗，突出焦点 | **已实现**：在 `galaxyIdle.vert.glsl` 内对非焦点实例将 **L、C 改为原值 × 系数** |
| **焦点实例**在 idle 层上尺寸已为 0（双 mesh 隐藏策略），不参与 idle 颜色叙事 | 保持既有 `isFocused → sIdle = 0` |
| **active** 星不改变 chroma/L，避免与 P11.1 重复叠加 | **未改** `galaxyActive.vert.glsl` 中 L/C 计算 |

### 1.2 与 P11.1 分工

- **P11.1**：非目标 **active** 的 **alpha** 随 `uFocusCameraBlend` 压到 `uFocusNonTargetActiveAlpha`。  
- **P11.2**：非焦点 **idle** 的 **OKLab L 与 chroma（经 a,b）** 通过乘子衰减；**不向 active 层写入 dim 逻辑**。

---

## 2. 最终技术决策

### 2.1 色彩公式（乘子，非绝对目标值）

在已通过 **P10.1** 评分映射得到 `L_base`、`C_base = uChroma` 之后，当 **dim 生效**时：

- \( L = L_{\mathrm{base}} \times \texttt{uFocusDimL} \)
- \( C = C_{\mathrm{base}} \times \texttt{uFocusDimChroma} \)

GLSL 中用 `dimMix ∈ {0,1}` 与 `mix` 从「原值」过渡到「乘后值」：

```text
L = mix(L_base, L_base * uFocusDimL, dimMix);
C = mix(C_base, C_base * uFocusDimChroma, dimMix);
```

再构造 OKLab \((L, a, b)\)，其中 \(a = C\cos(\mathrm{hue})\)，\(b = C\sin(\mathrm{hue})\)，最后 `oklab_to_linear_srgb` → `linear_to_srgb`。

**说明**：早期草案曾将 `uFocusDimL` 作为「目标 L」直接 `mix`，已按产品反馈改为 **L 乘子**，以保留各星相对明暗关系。

### 2.2 何时启用 dim（idle）

- `dimEligible = modeAllowsDim && (uFocusedInstanceId >= 0) && !isFocused`
- `modeAllowsDim = (uFocusDimMode == 0) || (uFocusDimMode == 1)`：mode **1** 为后续 `selectionMask` 预留，当前与 **0** 行为一致（计划接口占位）。
- **注意**：`uFocusedInstanceId` 在 `scene.ts` 的 `selecting` / `deselecting` 部分阶段为 `-1`，与既有焦点状态机一致；dim 与「已写入 focused id」的帧对齐（与 P11.1 目标 id 时间线同源语境）。

### 2.3 Uniform 与共享材质袋

- 新增 uniform 放在 **`makeSharedUniforms`**（与 P8.4 / P11.1 一致），idle/active **共用同一对象**；仅 **idle 顶点着色器**读取 `uFocusDim*`，active 程序未引用时不影响行为。
- **`uFocusDimMode`**：整型，默认 `0`；占位后续「仅对无 selection 的实例 dim」等扩展。

### 2.4 定稿默认值（用户确认）

| Uniform | 定稿值 | 含义 |
|---------|--------|------|
| `uFocusDimChroma` | **0.7** | 非焦点 idle：chroma 为原来的 70%（适度降饱和） |
| `uFocusDimL` | **1** | 非焦点 idle：**不改变**明度（仅靠 chroma 乘子完成视觉弱化） |
| `uFocusDimMode` | **0** | 当前全场非焦点 idle 在 focus 时参与 dim（mode 1 预留） |

### 2.5 可调参出口（开发）

- `window.__galaxyColor.focusDimChroma` → `uFocusDimChroma`（setter `clamp(0, 1.5)`）
- `window.__galaxyColor.focusDimL` → `uFocusDimL`（setter `clamp(0.05, 1.5)`）
- `window.__galaxyColor.focusDimMode` → `uFocusDimMode`（0/1）
- `window.__galaxyColor.log()` 含 P11.2 一行摘要。

Storybook（dev）Leva：**P11.2 · uFocusDimChroma (C×)**、**P11.2 · uFocusDimL (L×)**；`GalaxyThreeLayerLab.stories` 默认与定稿一致（**0.7 / 1**）。

---

## 3. 涉及文件与操作清单

| 文件 | 操作 |
|------|------|
| `frontend/src/three/galaxyMeshes.ts` | `makeSharedUniforms` 增加 `uFocusDimChroma`、`uFocusDimL`、`uFocusDimMode`；定稿 **0.7 / 1 / 0**；启动 `console.log` 含 P11.2 字段 |
| `frontend/src/three/shaders/galaxyIdle.vert.glsl` | 声明上述 uniform；在 P10.1 `L_base` 之后插入 P11.2 `dimMix` 与 L/C 乘子混合 |
| `frontend/src/three/scene.ts` | 引用 uniform；扩展 `GalaxyColorDebug`；`__galaxyColor` getter/setter 与 `log()` |
| `frontend/src/storybook/GalaxyThreeLayerLabCore.tsx` | props 与 `useEffect` 同步 uniform |
| `frontend/src/storybook/GalaxyThreeLayerLabLevaHost.tsx` | Leva 面板与 `merged` 透传 |
| `frontend/src/storybook/GalaxyThreeLayerLab.stories.tsx` | Controls 默认值 **uFocusDimChroma=0.7，uFocusDimL=1** |

**未修改**：`galaxyActive.vert.glsl` / `galaxyActive.frag.glsl`（P11.2 不要求改 active 色）。

---

## 4. 验证

- **构建**：`frontend` 下 `npm run build`（`tsc -b && vite build`）通过。

### 4.1 建议手测步骤

1. 选中一颗 slab 内星球进入 focus：`selected` 后，**背景 idle** 星饱和度相对宏观态下降（定稿下主要为 **chroma×0.7**，**L 不变**）。  
2. **同一 Z 窗内 active** 星：颜色饱和度不因 P11.2 改变；非目标变淡仍来自 **P11.1 alpha**。  
3. 取消 focus：idle 恢复常规模拟 OKLab。  
4. 控制台：`__galaxyColor.focusDimChroma = 0` 观察非焦点 idle 近灰；`focusDimL = 0.7` 观察整体变暗（调试用）。

---

## 5. 已知与后续

1. **`uFocusDimMode == 1` + selectionMask**：当前与 mode 0 行为相同，待后续 Phase 接 attribute/DataTexture 后再分支。  
2. **主设计文档同步（2026-04-28）**：已与需求定稿对齐——《星球状态机 spec》§3.4.1、《视觉参数总表》§2 / §8 / 附录 uniform 计数、《TMDB 电影宇宙 Tech Spec》§1.1 idle 条、`.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md` P11.2 节。事实仍可与 `galaxyMeshes.ts` / `galaxyIdle.vert.glsl` 对读。

---

## 6. 计划条目对照

- `.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md` — **P11.2**（非焦点降 chroma/L、双开关接口、`L_base` 沿用 P10.1）。  
- Todo `p112-non-focus-dim`：以本报告定稿值与 **idle-only + 乘子** 实现为准。

---

*报告结束。*
