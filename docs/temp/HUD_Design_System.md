# The Movie Cosmos — HUD 设计体系（草案）

> **文档性质**：临时设计体系稿，用于收敛 Phase 26+ 设备与空间相关改造前的**共同语言**。定稿后应由 **P26.4 / 主 Design Spec §3** 吸收或替换本节中与 SSOT 冲突的表述。  
> **关联 SSOT**：[`TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) §3（HUD 界面规范）、[`TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md)（桥接与状态）、`frontend/src/lib/locales/en.json`（HUD 文案结构 SSOT）。

---

## 1. 目标设备与输入假设

| 维度 | 约定 |
|------|------|
| **设计基准（视口）** | **约 1600×900**（逻辑像素）**横屏**：HUD 间距、密度与 **P26.2 级回归截图** 的**首要参照**；版式与 Focus 邻域以该尺度「够用且舒服」为第一目标。**不是分辨率硬下限**——更小的横屏仍可访问；底线为 **无功能性裁切**（关键 CTA 可点、文案可读）， exhaustive 视觉 polish 优先低于设计基准。 |
| **主用户与输入** | 桌面 / 笔记本浏览器；**鼠标指针**为主交互。 |
| **纵横比** | 自 **1∶1（方屏）** 至 **超宽屏** 连续变化；布局须在「偏窄的横屏」与「极宽横屏」两端都可读、不重叠关键信息。 |
| **触控** | **不做触屏专项支持**（不要求 44px 触控热区、不做拇指区假设、不验收手指遮挡）。平板 / 手机为**非目标**，仅偶然访问时不保证体验。 |
| **刘海 / 相机housing** | **保留 §3.2 内容框**：用 `env(safe-area-inset-*)` 与 token 取 max，以适配 **带刘海的 MacBook** 等「横屏 + 物理遮挡」场景；与「触控安全区」无绑定。 |

以下各节在「断点、clamp、较短 `dvh`」等处均指：**以设计基准横屏为主、覆盖 1∶1～超宽的窗口缩放与浏览器 chrome**；**非**小屏手机竖屏专项。

---

## 2. 设计目标

| 目标 | 说明 |
|------|------|
| **可读** | 3D 画布始终是主角；HUD 低对比、细线、少遮挡。 |
| **可推理** | 任意控件的位置、层级、显隐都能用同一套**空间参照 + 模式**解释，而非「历史 class 堆叠」。 |
| **可验收** | **设计基准**下必过；另在 **1∶1～超宽** 与 **低于基准的横屏压窗** 做抽样，验收 **无功能性裁切** 与 **刘海内容框**（§3.2）。 |
| **可实现** | DOM 排版与画布锚点分工清晰，减少「为盖住某层临时改 z-index」。 |

**品牌叙述**（与仓库 branding 规则一致）：叙述性文字用 **The Movie Cosmos**；浏览器标题、封面、HUD 内品牌标识用 **the movie cosmos**。

---

## 3. 三层空间参照系

HUD 元素**不得混用参照系而不声明**。统一为下列三类之一。

### 3.1 视口框（Viewport frame）

- **定义**：以 `100vw` / `100dvh`（或等价 `fixed inset-0` 宿主）为外矩形，边距为设计 token（见 §6）。
- **适用**：搜索条、右上角工具组、时间轴（边对齐）、Cover 相关全屏层等**与星球投影无绑定**的排版。
- **实现提示**：优先相对「视口」`fixed` + token；在 **较短横屏高度** 或 **方屏导致水平紧张** 时用 `clamp` / `min()` 防止裁切；与 §3.2 配合处理刘海侧。

### 3.2 内容框（Content layout frame）

- **定义**：在视口框内侧再收缩一层：

  \[
  \text{inset}_{\text{edge}} = \max(\text{token}_{\text{edge}},\ \texttt{env(safe-area-inset-*)})
  \]

  其中 `safe-area` 在 `env(..., 0px)` 退化；**主要动机**是 **MacBook 刘海 / 圆角屏** 下的可用矩形，而非手机 Home 指示条。若产品需要全屏沉浸，再在 `index.html` viewport 层评估 `viewport-fit=cover`（与当前实现是否一致以 Tech Spec / 实施为准）。

- **适用**：所有「应避开刘海区」的**常驻**控件；与 §3.1 关系：**内容框 ⊆ 视口框**。
- **现状差距**：当前仅 `FocusExitButton` 等少数位置显式使用 `safe-area-inset-bottom`；体系化后应统一约定哪些组件必须读 content frame（至少：**顶栏 / 右上工具 / 搜索** 与 **顶/左 safe-area** 取 max）。

