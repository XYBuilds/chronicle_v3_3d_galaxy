# Phase 12.7 · P12.7 人名星座连线（LineSegments）— 实施报告

> 对应 [Phase 12 计划](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) 中 **P12.7**（`p127-constellation-lines`），并在实施过程中按产品反馈迭代：**按职位分多根时间线**、**三类职位归并**、**纯白 + 低透明度**、**focus 时隐藏**、**端点缩进避免切入 mesh**。  
> **前置**：P12.5 `selectionMask`、P12.6 影人 / genre 多 active 与 `selectionIds` 顺序（`release_date` 升序）。  
> **日期**：2026-04-29。

---

## 1. 目标与最终决策

| 议题 | 决策 |
|------|------|
| Git 工作流 | 在独立分支 **`feature/p12.7-constellation-by-role`** 上开发与提交（不合并叙述以 PR 为准）。 |
| 数据：按片职位 | 管线在每人条目中增加 **`movie_roles`**：`{ "<tmdb_id>": <该片上的 role bitmask> }`，与 **`movie_ids`** 一一对应；同一人在同一片多列合并为按位或。导出脚本对 **`role_mask`**、**`movie_roles ⊆ role_mask`** 做断言。 |
| 索引体积 | `movie_roles` 与人数 × 片数成正比，**`galaxy_search_index.json.gz` 显著变大**；部署侧需随 **`galaxy_data`** 同版本**重新导出**索引，否则前端走无 `movie_roles` 的降级路径。 |
| 连线分组（产品定稿） | **三根线**：① **制片**（bit 16）；② **导演 + 摄影 + 编剧 + 作曲**（bits 2 \| 4 \| 8 \| 32 合并为一条按时间串联的折线）；③ **演员**（bit 1）。每条线仅在「该组 bitmask 与 `movie_roles[id]` 有交」的片子中筛 id，再按 **`release_date` 升序** 相邻连线。 |
| 无 `movie_roles` 的旧包 | 前端 **不报错**：视为 **`movie_roles` 缺失**，退化为 **整条 `selectionIds` 一条时间序折线**（与计划初版「单链」一致）。 |
| Store：`selectionPersonKey` | 影人联想选中时写入 **normalized 人名 key**，供读取 **`searchIndex.people[key].movie_roles`**；**`clearSearch` / `searchMode === 'idle'` / `movie` tab 切到无 select** 等路径与 genre 选中时 **清空**；与 **`selectionIds`** 同步维护。 |
| 何时绘制 | **`searchMode === 'person'`** 且 **`constellationEnabled`**（默认 `true`，与计划一致可由 `window.__galaxyInteraction` 调试）且 **`selectionIds.length ≥ 2`**。**`searchMode === 'genre'`** 不绘制。 |
| Focus 态 | **`selectedMovieId !== null`**（单片 focus + Perlin 球会话）时 **整层星座隐藏**；ESC 取消 focus 后 **连线恢复**（select 会话仍在则仍满足 person + ids）。 |
| 线与 mesh 不相交 | 每段 A→B 使用与拾取一致的 **`computeActiveWorldRadius`** 作为球半径；端点沿弦方向从球心外移 **`r + surfaceGapWorld`**；若缩进后弦长不足则 **跳过该段**。默认 **`CONSTELLATION_SURFACE_GAP_WORLD = 0.2`**（世界单位，与 active 球半径相加）。 |
| 视觉 | **统一白色** `color: 0xffffff`，**无顶点分色**；**`opacity: 0.07`**，`transparent: true`，`depthWrite: false`。 |
| 场景挂载 | **`LineSegments`** **`renderOrder = 0.5`**（idle 0、active 1 之间）；`dispose` 时与 store 订阅一并释放。 |
| 校验与测试 | **`parseAndValidateSearchIndex`**：若存在 **`movie_roles`**，则键与 **`movie_ids`** 一致、每值 ∈ [1,63] 且为 **`role_mask`** 子集。Vitest：`constellation.test.ts`（分组顺序、focus 隐藏、缩进几何）、`loadSearchIndex.test.ts`（`movie_roles` 校验样例）。 |

---

## 2. 交付物清单

| 类型 | 路径 | 说明 |
|------|------|------|
| 索引导出 | [`scripts/export/export_search_index.py`](../../scripts/export/export_search_index.py) | `_merge_person` 维护 **`id_roles`**；写出 **`movie_roles`** 与断言 |
| 搜索索引类型 | [`frontend/src/types/searchIndex.ts`](../../frontend/src/types/searchIndex.ts) | **`PersonEntry.movie_roles?`** |
| 索引校验 | [`frontend/src/data/validateSearchIndex.ts`](../../frontend/src/data/validateSearchIndex.ts) | **`movie_roles`** 可选存在时的严格校验 |
| 星座几何与同步 API | [`frontend/src/three/constellation.ts`](../../frontend/src/three/constellation.ts) | **`createConstellation`**、**`CONSTELLATION_SURFACE_GAP_WORLD`**、缩进与分组逻辑 |
| 场景集成 | [`frontend/src/three/scene.ts`](../../frontend/src/three/scene.ts) | 挂载 mesh、**`syncConstellationFromStores`**（**`computeActiveWorldRadius`** + **`getSelectionMaskPickSet`** + **`hasFilmFocus`**）、store / index 订阅 |
| Store | [`frontend/src/store/galaxyInteractionStore.ts`](../../frontend/src/store/galaxyInteractionStore.ts) | **`selectionPersonKey`**；**`setSearchMode` / `clearSearch`** 清空 |
| HUD | [`frontend/src/components/SearchBar.tsx`](../../frontend/src/components/SearchBar.tsx) | 影人写入 **`selectionPersonKey`**；genre 写 **`null`** |
| 调试 | [`frontend/src/three/scene.ts`](../../frontend/src/three/scene.ts) | **`window.__galaxyInteraction.constellationEnabled`** 读写 |
| 测试 | [`frontend/src/three/constellation.test.ts`](../../frontend/src/three/constellation.test.ts)、[`frontend/src/data/loadSearchIndex.test.ts`](../../frontend/src/data/loadSearchIndex.test.ts) | 行为与 schema |

