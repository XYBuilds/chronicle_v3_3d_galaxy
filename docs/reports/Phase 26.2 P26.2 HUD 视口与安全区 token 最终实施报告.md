# Phase 26.2 — HUD 视口、安全区与 token（最终实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 26（设备与空间感优化）子项 **P26.2** |
| 计划来源 | [`.cursor/plans/phase_26_device_spatial_optimization.plan.md`](../../.cursor/plans/phase_26_device_spatial_optimization.plan.md) §「P26.2 小屏布局系统化验收」 |
| 日期 | 2026-05-13 |
| 状态 | **已落地**：`frontend/src/index.css` 中 `:root` token 与各 HUD 组件引用已收敛；**Design Spec** 已吸收原临时 HUD 设计体系为 **§3.0**。 |
| 报告性质 | **工作留档**：汇总本阶段最终决策与已执行操作。**规范 SSOT** 以 [`docs/project_docs/TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) **§3.0** 与仓库内 **`frontend/src/index.css`** 当前变量为准；若与本报告数字不一致，以代码与 Design Spec 为准。 |

**范围说明**：本阶段聚焦 **MacBook 默认缩放级横屏** 下的 HUD 回归与 **viewport / safe-area / z-index** 的 token 化；**不**包含 P26.1 色彩矩阵、**不**包含 P26.3 camera-distance cull 实验（见总计划）。

---

## 1. 目标（与计划对齐）

1. **系统化小屏 / 压窗布局验收**：drawer、focus HUD（含 rating 参考与退出按钮）、竖/横 Timeline、搜索、Info modal 等在 **较短 `dvh`、方屏～超宽、刘海 safe-area** 下避免功能性裁切或与核心星球严重争位。
2. **收敛 viewport clamp**：以 **少量 `:root` 语义变量** 替代散落 magic number；边距与 **`env(safe-area-inset-*)`** 的组合规则写入 Design Spec，便于后续 PR 对齐。
3. **叠放语义可推理**：用 **`--z-hud-*`** 固定层级顺序；避免「单组件临时 +10」破坏可读性（Drawer / Modal / 搜索联想层关系明确）。

---

## 2. 最终决策总表

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **设计基准视口** | **约 1600×900（逻辑像素）横屏** 为 HUD 间距、密度与回归截图的**首要参照**；**非分辨率硬下限**，更小横屏以 **无功能性裁切** 为底线。 |
| D2 | **输入与设备** | **桌面 / 笔记本 + 鼠标指针**；**不做触屏专项**（无 44px 热区、不验手指遮挡）；平板 / 手机非目标。 |
| D3 | **纵横比带** | **1∶1～超宽** 连续变化；布局两端可读、关键控件不争位。 |
| D4 | **内容框（刘海）** | 常驻 HUD 边距与 **`max(token, env(safe-area-inset-*))`** 组合，优先服务 **刘海 MacBook**；不与「触控安全区」混用叙事。 |
| D5 | **统一 gutter token** | **`--hud-inset-xs` / `--hud-inset-sm` / `--hud-inset-md` 均为 `1rem`**，产品约定**不做阶梯缩小**。 |
| D6 | **Drawer 最大宽度** | **`--hud-drawer-max-w = min(0.28×100vw, 32rem, 右侧留白公式)`**：`0.28` 为 Focus Perlin 中心带留白；`32rem` 为行长软上限；第三项含 **safe-area-right**。 |
| D7 | **Drawer 最小宽度** | **`--hud-drawer-min-w: 18rem`**，保障详情排版；极窄下可能与 max 竞合，行为以 CSS min/max 解析为准（见 §7）。 |
| D8 | **Sheet 默认值修复** | 自 **`sheet.tsx`** 移除右侧 **`data-[side=right]:sm:max-w-sm`**，否则与 Drawer 上 `max-w-[var(--hud-drawer-max-w)]` 合并不稳定，出现「改 token 无视觉变化」。 |
| D9 | **FocusLReference 水平** | 左缘 `max(inset, 50vw − centerGap)`，其中 **`centerGap = max(6rem, 100vw/6)`** — 距水平中心至少 **1/6 视口宽**，且不低于 **6rem**。 |
| D10 | **FocusLReference 竖直** | **`height = max(12rem, 40vh)`**（`calc(100vh * 0.4)`），避免过矮窗口条不可读。 |
| D11 | **z 序（实现事实）** | **`--z-hud-search`（75）高于 Hover（60）与 Tooltip（65）**，以便搜索联想层压在画布悬停反馈之上；Drawer（110）、Modal（120+）更高 — 见 **Design Spec §3.0.5** 与下表 §4.2。 |
| D12 | **画布锚点性能** | Hover 锚点在 **pointer 路径**更新并 **去重**，**非** rAF 每帧向 React 灌入；`worldToScreenCss` 与 **`screenRadius.ts` 单一来源**，避免 `interaction.ts` 重复声明。 |
| D13 | **文档 SSOT** | 原 **`docs/temp/HUD_Design_System.md`** 思想并入 **Design Spec §3.0**（3.0.1–3.0.13），临时文件**删除**；**§2.2 / §3.7 / §4.1** 已与 token 实现交叉更新。 |

---

## 3. 工程操作（修改路径一览）

| 路径 | 操作摘要 |
|------|-----------|
| [`docs/project_docs/TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) | 新增 **§3.0**（HUD 空间设计体系）；同步 **§2.2** Drawer 叠放、**§3.7** 顶栏描述、**§4.1** 搜索条布局与 z 说明。 |
| `docs/temp/HUD_Design_System.md` | **已删除**（避免与主 Design Spec 双轨）。 |
| `frontend/src/index.css` | `:root` 集中定义 **`--hud-*`**、**`--z-hud-*`**；注释指向 Design Spec **§3.0**。 |
| `frontend/src/App.tsx` | Cover veil/brand、右上工具条：使用 **`var(--z-hud-*)`** 与 **`max(var(--hud-inset-*), env(safe-area-*))`** 等。 |
| `frontend/src/components/SearchBar.tsx` | 顶距、宽度 **`--hud-search-width`** / **`--z-hud-search`**。 |
| `frontend/src/components/Timeline.tsx` | 竖轴左 inset + safe-area；横轴底边距 + **`--hud-timeline-h-margin-bottom*`**；**`--z-hud-timeline`**。 |
| `frontend/src/hud/FocusLReference.tsx` | **`--hud-focus-ref-center-gap`**、**`--hud-focus-ref-height`**；**`--z-hud-focus-chrome`**。 |
| `frontend/src/hud/FocusExitButton.tsx` | **`--hud-focus-exit-*`**、**`--z-hud-focus-exit`**。 |
| `frontend/src/hud/HoverRing.tsx` | **`--z-hud-hover-ring`**。 |
| `frontend/src/components/MovieTooltip.tsx` | **`--z-hud-tooltip`**。 |
| `frontend/src/components/Drawer.tsx` | 右侧 **`min-w` / `max-w`** 绑定 drawer token；**`sm:`** 双写以稳定 tailwind-merge；注释说明与 planet-safe 关系。 |
| `frontend/src/components/ui/sheet.tsx` | 移除 **`data-[side=right]:sm:max-w-sm`**（左侧 sheet 仍保留 `sm:max-w-sm`）。 |
| `frontend/src/components/ui/dialog.tsx` | Modal overlay/content：**`--z-hud-modal-*`**；宽度使用带下划线空格的 `calc(100vw_-_2_*_var(--hud-inset-md))` 以兼容 Tailwind 任意值生成。 |
| `frontend/src/hud/InfoModal.tsx` | 宽度与 **`--hud-modal-max-w`** / inset 一致。 |
| `frontend/src/hud/LanguageSwitch.tsx` | 下拉菜单 **`--z-hud-lang-menu`**。 |
| `frontend/src/components/ui/tooltip.tsx` | Tooltip 容器与箭头 **`--z-hud-tooltip`**。 |
| `frontend/src/three/interaction.ts` | 去除与 **`screenRadius.ts`** 重复的 **`worldToScreenCss`** 本地定义；补齐 **`_worldProject`** 等向量声明，保证类型检查与运行时一致。 |
| `frontend/src/three/screenRadius.ts` | 注释指向 Design Spec **§3.0.3.3**（画布锚点）。 |

