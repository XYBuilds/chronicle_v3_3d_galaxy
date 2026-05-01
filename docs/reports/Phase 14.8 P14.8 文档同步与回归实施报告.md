# Phase 14.8 — 文档同步与回归实施报告

**日期**：2026-05-02  
**分支**：`phase-14-p148-doc-sync`  
**范围**：P14.0–P14.7.1 已落地能力在 **Design Spec** / **视觉参数总表** 中的对齐；`frontend/src` 汉字字面量审计；回归清单归档（以文档与代码交叉引用为准，手工/UI 验收由 Storybook 与本地运行承担）。

---

## 1. 文档变更摘要

### 1.1 `docs/project_docs/TMDB 电影宇宙 Design Spec.md`

- **§2.2**：`FocusLReference` 与 **`FocusSizeReferenceRings`** 并列说明更新为含 **Phase 14.7.1**（竖直色带、低分在底/高分在上、与 **`voteNorm`** 一致、星球左侧布局、与横置 Timeline / Drawer 分工）。
- **§3.1**：当前年标记段去掉「底部并列 L 参考」旧表述，改为与 **P14.7.1** / **`?timeline=horizontal`** / 右上角控件一致的空间分工说明。
- **§3.4.1**：新增 **Details 四组显隐（Phase 14.6）** 摘要（组 1–4、占位 `/`、Runtime=0、Budget/Revenue 含 0 为无、与 plan §P14.6 / `Drawer.stories` 对照）。
- **§3.6**：标题扩展为「键盘快捷键**与全屏控件**」；补充 **`FullscreenButton`** 路径与事件；**Cmd/Ctrl+K** 补充 **`data-galaxy-search-input`** 与「不与 combobox 语义冲突」说明。

### 1.2 `docs/project_docs/视觉参数总表.md`

- **扫描基线**段落：日期 **2026-05-02**，并一句概括 **Phase 14**（`STRINGS`、`CloseButton`、画布/DOM edge 分工、全屏与 Cmd/Ctrl+K、`?timeline=`、Drawer Details、**P14.7.1** `FocusLReference`）。
- 新增 **§7c**「Phase 14 控件与 query」速查表（置于 **§7b** 之后，章节序 **7 → 7a → 7b → 7c → 8**）。

### 1.3 代码（审计口径）

- `frontend/src/hud/FocusLReference.tsx`：两处 JSDoc 内中文改为英文，避免与「生产 UI 路径零汉字」审计混淆（逻辑未改）。

---

## 2. `frontend/src` 汉字审计（`\p{Han}`）

**方法**：工作区内对 `frontend/src/**/*.{ts,tsx}` 执行 Unicode 汉字类匹配（等价于计划中的 `rg '[\u4e00-\u9fff]'` 意图）。

**结论（2026-05-02）**：

- **生产 UI 字符串**：以 `STRINGS` / `en.json` 为准；本次抽样未在 JSX 用户可见字面量中发现汉字。
- **仍含汉字的行**：主要分布于 **注释 / JSDoc**（如 `App.tsx`、`scene.ts`、`SearchBar.tsx`、`planet.ts` 等）及 **Storybook fixture**（如 `subsampleMovies.ts` 中 **`日本語`** 作为 **`spoken_languages`** mock 数据）。与 **P14.1 验收口径**（允许注释、dev log、stories mock）一致。

若本机安装 **ripgrep**，可复现：

```bash
rg '\p{Han}' frontend/src --glob '*.{ts,tsx}'
```

---

## 3. 回归清单（计划 §P14.8 归档）

| 项 | 状态 |
| --- | --- |
| Loading / Error 页英语完整 | 以 **P14.1** 与 `STRINGS` 为准；未在本子任务改代码 |
| Drawer Details 四组、关闭按钮、Tooltip / SearchBar / InfoModal 英语 | 见 **Design Spec §3.4.1** 新增摘要 + 既有 §3 / §4 |
| hover ring 与 Timeline：`--ui-edge-canvas-*`；`?theme=light` 分工 | **§7 / §7a** + **Design Spec §3.5** |
| 全屏 + **F** | **§7c** + **Design Spec §3.6** |
| **Cmd/Ctrl+K** 不与文本输入冲突 | **§3.6** + `App.tsx` 实现 |
| **`?timeline=horizontal`** | **§7c** + **Design Spec §3.1.1** |
| Phase 13 focus 体验在英语化后无回归 | 回归以运行态与 Storybook 为准 |
| **P14.7.1** `FocusLReference` 竖条 + 左侧 | **§2.2**、**§3.1**、**§7c** |

---

## 4. 参考

- 计划：`.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md`（§P14.6 / §P14.8）
- P14.3 实施报告：`docs/reports/Phase 14.3 P14.3 hover ring 与 Timeline UI edge 对齐实施报告.md`
- P14.1 实施报告：`docs/reports/Phase 14.1 P14.1 HUD string table 与 en.json 实施报告.md`
