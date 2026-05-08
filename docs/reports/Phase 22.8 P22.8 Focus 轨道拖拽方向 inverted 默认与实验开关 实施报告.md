# Phase 22.8（P22.8）— Focus 态轨道拖拽方向（`normal` / `inverted`）、**默认 inverted** 与实验开关 — 实施报告

> **范围**：在 **P13.3 focus 轨道相机** 的 **指针拖拽** 路径上，为 **yaw / pitch** 增加可切换的 **方向乘子**；**产品默认** 定为 **`inverted`**（相对历史「仅 `-dx`/`-dy`」等价于在默认乘子下得到 **与旧版 `normal` 相反** 的屏幕运动直觉）。**宏观 idle** 的 **XY truck/pedestal** 不受影响。  
> **计划来源**：`.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md`（§ P22.8 focus 拖拽方向反向模式）  
> **报告日期**：2026-05-08

---

## 1. 最终决策（定稿）

| 议题 | 决策 |
|------|------|
| 用户直觉与场景 | 团队结论：**`inverted` 更符合用户直觉**，且在 **背景被前景遮挡较重**（例如 Perlin 球体、开始页 cover 等高密度前景）时，**拖动「像在转动手中的球」** 的方向更易建立心理模型；故 **线上默认** 采用 **`inverted`**。 |
| 与计划初稿的差异 | 原计划默认 **`normal`**（与改版前手感完全一致）以便纯 A/B；落地后根据实机结论 **改为默认 `inverted`**，**`normal` 保留**为 **显式回退**（旧肌肉记忆 / 对照实验）。 |
| 模式枚举 | **`OrbitDragDirectionMode = 'normal' \| 'inverted'`**；**`orbitDirectionSign('inverted') === -1`**，**`'normal'` → `+1`**。 |
| 数学接入点 | 仅在 **`attachGalaxyCameraControls`** 的 **`getCameraMode() === 'orbit'`** 分支，对既有公式 **`dyaw = -dx * ORBIT_YAW_SPEED`**、**`dpitch = -dy * ORBIT_PITCH_SPEED`** 乘以 **`orbitDirectionSign(mode)`**；**`ORBIT_YAW_SPEED` / `ORBIT_PITCH_SPEED`** 与 **pitch 夹紧**逻辑 **不变**。 |
| URL 实验开关 | **`?orbitDrag=normal`** 或 **`?orbitDrag=inverted`**；**省略或非法值** → **`inverted`**（产品默认）。 |
| 控制台覆盖 | **`window.__galaxyOrbitDragMode = 'normal' | 'inverted'`**（字符串）；**若值为上述二者之一，优先于 URL**（便于不刷新页面快速切换）。 |
| SSR / 无 `window` | **`getOrbitDragDirectionMode()`** 在 **`typeof window === 'undefined'`** 时返回 **`'inverted'`**，与产品默认一致。 |
| 模块边界 | 解析逻辑集中在 **`frontend/src/utils/orbitDragDirection.ts`**；**`camera.ts`** 仅消费 **`getOrbitDragDirectionMode` + `orbitDirectionSign`**，并 **re-export** 类型与函数供 **P23 开始页** 等复用同一套解析，无需复制 URL 规则。 |
| 与 P22.9 文档 | **本报告为 P22.8 事实归档**；是否在 **`TMDB 电影宇宙 Tech Spec.md` / `Design Spec.md` / `视觉参数总表.md`** 写入 **`orbitDrag` 参数表** 由 **P22.9** 统一批次处理（本项不强制阻塞代码合并）。 |

---

## 2. 最终操作（代码与路径）

| 操作 | 路径 | 说明 |
|------|------|------|
| 模式解析、纯函数与运行时入口 | [`frontend/src/utils/orbitDragDirection.ts`](../../frontend/src/utils/orbitDragDirection.ts) | **`resolveOrbitDragDirectionModeFromInputs`**（可测）、**`getOrbitDragDirectionMode`**、**`orbitDirectionSign`**；默认兜底 **`inverted`**。 |
| 单元测试 | [`frontend/src/utils/orbitDragDirection.spec.ts`](../../frontend/src/utils/orbitDragDirection.spec.ts) | **`orbitDirectionSign`**；**window 优先于 query**；**默认 inverted**。 |
| Orbit 拖拽接入 | [`frontend/src/three/camera.ts`](../../frontend/src/three/camera.ts) | **`onPointerMove`** 内 **orbit** 分支乘 **`orbitDragSign`**；**DEV** 下 **`console.info`** 打印当前模式与开关提示；**re-export** **`OrbitDragDirectionMode` / `getOrbitDragDirectionMode` / `orbitDirectionSign`**。 |
| `Window` 类型 | [`frontend/src/vite-env.d.ts`](../../frontend/src/vite-env.d.ts) | **`__galaxyOrbitDragMode?: string`**（运行时仍校验为 **`normal` \| `inverted`**）。 |