---

## 4. 关键常量速查（以仓库 `index.css` 为准）

### 4.1 布局与抽屉

| 符号 | 当前值 / 表达式 |
|------|-----------------|
| `--hud-inset-xs` / `--hud-inset-sm` / `--hud-inset-md` | `1rem` |
| `--hud-gap-stack` | `0.5rem` |
| `--hud-search-max-w` | `32rem` |
| `--hud-search-width` | `min(var(--hud-search-max-w), calc(100vw - 2 * var(--hud-inset-sm) - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px)))` |
| `--hud-drawer-max-by-planet-safe` | `calc(100vw * 0.28)` |
| `--hud-drawer-max-readable` | `32rem` |
| `--hud-drawer-max-w` | `min(上两者, 100vw - inset - max(inset, safe-area-right))`（见源码三参数 `min`） |
| `--hud-drawer-min-w` | `18rem` |
| `--hud-timeline-h-margin-bottom` / `-sm` | `2rem` / `2.5rem` |

### 4.2 Focus 参考条与 z-index

| 符号 | 当前值 / 表达式 |
|------|-----------------|
| `--hud-focus-ref-center-gap-from-vw` | `calc(100vw / 6)` |
| `--hud-focus-ref-center-gap-min` | `6rem` |
| `--hud-focus-ref-center-gap` | `max(6rem, 100vw/6)` |
| `--hud-focus-ref-height-from-vw` | `calc(100vh * 0.4)` |
| `--hud-focus-ref-height-min` | `12rem` |
| `--hud-focus-ref-height` | `max(12rem, 40vh)` |
| `--hud-focus-exit-below-center` / `-lg` | `22rem` / `24rem` |
| `--hud-focus-exit-viewport-pad` | `4rem` |
| `--z-hud-cover-veil` … `--z-hud-modal-content` | `25` → `121`（栈顺序见 `index.css` 块注释） |

