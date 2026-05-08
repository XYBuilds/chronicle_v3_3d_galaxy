# Phase 22.6（P22.6）— Constellation 三链拆分、`movie_roles` hover 高亮与透明度缓降 — 实施报告

> **范围**：人名检索模式下 **星座连线（constellation）** 由 **单条 `LineSegments`** 重构为 **`THREE.Group` + 三条独立链**（**producers / crew / cast**）；按 **`galaxy_search_index.json.gz`** 中 **`people[key].movie_roles[movieId]`** 位域 **高亮对应链**；**默认 / hover 透明度**经 dial-in 定稿；**鼠标离星**后 **500ms** 线性缓回默认透明度；**换星悬停**时非命中链 **立即** 回默认（无假淡出）。  
> **计划来源**：`.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md`（§ P22.6 constellation 三链拆分 + hover 高亮）  
> **报告日期**：2026-05-08

---

## 1. 最终决策（定稿）

| 议题 | 决策 |
|------|------|
| 几何结构 | **三条** `THREE.LineSegments`，挂载于同一 **`THREE.Group`**（`ConstellationHandle.group`），**`scene.add(constellation.group)`**；**`dispose`** 时 **`group.removeFromParent()`** 并释放 **3× geometry + material**。 |
| 链语义与位域 | 与 **Tech Spec §4.5.1** / **`export_search_index.py`** 一致：**cast=1**；**crew = director(2) \| dop(4) \| writers(8) \| music_composer(32)**；**producers=16**。 |
| 每链顶点预算 | **`maxSegmentsPerChain = 140`**（`createConstellation` 默认参数），与历史 **单池约 420 段** 总预算 **同量级**（三链独立截断）。 |
| 无 `movie_roles` 的 legacy | **`movie_roles` 缺失或空对象**时，**整条时间线**仅写入 **`producers`** 子 mesh；**`crew` / `cast`** 空 **`drawRange`**、**`visible: false`**（与 P12.7「单折线」观感等价）。 |
| 默认 / hover 透明度（dial-in） | **`CONSTELLATION_CHAIN_DEFAULT_OPACITY = 0.025`**；**`CONSTELLATION_CHAIN_HOVER_OPACITY = 0.2`**（计划初值 0.04 / 0.18 经实机观感后 **上调 hover、略降默认**）。 |
| Hover 数据来源 | **`useSearchIndexStore.getState().data?.people[selectionPersonKey]?.movie_roles?.[String(hoveredMovieId)]`**；**`roleMask === 0`** 时按 **「无该星条目」** 处理，与 **`null`** 相同 → **全部链目标为 default**（触发离星缓降路径）。 |
| 透明度动画 | **命中链（目标 hover）**：**瞬时** 拉到 **`HOVER_OPACITY`**。**仍在悬停某颗星但 `mask` 变化**：**未命中链** **瞬时** 回 **`DEFAULT_OPACITY`**（避免在片目间移动鼠标时出现 **500ms 假淡出**）。**`mask === null`（鼠标离星 / `resetChainOpacities`）**：凡当前显示值 **高于 default** 的链，在 **`CONSTELLATION_CHAIN_OPACITY_FADE_MS = 500`** 内 **线性** 插值到 default。 |
| 与 `sync` 的关系 | **`sync()`** 在 **隐藏**或**每次可见路径开头**调用 **`snapOpacityState`**：材质与内部 **display / target / fade** 一并 **对齐 default**，避免几何刷新与 RAF 动画 **打架**。 |
| 渲染顺序 | 三子 mesh **`renderOrder = 0.5`**（在 **`constellation.ts`** 内设置），介于 idle **`0`** 与 active **`1`** 之间（与 §4a 速查表一致）。 |
| 运行入口 | **`scene.ts` RAF**：在写入 **`uHoveredInstanceId`** 之后，根据 **人名模式 + constellation 可见条件** 调用 **`updateHoverFromRoleMask`** / **`resetChainOpacities`**，随后 **每帧** **`constellation.tickOpacity(nowMs)`**（与悬停块解耦，保证离星后仍能跑满 **500ms** 缓降）。 |
| Tech / Design Spec | **本子报告为事实归档**；全量 SSOT 同步仍按 **P22.9** 在 **`TMDB 电影宇宙 Tech Spec.md` / `Design Spec.md`** 等批量对齐。 |

---

## 2. 最终操作（代码与路径）

| 操作 | 路径 | 说明 |
|------|------|------|
| 三链实现、透明度常量、缓降与 API | [`frontend/src/three/constellation.ts`](../../frontend/src/three/constellation.ts) | **`createConstellation`** 返回 **`group`**、**`sync`**、**`dispose`**、**`setChainOpacity`**（调试用快照）、**`resetChainOpacities`**（仅设 **target = default**）、**`updateHoverFromRoleMask`**、**`tickOpacity`**；**`ChainKey`**、**`CONSTELLATION_CHAIN_*`**、**`CONSTELLATION_CHAIN_OPACITY_FADE_MS`** 导出。 |
| 挂载与 RAF 联动 | [`frontend/src/three/scene.ts`](../../frontend/src/three/scene.ts) | **`scene.add(constellation.group)`**；hover 条件与 **`movie_roles`** 解析；**`constellation.tickOpacity(nowMs)`** 每帧调用。 |
| 单元测试 | [`frontend/src/three/constellation.test.ts`](../../frontend/src/three/constellation.test.ts) | 三链几何断言（**`drawRange.count`** 为 **顶点数**）；**`updateHoverFromRoleMask` + `tickOpacity`**；**离星 500ms** 线性缓降用例。 |
| 开发者速查 | [`docs/project_docs/视觉参数总表.md`](../project_docs/视觉参数总表.md) | **§4a** 更新为三 mesh、**0.025 / 0.2**、**500ms** 离星缓降与换星瞬回说明。 |
| 计划 todo | [`.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md`](../../.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md) | **P22.6** 项标为 **completed**（实施时节点）。 |

