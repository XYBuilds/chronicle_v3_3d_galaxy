# Phase 16.2 — 搜索差异化 zCurrent 联动 实施报告（定稿）

本文档为 Phase 16 子项 **P16.2** 的**最终决策**、**已落地操作**与**验收口径**归档。  
关联计划：`.cursor/plans/phase_16_search_refinements_22478218.plan.md`（条目 **p162-zcurrent-snap**）。  
产品意图与设计决策对齐：Phase 16 计划 **D2 / D3 / D4**；《TMDB 电影宇宙 Design Spec》**§4.3–§4.5**（电影 / 人名 / 流派选中后的时间轴联动）；时间轴与宏观相机仍服从 Phase **5.1.5** / **13.4** 既有契约。

---

## 1. 背景与范围

### 1.1 目标

在**不改动** `galaxy_data.json` / 搜索索引**数据契约**的前提下，使搜索联想选中后在 **Timeline（`zCurrent`）** 上的反馈按模式区分：

- **电影名**：继续仅依赖 **`selectedMovieId` → P13.4 focus 进入**，时间轴与相机飞入共用同一套 eased 进度（本项**无新增 SearchBar 逻辑**）。
- **人名**：选中后除写入 `searchMode: 'person'` 与 `selectionIds` 外，将 **`zCurrent` 在 700ms 内 eased 过渡到 `min(movie.z)`**（selection 内「最早」的年份轴位置）。
- **流派**：**不修改** `zCurrent`（与 viswindow / select 单态既有语义一致）。

### 1.2 范围边界

| 纳入 P16.2 | 不纳入（本报告范围外） |
| ---------- | ---------------------- |
| `transitionDriver` 扩展、`scene.ts` 内独立 `zCurrentDriver` 与 RAF 写入 store | **P16.3** active 材质 opaque / transparent 双路径 |
| `mountGalaxyScene` 返回值上的 **`controller.animateZCurrentTo`** | **P16.4** 全量 spec 文档同步与 Phase 8 基线重跑归档 |
| `App.tsx` ref 桥接 + `SearchBar` 人名分支调用 | 人名 select 下 active 粒子「屏幕可读性」问题（计划 **D6 / A.5.1.3**：本阶段不修） |

---

## 2. 最终锁定决策

| 编号 | 决策项 | 最终方案 |
| ---- | ------ | -------- |
| **D2**（计划表） | 搜电影后 `zCurrent` | **继承 P13.4**：`beginSelect` 内 `focusZAnimStart` / `focusZAnimTarget = movie.z`，与 focus 相机 **`focusDriver`** 同进度；SearchBar 仅 `setState({ selectedMovieId })`。 |
| **D3**（计划表） | 搜人名后 `zCurrent` | **`animateZCurrentTo(Math.min(...zs), 700)`**，其中 `zs` 为 `selectionIds` 映射到 **`movieById.get(id).z`** 且 **有限** 的值；缓动与 focus 进入一致（**默认 `easeOutCubic`**，时长 **700ms**，与 **`SELECT_MS`** 对齐）。 |
| **D4**（计划表） | 搜流派后 `zCurrent` | **显式不调用** `animateZCurrentTo`；代码侧以注释标明 **Design Spec §4.5**（genre 期间不按时间轴滚动）。 |
| **D7**（实施） | Driver 复用方式 | **第二个** `createTransitionDriver()` 实例专用于时间轴漂移（**`zCurrentDriver`**），与 focus 的 **`focusDriver` 分离**，避免进度通道互相覆盖。 |
| **D8**（实施） | HUD 与场景的耦合 | **`mountGalaxyScene(...).controller.animateZCurrentTo`** 为唯一对外 API；**`App.tsx`** 用 **`useRef`** 持有函数指针，**`SearchBar`** 接收可选 **`animateZCurrentTo`** prop，避免 React 组件直接 import `scene.ts`。 |
| **D9**（实施） | focus 与人名动画互斥 | **`beginSelect`** 首行 **`zCurrentDriver.cancel()`**，保证进入电影 focus 时仅 **P13.4** 写入 `zCurrent`；RAF 内仅在 **`selectionPhase !== 'selecting'`** 时 tick **`zCurrentDriver`**。 |
| **D10**（实施） | 人名中途换人名 | **`animateZCurrentTo`** 内先 **`cancel()`**，再以**当前 store `zCurrent`** 为 **`zTimelineAnimFrom`** 调用 **`start(durationMs)`**，实现「打断并重算」。 |
| **D11**（边界） | `selectionIds` 无有效 `z` | **`console.warn`**，**不调用** `animateZCurrentTo`（防御性；正常索引下不应发生）。 |
| **D12**（计划陈述） | ESC 退出 select 是否回滚 `zCurrent` | **否**（与计划「stay」一致）：本项未新增 ESC 专用回滚逻辑。 |

---

## 3. Git 与分支操作

