# HUD 视觉吸收对照清单（Phase 9.0）

> **范围**：P9.0 仅作设计与对照，**不修改应用代码**。  
> **参考来源**：历史文件 `docs/temp/drawer example.js`（在仓库中曾用于视觉预览；于 `46cf40c` 从文档中移除。下文对照以该版 JSX 的类名与结构为准。）

## 1. 从参考示例中**拟吸收**的视觉与排版项

| 区域 | 参考中的做法（语义） | 产品侧落地说明 |
| ---- | -------------------- | ---------------- |
| **全局层级** | 浅色壳：`bg-zinc-50` 页面底；抽屉 `bg-white`、`border-zinc-200/80`、轻阴影 | 暗色 HUD 不照搬 hex；**在 shadcn token 上对齐层次**：`bg-popover` / `border-border` / `text-foreground` / `text-muted-foreground`，达到与 zinc 例类似的**明度阶梯**关系。 |
| **Sheet 头部 — 主标题** | `text-2xl font-bold text-zinc-900 pr-8 leading-tight` | 吸收为 **`text-2xl font-bold leading-tight`**，颜色用语义 `text-foreground`（P9.1 实施）。 |
| **Sheet 头部 — 副标题** | `text-sm text-zinc-500 mt-2 font-medium`（原语言标题等） | 与现有 `original_title` 副标题位一致；**`original_title === title` 时仍不显示**（产品规则保留）。 |
| **评分行** | 单行 `flex flex-wrap items-center gap-x-4 gap-y-2`；星 + 分；`text-zinc-500` 票数；日期同排 | 吸收为 **★ + score + N votes + Date** 同一视觉行、**`gap-x-4 gap-y-2`**；Badge 同尺寸更紧凑（P9.1）。 |
| **类型标签** | `px-3 py-1 bg-zinc-200/70 text-zinc-700 text-xs font-medium rounded-full` | 参考为例示密度；**流派染色**以 P9.2 的 `genre` variant + `meta.genre_palette` 为准，不沿用灰 pill。 |
| **海报** | `aspect-[2/3] rounded-xl shadow-sm`、hover 用 `group` 预留 | 与现有 **AspectRatio 2/3** 一致；吸收 **`rounded-xl shadow-sm` + 轻 hover transition**；**`DrawerPoster` 加载失败/无图** 的占位逻辑保留。 |
| **Tagline** | `blockquote` + `border-l-[3px] border-zinc-300 pl-4 text-zinc-500 italic` | 吸收为左侧竖线 slogan：**`border-l-2`、斜体、 muted 色**（P9.1）。 |
| **Overview 区块标题** | `text-xs font-bold text-zinc-400 tracking-wider mb-3 uppercase` | 吸收为 **小字、加粗、** **`tracking-wider uppercase`**（P9.1 计划约 **`text-[0.65rem]`** 档）。 |
| **Overview 正文** | `text-zinc-700 text-[15px] leading-relaxed` | 吸收为 **`text-sm leading-relaxed`**，色用 `text-foreground` / 语义次色。 |
| **Details** | 标题同 Overview 风格；**`grid grid-cols-2 gap-y-5 gap-x-4`**；`font-semibold` label + 值 `text-zinc-500` | 从 `dl` 转为该 **2 列网格** 与**标签/值**层次（P9.1）。 |
| **Cast** | **`grid-cols-2` `gap-x-4 gap-y-2.5`**；**`index+1` + 数字宽度 + `truncate` 名称** | 与 ScrollArea 组合：在 **sm 以上** 保持双列与编号；**窄屏** 可退化为**单列**（P9.1）。 |
| **外部链接** | 参考示例**未包含** IMDb | 产品增：**`movie.imdb_id` 有值时** 展示 **ghost 按钮** → `https://www.imdb.com/title/{imdb_id}/`（P9.1）。位置建议：**与头部元信息行同区或紧挨标题区下方**，不遮挡关抽屉。 |

## 2. 明确**保留**（不替换为参考中的简易实现）

| 项 | 原因 |
| --- | --- |
| **shadcn `Sheet` / `SheetContent` / 头部/描述结构** | 可访问性、焦点与关抽屉行为与产品一致。 |
| **`Dialog` 系**（如 Info 弹层等） | 同左；与 P9.4 对齐时只动**内部排版**，不剥壳。 |
| **`AspectRatio` 包海报** | 比例与现实现一致。 |
| **`ScrollArea` 包 Cast 长列表** | 避免整页滚动与抽屉动效冲突。 |
| **`DrawerPoster` 独立 fail 状态** | 海报 URL 空/错图时仍有可读占位。 |
| **`SHEET_OPEN_EASE`**（`cubic-bezier(0.215, 0.61, 0.355, 1)`，open ~300ms / close ~450ms） | Phase 4.3 已定稿；**不改为** 参考里纯 CSS `duration-300 ease-in-out` 的简化替代，除非单独开 UX  task。 |

## 3. 决策回写：URL `?theme=light|dark`

- **用途**：**开发与验收**时快速查看 HUD 在亮/暗变量下的表现。  
- **产品预期**：`?theme=light` / `?theme=dark` 在 **App mount**（或 query 变化时，若实现）写入 **`<html data-theme>`** 即可；**不** 要求 Three.js 画布、星空背景随浅色主题重算配色（**canvas 可仍为深色底**）。  
- 详细实现见 P9.5；本清单仅作决策记录。

## 4. 与后续子任务的对应

| 本清单节 | 主要落地 |
| -------- | -------- |
| §1 全节 | P9.1 Drawer 视觉 + 6 人字段、IMDb；P9.2 流派色；P9.3～P9.4 Tooltip / InfoModal。 |
| §2 | 全部 Phase 9 的代码改动在以上保留项边界内。 |
| §3 | P9.5 实施；P9.6 文档在 Design Spec / 视觉总表处同步节录。 |

---

*文档版本：Phase 9.0（P9.0 交付）。*