### 3.3 画布锚点（Canvas anchor）

- **定义**：由 Three 桥接写入的**屏幕像素坐标**（如 `hoverAnchorCss`）及派生量（如 `hoverPlanetRadiusCss` → `hoverRingLayout`）。
- **适用**：Hover 环、片名片 Tooltip 的触发点、与星球半径成比例的 offset。
- **规则**：**不**用视口 token 去「手调」锚点位置；半径与 gap 的公式保持**单一来源**（与 Design Spec §3.2、实现模块一致）。

---

## 4. 模式（Mode）与地盘

交互状态驱动 HUD **显隐与强度**，与 Design Spec §2.1 / §2.2 一致；本节只从**空间设计**归纳。

| 模式 / 条件 | 空间设计要点 |
|-------------|----------------|
| **宏观漫游（idle）** | Timeline、Search、右上工具为主；Hover/Tooltip 随指针与锚点。 |
| **Focus** | 星球邻域：`FocusLReference` 居星球左侧；`FocusExitButton` 置底居中；Timeline 只读、不驱动 `zCurrent`；Drawer 可从右侧占幅滑入。 |
| **Cover** | 全屏品牌与遮罩优先；与漫游 HUD 互斥挂载策略以 App 实现为准。 |
| **Drawer 打开** | Sheet 贴视口边缘滑入；须与 z 语义表（§5）一致，避免误挡退出焦点等关键操作（具体以 Design Spec §2.2 / Drawer 实施为准）。 |

**地盘原则**：每一模式下列出「主舞台 / 次信息 / 系统入口」，并标明是否允许与 3D 中心重叠；新增控件须先落入某一地盘，再分配 z 档位。

---

## 5. 叠放层级（z）语义表

数值可与实现微调，但**语义序**不可颠倒。建议固定枚举名，再在 CSS 中映射为具体 `z-index`。

| 语义档位 | 典型内容 | 相对顺序（低 → 高） |
|----------|-----------|----------------------|
| **Canvas** | WebGL 宿主 | 最低（DOM 下） |
| **Ambient HUD** | Timeline、Search、右上工具 | 高于画布 |
| **Focus chrome** | `FocusLReference`、与 focus 强相关但非模态的辅助 | 高于 Ambient，低于强反馈 |
| **Hover feedback** | Hover 环、Tooltip | 高于一般 HUD，保证可读 |
| **Drawer** | 详情 Sheet | 高于 Hover feedback，低于阻塞式模态 |
| **Modal** | Info 对话框等 | 最高（阻塞交互） |

**规则**：禁止为单个 PR「+10 盖过邻居」；若冲突，应调整地盘或模式而非无限堆 z。

---

## 6. 间距与尺寸 token（建议）

下列为**命名建议**，落地时可映射到 `index.css` `:root` 或 Tailwind `@theme`，并与 shadcn 语义色并存。

| Token 语义 | 用途 | 说明 |
|------------|------|------|
| `--hud-inset-xs` | 极窄边距 | 如时间轴近边；可与 `safe-area` 取 max |
| `--hud-inset-sm` | 默认外边距 | 对齐当前常见 `top-3` / `right-3` 量级 |
| `--hud-inset-md` | 较宽松 | `sm` 断点及以上 |
| `--hud-gap-stack` | 纵向堆叠间距 | 工具按钮组、表单项 |
| `--hud-radius-chrome` | HUD 控件圆角 | 与 `--radius` 家族对齐或略小 |

**指针命中**：以桌面惯例即可（如 shadcn `Button` / `IconButton` 默认 padding），**不**设独立「触控最小边长」token。

**水平搜索条**：宽度宜为「内容框宽度 − 水平 inset ×2」的函数，并设 `max-width` 避免超宽屏一条过长（与当前 `calc(100%-2rem)` + `max-w-lg` 思路一致，可 token 化）。

**竖直方向**：对依赖 `50%` + `rem` 的控件（如退出焦点），继续采用 **`min(理想位置, 短视口上限)`** 与 **`safe-area-inset-*`** 的组合，避免 **较短窗口高度** 或 **底部/侧边 safe-area** 导致裁切（含刘海 Mac 全屏等情形）。

---

## 7. 断点与密度

- **Tailwind 断点**（`sm` / `lg` / `2xl` 等）作为**密度切换**触发，而非随意混用魔法数。
- **Focus 星球邻域**：在 **1∶1～超宽** 范围内，左移量可与 `50vw` 成函数关系（参见当前 `FocusLReference` 的 `max(floor, calc(50vw - …))` 模式）：方屏时保证不越左缘；超宽时避免与星球、Drawer 抢位。
- **横置时间轴**（`?timeline=horizontal`）：与左侧竖轴、右上工具的地盘分工以 Design Spec §3.1.1 为准；本体系要求两种 orientation **共享** token 与 z 语义，仅改变刻度几何。

