# Phase 27.4 — Galaxy idle 时间轴 Z 半透明与移除 P22.1 world-Z 近裁（最终实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 27（增长与轻量功能）子项 **P27.4** |
| 计划来源 | [`.cursor/plans/phase_27_growth_light_features.plan.md`](../../.cursor/plans/phase_27_growth_light_features.plan.md) 正文「P27.4 Galaxy idle 时间轴 Z 半透明与移除 P22.1 world-Z 近裁」 |
| 日期 | 2026-05-13 |
| 关联会话 | Cursor agent transcript：[Idle Z 半透明与调参](6bbe4ddd-c9e9-4096-83d5-3f6eda724f8e)、[移除 nearCullWorldZ](2aced334-1914-4d93-b8c5-9cecbf4282a1)（本地 `agent-transcripts` 目录，文件名同 UUID） |
| Git | 分支 `p27-4-idle-z-fade-nearcull-removal`，提交 `b71e248`（若后续有追加提交，以 `git log` 为准） |
| 状态 | **已落地**：删除 P22.1 **世界 Z 条带近裁**；idle 层增加 **按上映年相对时间轴 slab 的硬边界 alpha 乘子**；**CPU 拾取**与 **GPU** 使用同一套乘子与豁免语义；**Dev 控制台**可调。 |
| 报告性质 | **工作留档**：汇总本阶段最终决策与已执行操作。**参数 SSOT** 以 [`frontend/src/three/idleZFade.ts`](../../frontend/src/three/idleZFade.ts) 中 `IDLE_Z_FADE_DEFAULTS` 与运行时 `galaxyIdle` 材质同名 uniform 为准；若与计划 Markdown 表格或本文表格不一致，**以代码为准**。 |

**范围说明**：本阶段覆盖 **idle** 顶点着色器中的 Z 相关透明度、**active 射线拾取**中与 idle 透明度一致的门控，以及 **idle / active** 顶点着色器中 **P22.1 `uNearCullWorldZ` 硬裁顶点** 的完整移除。**Tech Spec / Design Spec / 视觉参数总表** 已与 **P27.4** 同步（见 **§6**）。

---

## 1. 目标（与计划对齐）

1. **移除 world-Z 近裁**：不再用「相机世界 Z 与粒子 Z 差值小于常数」在顶点阶段丢弃片元；避免与宏观时间轴语义重叠、且与 P26.3 近距淡出并存时心智负担过大。
2. **idle 时间轴 Z 半透明（产品可控）**：仅对 **idle** 背景星，按 **上映年 `aZ`**（与 `zCurrent`、`zVisWindow` 同单位：十进制年）在 slab **外侧**施加 **alpha 乘子**；与 P26.3 **近距淡出**在 shader 内 **相乘**。
3. **硬边界、少参数**：最终只保留 **`mode`（三态）** 与 **`outsideAlpha`**；**不**提供 margin / ramp 类软边（迭代中曾存在 smoothstep 方案，已按产品决策删除）。
4. **拾取与视觉一致**：在条带边缘、低 `inFocus` 区域，若 idle 合成 alpha 已极低，则 active 球拾取应与视觉一致地弱化；**focus / cover today** 与 shader 共用 **exempt** 语义。
5. **工具链可维护**：`vite-plugin-glsl` 对 GLSL 注释的扫描行为已记录（反引号会破坏构建）；若日后在 TS 侧恢复 smoothstep，须注意 `THREE.MathUtils.smoothstep(x, min, max)` 与 GLSL 参数顺序不同。

---