**刻意未改动**

- **宏观相机** 的 **拖拽平移**、**滚轮**、**Space+dolly** 等行为。  
- **`galaxyInteractionStore.focusOrbit`** 的状态结构（仍为 **`{ yaw, pitch }`**）。  
- **数据管道**、**渲染契约**、**P19 active 路径**、**P21 搜索 / i18n**。

---

## 3. 参数与 API 速查（定稿值）

| 符号 / API | 值或语义 |
|------------|----------|
| 默认模式（无合法 query、无合法 `window` 覆盖） | **`inverted`** |
| URL | **`?orbitDrag=normal`** → **`normal`**；**`?orbitDrag=inverted`** → **`inverted`** |
| `window.__galaxyOrbitDragMode` | **`'normal'`** / **`'inverted'`** 时 **覆盖 URL** |
| `ORBIT_YAW_SPEED` / `ORBIT_PITCH_SPEED` | **`0.003`**（与 P13.3 一致，未改） |
| `orbitDirectionSign('inverted')` | **`-1`** |
| `orbitDirectionSign('normal')` | **`+1`** |

---

## 4. Git 提交摘要（参考）

| Hash（简写） | 说明 |
|--------------|------|
| `30e2461` | **feat(P22.8)**：引入 **`orbitDragDirection`**、**orbit** 分支乘子；**`vite-env`** 声明 **`__galaxyOrbitDragMode`**；Vitest。 |
| `b297122` | **fix(P22.8)**：**默认模式** 改为 **`inverted`**；测试与 DEV 日志文案同步。 |

（若已变基或追加 commit，以目标分支 **`git log -- frontend/src/utils/orbitDragDirection.ts frontend/src/three/camera.ts`** 为准。）

**分支（实施时）**：`feat/p22-8-orbit-drag-invert`。

---

## 5. 验收记录

| 项 | 结果 |
|----|------|
| **无 query、无 window 覆盖** | **`getOrbitDragDirectionMode() === 'inverted'`**；focus 拖拽与 **历史 `normal` 乘子下** 的方向 **相反**（相对最初代码库的「仅 `-dx`/`-dy`」手感）。 |
| **`?orbitDrag=normal`** | 与 **旧版默认**（乘子 **`+1`** 下的 **`-dx`/`-dy`**）一致，用于 **回退 / A/B 对照**。 |
| **`?orbitDrag=inverted`** | 显式 **inverted**（与默认相同，便于文档与自动化固定串）。 |
| **`window.__galaxyOrbitDragMode`** | 与 URL 同时存在时 **以 window 合法值为准**。 |
| **pitch 限幅** | 仍使用 **`THREE.MathUtils.clamp`**，**未发现** 因符号切换导致的边界抖动回归（逻辑未改，仅缩放 delta）。 |
| **Vitest** | **`src/utils/orbitDragDirection.spec.ts`** 全通过；全量 **`npx vitest run`** 在实施节点通过。 |

---

## 6. 风险与回滚

| 风险 | 缓解 |
|------|------|
| 默认 **`inverted`** 与部分用户 **长期肌肉记忆** 冲突 | 文档与 **URL**：**`?orbitDrag=normal`**；控制台 **`window.__galaxyOrbitDragMode = 'normal'`**。 |
| 非法 query 字符串 | **静默回退 `inverted`**（与「省略 query」一致）。 |

**回滚**：将 **`resolveOrbitDragDirectionModeFromInputs`** 的兜底返回值改回 **`'normal'`**，并同步 **`getOrbitDragDirectionMode`** 的 SSR 分支与测试用例即可（单文件 + 单测 + 报告一句勘误）。

---

## 7. 后续建议（非阻塞）

- **P22.9**：在 **Tech Spec / Design Spec** 增加 **§ 交互 — focus 轨道拖拽**，并可在 **`视觉参数总表`** 增加一行 **默认 `inverted` + query/window 表**。  
- **P23**：若开始页复用 **`attachGalaxyCameraControls`**，**无需额外接线**；若自研指针逻辑，请 **`import { getOrbitDragDirectionMode, orbitDirectionSign } from '@/utils/orbitDragDirection'`**（或 **`@/three/camera`** re-export）以保持 **URL / window 语义唯一**。