---

## 5. 验证与回归

| 项 | 结果 / 说明 |
|----|----------------|
| **`npm run build`**（`frontend/`） | 本阶段改动后 **`tsc -b && vite build`** **通过**（exit code 0）。构建日志中既有字体解析、chunk 体积、`dist` 大文件等告警为仓库既有现象，**非 P26.2 引入**。 |
| **类型检查** | 对 `interaction.ts` 等改动执行过 **`npx tsc -b`**，用于确认无重复声明 / 未声明符号。 |
| **手工建议** | 在 **约 1600×900**、**约 1∶1**、**超宽** 各一屏：打开 Drawer、进入 Focus、切换 **`?timeline=horizontal`**，确认搜索条、rating 参考条、退出按钮、Timeline 与刘海 safe-area 无裁切；确认搜索展开层与 Hover 环层级符合预期。 |

---

## 6. 后续建议（非本阶段承诺）

1. **P26.4**：若总计划收口，可将《视觉参数总表》中与 HUD 几何强相关的条目（若有）与 **§3.0** 再对表一次，避免双处漂移。  
2. **P26.3**：camera-distance idle near-cull 实验与透明排序 / picking 契约变化时，须回写 Tech Spec / 状态机 spec，与 **§3.0.3.3** 锚点叙事对齐。  
3. **Drawer 极窄竞合**：若产品要求「再窄也不得突破 planet-safe 上限」，可考虑将 `min-w` / `max-w` 收敛为单一 **`width: clamp(...)`** 表达式（需单独设计稿与回归）。

---

## 7. 已知说明

- 浏览器控制台出现 **`content-script.js`**、第三方扩展域名脚本报错时，优先怀疑**扩展注入**；仅当栈明确落在 **`frontend/src/**/*.ts`** 打包 chunk 时再按项目源码排查。  
- **`min-w` 大于 `max-w`** 时，最终 used width 以 CSS 规范为准，可能短期让 Drawer **视觉上宽于** `0.28×100vw` 的意图上限（见 **§6** 第 3 条后续建议）。

---

## 8. 变更清单（便于 code review）

**文档**

- 更新：`docs/project_docs/TMDB 电影宇宙 Design Spec.md`（新增 §3.0，修订 §2.2、§3.7、§4.1）
- 删除：`docs/temp/HUD_Design_System.md`
- 新增 / 更新：本文件 `docs/reports/Phase 26.2 P26.2 HUD 视口与安全区 token 最终实施报告.md`

**前端**

- `frontend/src/index.css`
- `frontend/src/App.tsx`
- `frontend/src/components/SearchBar.tsx`
- `frontend/src/components/Timeline.tsx`
- `frontend/src/components/Drawer.tsx`
- `frontend/src/components/ui/sheet.tsx`
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/components/ui/tooltip.tsx`
- `frontend/src/hud/FocusLReference.tsx`
- `frontend/src/hud/FocusExitButton.tsx`
- `frontend/src/hud/HoverRing.tsx`
- `frontend/src/hud/InfoModal.tsx`
- `frontend/src/hud/LanguageSwitch.tsx`
- `frontend/src/components/MovieTooltip.tsx`
- `frontend/src/three/interaction.ts`
- `frontend/src/three/screenRadius.ts`

**背景索引（非仓库 SSOT）**

- Cursor agent transcripts：`eb982689-98c3-4d62-946a-1d41fa9650fd`、`15c65276-9c41-4098-a9cb-d46394619336`

---

## 9. Git 提交线索（便于审计）

精确哈希以本地 `git log` 为准；建议筛选路径：

`git log --oneline -- docs/project_docs/TMDB\ 电影宇宙\ Design\ Spec.md docs/reports/ frontend/src/index.css frontend/src/App.tsx frontend/src/components/Drawer.tsx frontend/src/components/ui/sheet.tsx frontend/src/hud/FocusLReference.tsx frontend/src/three/interaction.ts`

---

## 10. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-13 | 初稿：合并临时 HUD 设计体系至 Design Spec §3.0；token 落地与工程清单。 |
| 2026-05-13 | **改版**：对齐 Phase 26.1 / 25.1 报告体例（元信息表、目标对齐、决策编号、路径一览、常量速查、验证、后续建议、变更清单与 git 线索）。 |