---

## 8. 动效与过渡（空间的一部分）

| 类型 | 原则 |
|------|------|
| **Drawer** | 以 Design Spec §2.2 为准：整幅位移进出场、与 duration / easing 常量一致。 |
| **模式切换** | Cover ↔ 漫游、进入 / 退出 Focus，避免同一控件无意义大跳；若必须变位，应有可感知的过渡或统一对齐边。 |
| **微交互** | Tooltip、按钮 hover 时长短于抽屉，避免「全屏同一 easing」的拖沓感。 |

---

## 9. 信息架构与控件秩序

- **右上常驻顺序**（已定稿）：Info → Language → Fullscreen（Design Spec §3）。
- **搜索**：主入口；与 Drawer 同时存在时，明确主次（例如 Drawer 打开时搜索是否保持可点，以产品决策为准并写回 SSOT）。
- **退出 Focus**：单一主路径（`FocusExitButton` / `View cosmos` 文案）；不依赖「点空白关闭」。

---

## 10. 国际化与 RTL

- 文案键与模板以 **`en.json`** 为结构 SSOT；插值变量与 HTML 标签不得破坏（`sync-doc` 规则）。
- **`ar` locale**：`html` 上 `dir="rtl"`；下拉等需保持可读性的区域可按 Design Spec 对 `LanguageSwitch` 的 **`dir="ltr"`** 等例外执行，并在组件级注释标明「例外原因」。

---

## 11. 可及性（A11y）与输入形态

- **指针**：Hover / Click 为主；不要求触屏手势或双指缩放（页面级 Ctrl+滚轮缩放仍遵循 Design Spec / 浏览器约定）。
- **键盘**：焦点顺序应沿内容框与语义档位合理循环；Focus 态下 Timeline 不作为 `slider` 暴露（Design Spec §3.1）。
- **读屏**：抽屉标题 / 描述、`aria-label` 与 Design Spec §3 文案同源。

---

## 12. 工程映射与单一事实来源

|  Concern | 建议 SSOT |
|----------|-----------|
| 文案与 i18n | `frontend/src/lib/locales/en.json` + `locales.schema.spec.ts` |
| 星球邻域几何 / Tooltip offset | `frontend/src/hud/hoverRingLayout.ts`（及 Design Spec 引用处） |
| Focus 动画时长 | 《视觉参数总表》+ `scene.ts` / `transitionDriver`（Design Spec §2.2 已强调双处同步） |
| z-index 枚举 | 本文件 §5 + 集中常量文件（若后续抽取 `hudLayers.ts` 等） |

**反模式**：在业务组件内散落互不关联的 `z-[N]`、`top-[calc(...)]` 而无注释归属 §3 / §5。

---

## 13. 验收清单（建议用于 P26.2 视口回归）

以下可在 PR 或发布前勾选：**必测**为 **§1 设计基准**（约 1600×900 横屏）+ **比例两端**（约 1∶1、超宽）；**抽样**可选低于基准的横屏压窗，确认无功能性裁切与 safe-area。

- [ ] **较短 `dvh`**（横屏窗口压扁）：搜索条、退出焦点、竖/横 Timeline 无裁切、不与浏览器底栏 / safe-area 冲突。
- [ ] **刘海 / safe-area**：`env(safe-area-inset-*)` 下右上工具、搜索、顶缘控件不进入刘海不可用区（若启用 `viewport-fit=cover` 需单列一条）。
- [ ] **比例两端**：**约 1∶1** 与 **超宽** 各至少一屏截图归档；超宽下搜索条不过度拉伸（`max-width` 仍生效）。
- [ ] **Focus**：`FocusLReference` 不与横置 Timeline、Drawer 同时不可读（以 Design Spec 分工为准）。
- [ ] **z 序**：Hover 环低于 Drawer、Info 模态始终最顶。

---

## 14. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-12 | 初稿：整理空间参照、模式、z 语义、token 建议、验收项；与 Design Spec §3 对齐。 |
| 2026-05-12 | 明确横屏桌面为主、约 1600×900 为参照、1∶1～超宽、不支持触屏；保留 content frame 适配刘海 Mac；移除触控 token 与验收项；章节号顺延。 |
| 2026-05-12 | 将 1600×900 从「下限」改为**设计基准**（首要参照与必测分辨率；更小横屏以无功能性裁切为底线）。 |
