# Phase 22.3（P22.3）— 海报导出档位 w500 → w780 — 实施报告

> **范围**：在 **Python 导出管线** 将 TMDB 海报基址从 **`w500`** 升级为 **`w780`**；同步 **Storybook** 子样本 fixture 中的 `poster_url`。**不**在前端做按 DPR 动态换档；**不**改 `galaxy_data.json` 字段契约（仍为完整 URL 字符串）。  
> **计划来源**：`.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md`（§ P22.3 海报 w780）  
> **报告日期**：2026-05-08

---

## 1. 最终决策（定稿）

| 议题 | 决策 |
|------|------|
| 换档目标 | TMDB Image CDN 基址 **`https://image.tmdb.org/t/p/w780`**（由 **`w500`** 上调）。 |
| 为何是 w780 | Drawer 主图在桌面约 **512×768** 物理像素量级；Retina 等高分屏需要更宽图源；**`w780`** 是 TMDB 标准宽度档位中与需求最贴近的一档；再上 **`w1280` / `original`** 体积与带宽成本偏高，本阶段不采用。 |
| 改动层面 | **仅导出阶段**改写 `poster_url`（`POSTER_BASE + poster_path`）；**不**增加前端「按设备换 w500/w780」的分支逻辑。 |
| 数据契约 | **`poster_url`** 仍为 **string**；旧部署中已存在的 **`w500`** URL **继续有效**，Drawer 仍可加载（向后兼容，无需前端判断版本）。 |
| JSON 体积 | 字段名与结构不变；URL 字符串长度变化可忽略，**gzip 体积影响可视为 negligible**（与计划一致）。 |
| Fixture 策略 | **`frontend/src/storybook/fixtures/subsampleMovies.ts`** 中四条样例电影的 `poster_url` 与生产基址 **对齐为 w780**，避免 Storybook / 单测与现行导出口径漂移。 |
| 文档 SSOT | **Tech Spec / Data Pipeline** 中仍写 **`w500`** 的表格句，留待 **Phase 22.9（P22.9）** 统一修订；本子任务 **不**批量改项目文档（与 P22.2 报告中「子阶段不扩文档面」一致）。 |
| 全量数据刷新 | **`frontend/public/data/galaxy_data.json(.gz)`** 需由运维/CI **重新执行** `export_galaxy_json.py`（或等价流水线）后才会全量变为 w780；**代码合并 ≠ 线上 JSON 自动更新**。 |
| Git 分支 | 实施分支名：**`p22-3-poster-w780`**。 |

---

## 2. 最终操作（代码与路径）

| 操作 | 路径 | 说明 |
|------|------|------|
| 提升海报基址常量 | [`scripts/export/export_galaxy_json.py`](../../scripts/export/export_galaxy_json.py) | **`POSTER_BASE = "https://image.tmdb.org/t/p/w780"`**（原 **`w500`**）。拼接逻辑不变：`poster_url = POSTER_BASE + (path 前导 `/` 规范化)`。 |
| 同步 Storybook 子样本 | [`frontend/src/storybook/fixtures/subsampleMovies.ts`](../../frontend/src/storybook/fixtures/subsampleMovies.ts) | 四条 **`poster_url`** 内 **`/w500/` → `/w780/`**（`subsampleMovieMarthasVineyard`、`ParadiseRoad`、`Kika`、`Happiness`）。 |

**未包含在本子任务中的操作（按计划在其它环节完成）**

- 全量重导出 `galaxy_data.json` / `.gz`（与 P21.1 normalize v2 等共享一次 cron 或 **workflow_dispatch** 即可）。  
- P22.9：在 **Tech Spec**、**Data Pipeline**、`poster_url` 说明处将 **`w500`** 改为 **`w780`** 的文档同步。

---

## 3. Git 提交摘要

| Hash（简写） | 说明 |
|--------------|------|
| `b8942d1` | **feat(pipeline)**：`POSTER_BASE` **w500 → w780**；**`subsampleMovies.ts`** 四处 fixture URL 同步。 |

（若已合并入 `main`，以目标分支上 **`git log -- scripts/export/export_galaxy_json.py`** 为准。）

---

## 4. 验收记录

| 项 | 结果 |
|----|------|
| 前端单元测试 | **`frontend`** 下 **`npm run test`**（Vitest）：本子任务实施后 **81 / 81 通过**（实施时记录）。 |
| 线上抽屉海报 | 重导出并部署后：高分屏下主海报应 **更锐**（尤其 hover / 放大场景）；需在 **prod** 抽样目视确认。 |
| TMDB CDN | **`w780`** 路径应对常见 **`poster_path`** 返回 **200**；若个别片无图，行为与 **`w500`** 时代一致（空串或 TMDB 占位策略，非本改动引入）。 |
| 旧数据兼容 | 仍为 **`w500`** 的 `poster_url` **应继续可加载**，无需前端兼容分支。 |

---

## 5. 与计划 P22.3 的对照

| 计划项 | 结果 |
|--------|------|
| `export_galaxy_json.py` **`POSTER_BASE`** **w500 → w780** | **已完成**。 |
| Storybook fixtures **4 处 w500 → w780** | **已完成**。 |
| 重导出 | **运营/流水线动作**；非本 commit 必含交付物。 |
| 前端兼容旧 v1 / w500 | **无需代码**；计划要求满足。 |
| Tech Spec / Data Pipeline 文档 | **划归 P22.9**；本子任务未改。 |

---

## 6. 风险与回滚

| 风险 | 缓解 |
|------|------|
| 弱网首次打开 Drawer 时图片字节略增 | 海报本就 **按需加载**；可接受；若未来需优化再评估 **`srcset`** 或档位策略（超出 P22.3 范围）。 |
| 未重导出时 prod 仍为 w500 | 属 **预期**：仅代码升级导出脚本；全站 URL 切换依赖 **一次完整导出 + 部署数据产物**。 |

**回滚**：将 **`POSTER_BASE`** 改回 **`w500`** 并重新导出；fixture 同步回退即可。

---

## 7. 出口状态

| 项 | 状态 |
|----|------|
| 导出脚本默认海报档 | **`w780`**（`export_galaxy_json.py` **`POSTER_BASE`**）。 |
| Storybook 子样本 `poster_url` | 与 **`w780`** 基址一致。 |
| 公开 `galaxy_data.json` | 是否已为 w780 **取决于**是否已跑最新导出并发布数据文件。 |
| 本报告 | 作为 **P22.3 最终决策与操作** 的归档 SSOT。 |