**刻意未改动**

- **数据管道 / `galaxy_data.json` 契约**（除既有 **`movie_roles`** 消费方式外无变更）。  
- **UMAP / Procrustes**、**Phase 19 active 路径 A/B**、**P21 搜索与 i18n`**。

---

## 3. 参数与 API 速查（定稿值）

| 符号 / API | 值或语义 |
|------------|----------|
| `CONSTELLATION_CHAIN_DEFAULT_OPACITY` | **0.025** |
| `CONSTELLATION_CHAIN_HOVER_OPACITY` | **0.2** |
| `CONSTELLATION_CHAIN_OPACITY_FADE_MS` | **500**（仅 **离星 / 全链 default 目标** 时的缓降） |
| `createConstellation(maxSegmentsPerChain?)` | 默认 **140** |
| `ConstellationHandle.group` | 三条子 **`LineSegments`** 的父节点 |

---

## 4. Git 提交摘要（参考）

| Hash（简写） | 说明 |
|--------------|------|
| `78fdf46` | **feat(frontend)**：三链 **`LineSegments`**、**`group`** 挂载、**`movie_roles`** hover、**`scene`** 联动；**Vitest**；**视觉参数总表** §4a；计划 **P22.6 completed**。 |
| `a52e3f3` | **fix(constellation)**：**默认 / hover** 透明度 dial-in 为 **0.025 / 0.2**。 |
| `8d56458` | **feat(frontend)**：**500ms** 离星线性缓降；换星时非命中链 **瞬时** 回默认；**`tickOpacity`** + **`scene`** 每帧调用；测试与文档补充。 |

（若已合并或追加 commit，以目标分支 **`git log -- frontend/src/three/constellation.ts`** 为准。）

**分支（实施时）**：`feat/p22-6-constellation-chain-hover`。

---

## 5. 验收记录

| 项 | 结果 |
|----|------|
| 人名模式 + **`constellationEnabled`** + **≥2** 选中片 + **非 focus** | **`group.visible === true`** 时三链（或有 **`movie_roles`** 时子集）按 **`release_date`** 排序绘制。 |
| **`movie_roles` 存在** | **producers / crew / cast** 各占 **独立** `BufferGeometry`；**opacity** 可 **分链** 控制。 |
| 悬停某星 | **`movie_roles[id]`** 与 **cast / crew / producers** 掩码 **相交** 的链 **瞬时** **0.2**；其余链目标为 default（若从 hover 切走则 **瞬时** 回 **0.025**）。 |
| 鼠标离星 | **500ms** 内自当前显示值 **线性** 降至 **0.025**（**`tickOpacity`** 驱动）。 |
| idle / 其他搜索模式 | **`sync`** 隐藏星座；**`snapOpacityState`** 重置内部状态；与计划「非人名不画线」一致。 |
| **Vitest** | **`src/three/constellation.test.ts`** 全通过。 |
| **TypeScript** | **`npx tsc --noEmit`** 在实施节点通过。 |

---

## 6. 与计划 P22.6 的对照

| 计划项 | 结果 |
|--------|------|
| 拆 **3** 个 **`LineSegments`**（producers / crew / cast） | **已完成**（**`Group`** 容器）。 |
| 默认 **0.04** / hover **0.18** | **修订为** **0.025 / 0.2**（**dial-in 定稿**，并已写入 **`视觉参数总表`** §4a）。 |
| hover 某颗星 → **`movie_roles`** → 高亮该岗位链（多岗位 **多链** 同时亮） | **已完成**（位域与 **§4.5.1** 一致）。 |
| 离星缓降 **500ms** | **计划外细化**：实施中补充（计划仅写瞬时 hover / 默认二档，**未**写缓降时长；本报告为 **最终产品行为**）。 |
| **`dispose`** 释放三份 **geometry / material** | **已完成**。 |

---

## 7. 风险与回滚（简要）

| 风险 | 缓解 |
|------|------|
| 三 mesh **draw call ×3** | 仅 **3** 条 **`LineSegments`**，相对 **60K instance** 主体成本可忽略；若低端机有疑，用 Performance 面板对比 **一帧**。 |
| **`sync` 高频** 触发时 **snap** 打断缓降 | 与旧版「每次 **sync** 顶格默认 opacity」一致；**仅**在 **store 订阅** 路径触发，非每帧。 |
| **`tickOpacity` 漏调** | 透明度会 **卡住**；**`scene.ts` RAF** 已 **固定**在 hover 块之后 **每帧**调用。 |

**回滚**：恢复 **单 mesh** **`createConstellation`** 与 **`scene.add(mesh)`** 即可（以 **`78fdf46` 之前** 历史为参照）；**不推荐**仅关闭 **`tickOpacity`**（会破坏缓降与瞬时 hover 契约）。

---

## 8. 后续可选（非 P22.6 必达）

- **缓动曲线**：当前为 **线性**；若需 **ease-out**，可在 **`tickOpacity`** 内对标量 **`t`** 套曲线（保持 **500ms** 总时长或改为可配置常量）。  
- **P22.9**：将 **§4.5.1 星座**、**hover 行为**、**透明度与缓降** 写入 **`TMDB 电影宇宙 Tech Spec.md` / `Design Spec.md`**，与 **`视觉参数总表`** 交叉引用。