---

## 3. 数据契约补充（`movie_roles`）

- **位置**：`galaxy_search_index.json.gz` → `people[normalized_key].movie_roles`
- **类型**：对象，键为 **十进制字符串 TMDB `id`**，值为 **整数 1..63**（与 Tech Spec 中 **`role_mask`** 位定义相同，该片上该人所任职务的按位或）
- **与 `movie_ids` 关系**：键集合与 **`movie_ids`** 作为集合一致；每条值满足 **`(value & ~role_mask) === 0`**

---

## 4. 运行时操作（本地 / CI）

1. 在具备 **`galaxy_data.json(.gz)`** 的环境下执行：  
   **`python scripts/export/export_search_index.py`**  
   （或由主导出脚本连带写出，与仓库现有流程一致。）
2. 确认 **`frontend/public/data/galaxy_search_index.json.gz`** 已更新且前端能加载；控制台应有 **`[SearchIndex]`** 类日志（项目既有约定）。
3. 前端：**`npm run test`**、**`npm run build`** 通过。

---

## 5. 行为摘要（mermaid）

```mermaid
flowchart TB
  subgraph data [Search index]
    MR[movie_roles per film]
  end
  subgraph store [Zustand]
    SM[searchMode person]
    SK[selectionPersonKey]
    IDS[selectionIds by date]
    FOC[selectedMovieId]
  end
  subgraph three [Three constellation]
    G1[Producers chain]
    G2[Crew chain dir|dop|writers|music]
    G3[Cast chain]
  end
  MR --> G1
  MR --> G2
  MR --> G3
  SM --> three
  IDS --> three
  SK --> MR
  FOC -.->|non-null hide| three
```

---

## 6. Git 提交序列（分支 `feature/p12.7-constellation-by-role`）

以下为实施 P12.7 相关、自 **`63101ce`** 起的提交（自新到旧；与 **`e7b55f9`** 之前的主线合并点无关）：

| Commit | 说明 |
|--------|------|
| `3ca3bd7` | 文档化注释整理；保持 **`CONSTELLATION_SURFACE_GAP_WORLD = 0.2`** |
| `f8ebb6b` | **`CONSTELLATION_SURFACE_GAP_WORLD`** 调至 **0.2** |
| `1ae0cd2` | **focus 隐藏**；**端点按 active 半径 + gap 缩进** |
| `d2cc231` | 线 **`opacity: 0.07`** |
| `2fe903e` | **纯白线**，去掉按组分顶点色 |
| `09c2c32` | **三组职位链**（制片 / 主创合并 / 演员） |
| `63101ce` | **初版 P12.7**：`movie_roles` 管线 + **`selectionPersonKey`** + **`constellation.ts`** + **scene** 挂载与订阅 |

---

## 7. 验收对照（计划 + 迭代需求）

| 验收项 | 结果 |
|--------|------|
| 影人 select → 时间序「星座」折线 | **达成**（三组 + 降级单链） |
| genre select → 无连线 | **达成** |
| focus 单片 → 无连线 | **达成** |
| 线不切入 active 球体 | **达成**（半径 + **`CONSTELLATION_SURFACE_GAP_WORLD`**） |
| 与 mask / 拾取半径一致 | **达成**（复用 **`computeActiveWorldRadius`**） |
| 性能 | 线段数量受 **`maxSegments`**（默认 420）与选中片数限制；未引入每帧全量重算以外的额外 RAF 路径（仅 store / 索引引用变化时 **`sync`**） |

---

## 8. 已知限制与后续可选

- **索引体积**：全量 `movie_roles` 增大 gzip；若需压缩可考虑紧凑编码（如 `pairs` 数组），需改管线 + 前端解析，**本 Phase 未做**。
- **Leva 仅 `constellationEnabled`**：未单独暴露 **`opacity` / `surfaceGap`**；调参改 **`constellation.ts`** 常量或后续加 debug 面板。
- **Tech / Design 主文档**：本报告为 **实施记录**；若要将 **`movie_roles`** 与三组连线写入 Tech Spec / 状态机 / 视觉总表，建议走 **P12.9 文档同步** 或独立 doc PR。

---

## 9. 参考链接

- [Phase 12 计划](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md)（P12.7 原始条目 + 依赖顺序）
- [Tech Spec · 搜索索引](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md)（`role_mask` 位表；`movie_roles` 建议在后续文档版本中单开小节说明）
- [星球状态机 spec](../project_docs/星球状态机%20spec.md)（select 会话、连线条件、`constellationEnabled`）