## 2. 最终决策总表

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **删除 `nearCullWorldZ.ts` 与 `NEAR_CULL_WORLD_Z` 导出链** | 常量与 re-export 仅从工程移除；不再作为「近裁阈值」事实来源。 |
| D2 | **着色器移除 `uNearCullWorldZ` 分支** | `galaxyIdle.vert.glsl` 与 `galaxyActive.vert.glsl` 均不再根据 `abs(uCameraWorldPos.z - aZ)` 将顶点打到屏幕外。 |
| D3 | **active 顶点着色器去掉未使用的 `uCameraWorldPos`** | 移除 Z 近裁后 active 不再读取相机世界坐标；idle 仍保留（P26.3 距离淡出）。 |
| D4 | **idle 豁免变量统一为 `exemptIdleNearFade`** | 语义：焦点实例 **或** cover「今日」实例；同时豁免 **P26.3 近距淡出** 与 **P27.4 Z 乘子**（与此前 `exemptNearCull` 复用对象一致，仅更名）。 |
| D5 | **拾取 API 简化与语义重命名** | `pickClosestActiveMovieAlongRay` 去掉 `cameraWorldZ`；`nearCullExemptMovieId` 更名为 **`idleNearFadeExemptMovieId`**，仅表示「近距淡出 / Z 乘子拾取豁免用影片 id」（与 shader exempt 对齐）。 |
| D6 | **P27.4 仅两 uniform：`uIdleZFadeMode`、`uIdleZFadeOutsideAlpha`** | 不设 margin、ramp、独立 minAlpha；边界为 **`aZ` 与 `uZCurrent`、`zHi = uZCurrent + uZVisWindow` 的严格比较**。 |
| D7 | **`mode` 三态语义** | `1`：仅当 `aZ > zHi` 时 `nearFadeAlpha *= outsideAlpha`；`-1`：仅当 `aZ < uZCurrent` 时乘；`0`：不乘。闭区间 **`[uZCurrent, zHi]`** 内 **不** 施加 Z 乘子（与 `mode` 取 `1` 或 `−1` 无关）。 |
| D8 | **与 P26.3 相乘** | 先算近距淡出 `nearFadeAlpha`，再乘 Z 乘子；`vNearFadeAlpha` 为合成结果。 |
| D9 | **idle 材质透明路径** | `scene.ts`：**`selectionPhase === 'idle'`** **且**（**`uIdleNearFadeEnabled > 0.5`** **或** **`abs(uIdleZFadeMode) > 0.5`**）→ idle **transparent + 无 depthWrite**。**focus**（**selecting / selected / deselecting**）→ **opaque**，与 **`uIdleMacroFadesActive`** 一致。 |
| D10 | **CPU 拾取门控** | `screenRadius.ts`：近距与 Z 乘子分别计算后 **相乘** 得 `prod`；`floorA` 为各启用项下限的 **乘积**；当 `!exemptFade && inF <= 0.5 && prod <= floorA + 0.05` 时跳过该候选。**`idleMacroFadesActive === false`**（**`interaction.ts`** **`getIdleMacroFadesActive`**）时整段跳过。 |
| D11 | **Dev：`window.__galaxyIdleZFade`** | 暴露 `mode` / `outsideAlpha` 读写（setter 将 mode 规范为 `-1 | 0 | 1`）、`log()`；场景 `dispose` 时从 `window` 摘除。 |
| D12 | **GLSL 注释避免反引号** | `vite-plugin-glsl` 会把注释中的 `` ` `` 误当作模板字符串起点，导致 Vite 编译失败；相关注释改为纯标识符写法。 |
| D13 | **focus 禁用 idle 淡出** | **`uIdleMacroFadesActive`**：`scene.ts` **`selectionPhase === 'idle' ? 1 : 0`**；**`galaxyIdle.vert.glsl`** 包裹 **P26.3 + P27.4** 两段；拾取与 idle 材质与 GPU 对齐。 |

---

## 3. 参数与公式（SSOT）

### 3.1 TypeScript 默认常量

定义于 [`frontend/src/three/idleZFade.ts`](../../frontend/src/three/idleZFade.ts)：

| 符号 | 当前默认值（以仓库代码为准） | 含义 |
| --- | --- | --- |
| `mode` | `-1` | 规范后取值为 **`-1` / `0` / `1`**。`abs(mode) < 0.5` 视为关闭。 |
| `outsideAlpha` | `0.5` | 落在被压暗一侧时，对已有 `nearFadeAlpha` 的 **乘子**，范围 clamp 到 `[0, 1]`。 |

`computeIdleZFadeAlpha(aZ, zCurrent, zVisWindow, mode, outsideAlpha, exempt)` 为 **CPU 镜像**，供 `screenRadius.ts` 使用；逻辑须与 `galaxyIdle.vert.glsl` 一致。

### 3.2 Shader（idle）

- **/slab 上界**：`zHi = uZCurrent + uZVisWindow`（与 idle 内既有 `inFocus` 计算共用同一 `zHi` 思路）。
- **分支**（在 P26.3 近距淡出之后执行）：
  - `abs(uIdleZFadeMode) > 0.5 && !exemptIdleNearFade` 时进入；
  - `uIdleZFadeMode > 0.5 && aZ > zHi` → `nearFadeAlpha *= clamp(uIdleZFadeOutsideAlpha, 0, 1)`；
  - `uIdleZFadeMode < -0.5 && aZ < uZCurrent` → 同上。

### 3.3 Uniform 注入

[`frontend/src/three/galaxyMeshes.ts`](../../frontend/src/three/galaxyMeshes.ts) 的共享 uniform bag 注册 `uIdleZFadeMode`、`uIdleZFadeOutsideAlpha`，初值来自 `IDLE_Z_FADE_DEFAULTS`。

---

## 4. 工程操作（修改路径一览）

| 路径 | 操作摘要 |
| --- | --- |
| `frontend/src/three/nearCullWorldZ.ts` | **删除**（P22.1 世界 Z 近裁常量源文件移除）。 |
| `frontend/src/three/shaders/galaxyIdle.vert.glsl` | 移除 `uNearCullWorldZ` 及对应 early-return；`exemptIdleNearFade`；**`uIdleMacroFadesActive`** 包裹 **P26.3 + P27.4**；`uIdleZFadeMode` / `uIdleZFadeOutsideAlpha`；注释避免反引号。 |
| `frontend/src/three/shaders/galaxyActive.vert.glsl` | 移除 `uNearCullWorldZ` 分支；移除未使用的 `uCameraWorldPos`。 |
| `frontend/src/three/galaxyMeshes.ts` | 去掉 `NEAR_CULL_WORLD_Z` 与 `uNearCullWorldZ`；增加 `IDLE_Z_FADE_DEFAULTS` 与 **`uIdleMacroFadesActive`** 等 uniform。 |
| `frontend/src/three/idleZFade.ts` | **新建**：默认值、`computeIdleZFadeAlpha`。 |
| `frontend/src/three/idleZFade.spec.ts` | **新建**：Vitest 覆盖 mode 0 / exempt / mode 1 与 -1 边界 / outsideAlpha clamp。 |
| `frontend/src/three/screenRadius.ts` | 移除 Z 近裁与 `cameraWorldZ`；**`idleMacroFadesActive`** 与 **`idleNearFadeExemptMovieId`**；近距与 Z 的 `prod` / `floorA` 拾取门控；`import computeIdleZFadeAlpha`。 |
| `frontend/src/three/interaction.ts` | 传入 `idleNearFadeExemptMovieId`，不再传 `cameraWorldZ`。 |
| `frontend/src/three/scene.ts` | `GalaxyIdleZFadeDebug`、`window.__galaxyIdleZFade`、idle 材质透明条件含 Z mode、`dispose` 清理。 |
| `.cursor/plans/phase_27_growth_light_features.plan.md` | 增加 P27.4 正文节；YAML `todos` 按 P27.1–P27.6 编号排序；`p274` 标为 completed。 |

---

## 5. 验证与测试

| 类型 | 命令或说明 |
| --- | --- |
| 单元测试 | `frontend` 目录：`npm run test -- src/three/idleZFade.spec.ts`（可与 `idleNearFade.spec.ts` 一并跑）。 |
| 类型检查 | `frontend`：`npx tsc -b`（实施时用于确认无残留符号）。 |
| 手工 | 控制台：`window.__galaxyIdleZFade.mode = 1` 或 `-1`，调节 `outsideAlpha`，确认仅 slab 对应一侧 idle 变淡、条带内不变；focus / cover today 仍可点。 |

---

## 6. 已知后续与文档漂移

1. **Tech Spec / Design Spec / 视觉参数总表 / Phase 26.3 报告**：已于 **2026-05-13** 与 **P27.4** 同步（**§1.4.5a**、拾取表、参数表、P26.3 过时句删除或标注）。
2. 其他归档报告（如 **Phase 23.3** 中「exempt near cull」措辞）若仍出现 **`uNearCullWorldZ`**，视为历史语境；以当前 **Tech Spec §1.4.5a** 为准。
3. **`.cursor/plans`** 中 P27.4 小节若与 **`idleZFade.ts`** 默认不一致，以代码为 SSOT。

---

## 7. Dev 快速参考

场景挂载后，在浏览器控制台示例：

```js
window.__galaxyIdleZFade.mode = 1          // 未来侧：aZ > zCurrent + zVisWindow
window.__galaxyIdleZFade.mode = -1         // 过去侧：aZ < zCurrent
window.__galaxyIdleZFade.mode = 0          // 关闭
window.__galaxyIdleZFade.outsideAlpha = 0.35
window.__galaxyIdleZFade.log()
```

`zCurrent` 与 `zVisWindow` 仍由交互与 HUD 时间轴驱动，每帧写入 `uZCurrent` / `uZVisWindow`；P27.4 **不**单独配置年份轴位置。
