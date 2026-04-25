# Phase 7.4 · P7.4 I5 HUD INFO 按键 — 实施报告

> 对应 [Phase 7 plan（I2 + I5 + I6）](../../.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md) 中的 **P7.4（I5：HUD INFO 仅 UI / 交互骨架）**：右上角入口、居中 Modal（Base UI Dialog）、分区占位文案集中在 `infoCopy.ts`；本阶段**不写入** TMDB 正式 attribution、**不链** README / 仓库地址、**不在运行时**引用 `docs/project_docs/*`。

## 1. 做了什么事

| 项目 | 说明 |
|------|------|
| **Git 分支与提交** | 在分支 `feature/p7-4-i5-info-hud` 上迭代；与 INFO 相关的提交链为：`fbe0848`（初版：右上角 + Sheet 侧栏）→ `98b8141`（按反馈改为 Timeline 旁入口 + **居中 Modal**）→ `b885cd0`（按反馈将入口**恢复为右上角**，保留 Modal）。 |
| **入口** | [`frontend/src/hud/InfoButton.tsx`](../../frontend/src/hud/InfoButton.tsx)：`fixed`、`z-40`，`right-3 top-3`（`sm:right-4 sm:top-4`），玻璃态次要按钮 + `Info` 图标；[`App.tsx`](../../frontend/src/App.tsx) 在 `MovieTooltip` 之后挂载 `<InfoButton />`。 |
| **面板形态** | 采用 **居中 Modal**，而非左侧 Sheet。新增 [`frontend/src/components/ui/dialog.tsx`](../../frontend/src/components/ui/dialog.tsx)（`@base-ui/react/dialog`，与现有 [`sheet.tsx`](../../frontend/src/components/ui/sheet.tsx) 同源），导出 `Dialog`、`DialogContent`（Portal + Backdrop + Popup）、`DialogHeader` / `DialogTitle` / `DialogDescription`、关闭按钮等。 |
| **内容与结构** | [`frontend/src/hud/InfoModal.tsx`](../../frontend/src/hud/InfoModal.tsx)：受控 `Dialog`，`DialogContent` 的 `id="app-info-dialog"` 与入口 `aria-controls` 对齐；标题区 + `ScrollArea` 内四段分区（项目简介 / 数据来源 / 技术栈 / 链接）。 |
| **占位文案** | [`frontend/src/hud/infoCopy.ts`](../../frontend/src/hud/infoCopy.ts)：各分区导出常量；字段旁或文件头显式 **`TODO: fill at project wrap-up`**；可见正文为「（占位）…」类表述；标题常量为 `INFO_MODAL_TITLE`（定稿命名，与 Modal 一致）。 |
| **Timeline** | 曾将入口放在 `TimelineHud` 左侧列上方（提交 `98b8141`）；最终版已从 [`Timeline.tsx`](../../frontend/src/components/Timeline.tsx) 移除 INFO 相关代码，时间轴无障碍属性恢复为与 INFO 拆分前的语义（外层 `presentation`/`img` + 轴说明，`slider` 仅交互态轨道）。 |

## 2. 与计划原文的差异（ intentional ）

| 计划原文（摘要） | 定稿实现 |
|------------------|----------|
| 「`InfoButton.tsx` + `InfoSheet.tsx`」 | 无 `InfoSheet`；面板为 **`InfoModal.tsx`** + 共享 **`dialog.tsx`**。 |
| 「复用 shadcn Sheet 或 Dialog」 | 选用 **Dialog（Modal）**，避免与右侧电影详情 **Sheet** 同形态抢侧向注意力；z-index 与电影层叠由 portal 顺序与 `z-50`/`z-[51]` 处理。 |
| 「与用户确认放置点（右上角 / Timeline 侧边）」 | 两种均实现过；**当前定稿为右上角**（`b885cd0`）。 |

## 3. 交互与无障碍

| 项目 | 说明 |
|------|------|
| **打开 / 关闭** | 点击入口打开；`Dialog` 默认支持 **ESC**、**点击遮罩**关闭；右上角 **ghost 关闭**按钮。 |
| **可达性** | 入口：`aria-haspopup="dialog"`、`aria-expanded`、`aria-controls="app-info-dialog"`、`sr-only` 说明；Modal：`DialogTitle` / `DialogDescription`（含占位说明句）。 |
| **滚动** | 正文区 `ScrollArea` + `max-h-[min(70dvh,28rem)]`，长文占位阶段可验证滚动条行为。 |

## 4. 构建与静态检查

| 检查 | 结果（实施时） |
|------|----------------|
| `npm run build -w frontend`（`tsc -b` + `vite build`） | 通过 |

## 5. 验收对照（计划 P7.4）

- [x] HUD INFO **仅 UI / 骨架**，四分区占位 + `TODO: fill at project wrap-up`。  
- [x] **无** TMDB 正式 attribution、**无** README / 仓库外链、**无** runtime 拉取 `docs/project_docs/*`。  
- [x] 打开 / 关闭动效、遮罩、关闭控件；键盘 **ESC**；焦点与 Modal 行为由 Base UI Dialog 提供。  
- [x] 入口与 Timeline / 电影 Drawer 拆分：入口 `z-40`，Modal 与 Sheet 使用独立 portal 层。  
- [ ] **产品侧肉眼验收**（布局偏好、与 GH Pages 子路径联调）— 建议在合并默认分支后于线上与本地各走一遍。

## 6. 未纳入本次的范围

- **INFO 正式文案**、TMDB attribution、公开 URL 说明等，仍按 Phase 7 总边界延至 **对外收尾阶段**；届时主要改 `infoCopy.ts` 即可。  
- **P7.3**（I2 人工扫参）、**P7.5**（阶段收尾汇总）仍为独立条目。

## 7. 相关链接

- Plan：[`.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md`](../../.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md)  
- 前置依赖：**P7.2**（GitHub Pages + gzip）— 见 [Phase 7.2 实施报告](./Phase%207.2%20P7.2%20I6%20GitHub%20Pages%20与%20gzip%20数据%20实施报告.md)。