| 操作 | 说明 |
| ---- | ---- |
| 分支名 | `feat/p16-2-zcurrent-person-snap` |
| 提交 | `c77529d` — `feat(p16.2): person search snaps timeline zCurrent to earliest film z` |
| 变更文件数 | 4（见下节） |

> 若分支已合并或重新 cherry-pick，请以当前仓库 `git log` 为准核对 commit hash。

---

## 4. 实施操作清单

### 4.1 修改的文件

| 路径 | 变更摘要 |
| ---- | -------- |
| `frontend/src/three/transitionDriver.ts` | **`TransitionDriver`** 增加 **`cancel()`**：停止 `running`、清除 **`onDone`**，保留当前 **`progress`**（用于 P16.2 打断后重新 `start`）。 |
| `frontend/src/three/scene.ts` | 导出 **`GalaxySceneController`**；**`GalaxySceneMount`** 增加 **`controller`**；新增 **`zCurrentDriver`**、**`zTimelineAnimFrom` / `zTimelineAnimTo`**、**`Z_CURRENT_ANIM_MS = 700`**、**`animateZCurrentTo`**；RAF **`tick`** 内在 **`selectionPhase !== 'selecting'`** 且 driver **`active`** 时 **`tick` + `setState({ zCurrent })`**；**`beginSelect`** 与 **`dispose`** 内 **`zCurrentDriver.cancel()`**；挂载返回值包含 **`controller: { animateZCurrentTo }`**。 |
| `frontend/src/App.tsx` | **`animateZCurrentRef`** + 稳定 **`useCallback`** 包装；**`mountGalaxyScene`** 后将 **`mount.controller.animateZCurrentTo`** 写入 ref，dispose 清空；**`<SearchBar animateZCurrentTo={...} />`**。 |
| `frontend/src/components/SearchBar.tsx` | **`SearchBarProps.animateZCurrentTo?`**；人名联想 **`applySuggestion`**：在 **`setState`** 后计算 **`min(z)`** 并 **`animateZCurrentTo?.(zMin, 700)`**；流派对 **`zCurrent`** 仅注释说明；依赖数组加入 **`animateZCurrentTo`**。 |

### 4.2 未修改但相关的运行时契约

| 路径 / 机制 | 说明 |
| ----------- | ---- |
| `frontend/src/store/galaxyInteractionStore.ts` | **`zCurrent`** 仍为 SSOT；无新增 store action。 |
| P13.4 **`applySelectionFrame`（`selecting`）** | 该阶段仍独占 **`zCurrent`** 插值；与 **§2 D9** 一致。 |
| `frontend/src/storybook/GalaxyThreeLayerLabCore.tsx` | 使用 **`ReturnType<typeof mountGalaxyScene>`**，自动获得 **`controller`** 字段；Storybook 未强制做人名搜索路径验收。 |

### 4.3 可观测日志（调试）

- **`animateZCurrentTo` 每次 `start`**：`[ZCurrent] animateZCurrentTo start`（含 `from` / `to` / `durationMs`）。
- **人名选中**：沿用 `[Search] person select`；若 **`zs.length === 0`**：`[Search] person select: no finite z for selectionIds`。

---

## 5. 验收口径（P16.2）

| 项 | 预期 |
| -- | ---- |
| 电影联想 → 选中 | **Timeline** 与 **P13.4** focus 进入一致（无回归）；SearchBar **无**新增 z 动画调用。 |
| 人名联想 → 选中 | **约 700ms** 内 **`zCurrent`** 平滑移至 selection 内 **`min(movie.z)`**；DevTools 可见 **单次** `[ZCurrent] animateZCurrentTo start`（同一操作内）。 |
| 人名 → 换人名（动画进行中） | 新一次 **`start`** 前有 **`cancel`**；时间轴从**当前** `zCurrent` 重新插值到新 **`min(z)`**。 |
| 流派联想 → 选中 | **`zCurrent`** 不因本次选中而改变（可与选中前对比 store 或 Timeline）。 |
| 进入电影 focus | **`beginSelect`** 取消人名时间轴 driver；**`selecting`** 阶段仅 focus 写入 **`zCurrent`**。 |
| 构建 | `frontend` 下 **`npm run build`**（`tsc -b && vite build`）通过（实施时已跑通）。 |

---

## 6. 已知事项与后续

- **滚轮与时间轴动画**：宏观 **`onWheel`** 仍可直接写 **`zCurrent`**；与人名 **`zCurrentDriver` 同帧竞争时，本阶段以 RAF 内 driver 覆盖为准**（计划中未要求「动画期锁定滚轮」）。
- **P16.3**：select 单态 **active** 材质 **opaque / transparent** 切换（修 genre 深度排序）。
- **P16.4**：将 **§4.3–§4.5** 与本文行为在 Design Spec / 状态机 / Tech Spec 等文档中做最终对齐，并补充回归记录。

---

*报告归档日期：2026-05-02。*
