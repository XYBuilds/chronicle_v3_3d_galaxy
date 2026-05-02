# **TMDB 电影宇宙 \- 视觉与交互设计规范 (Design Spec)**

## **1\. 视觉映射法则 (Visual Mapping Rules)**

在 3D 宇宙场景中，数据特征必须严格按照以下规则映射为天体的物理外观：

* **天体体积 (Size)**：映射 vote\_count（评价人数）。  
  * 规则：使用**对数缩放 (Log Scale)**。爆款呈现为巨大恒星，长尾呈现为微小星尘。  
* **内核亮度（OKLab Lightness / L）**：映射 vote\_average（评分，1–10 分）。  
  * 规则：宏观星系 shader 内由 **rating→L** 曲线（Phase 10.1：`uLMin`/`uLMax`、分段压缩与非线性）驱动 **OKLab L**，高分片更亮、低分片更暗。**屏幕空间 Bloom** 不是当前产品的默认外观（生产默认不挂 `UnrealBloomPass`；本地可调 `window.__bloom`，见 Tech Spec §1.2）。  
* **星系色彩 (Color)**：映射 genres（流派）。  
  * 规则：基础颜色由第一顺位主类别 genres\[0\] 决定，以保持大星团的纯粹色彩秩序。

### **1.1 流派色板生成规则 (Genre Palette — OKLCH)**

全项目统一使用 **OKLCH 色彩空间**。色板的**数据生成、冻结版本、`genre_hue` 导出与 `meta.genre_palette` 契约**以 [`TMDB 电影宇宙 Data Pipeline.md`](./TMDB%20电影宇宙%20Data%20Pipeline.md) 为 SSOT；本节仅描述视觉意图。

* **Lightness (L)** 与 **Chroma (C)**：所有 genre 使用统一的 L 与 C 值（具体数值由视觉调试确定；初始建议 **L ≈ 0.75**、**C ≈ 0.14**）。  
* **Hue (H) 分配**：  
  * **Phase 18+ 固定策略**：使用 frozen genre palette（`genre_palette_version`，当前计划为 `"v1"`），不再根据"本次数据中出现的 genre 集合"动态重排 hue，避免新增/缺失 genre 导致全图颜色漂移。  
  * **Index → Hue**：管线同步导出 **`genre_hue`**（**弧度**，\(2\pi \times \mathrm{index}/N\)，与 frozen palette 序一致），GPU 与 `cos(hue)` / `sin(hue)` OKLab 构建一致；**hex `genre_palette`** 仍以 OKLCH→sRGB 供 HUD 色块。  
  * **新 genre 策略**：若 TMDB 官方 genre 集合出现新增项，管线应显式失败并要求人工决定是否 bump `genre_palette_version`，不得静默重排。  
* **sRGB 转换与 Gamut 安全**：管线中须将 OKLCH 转为 sRGB hex 后写入 `meta.genre_palette`。部分色相在高 Chroma 下可能溢出 sRGB gamut，转换时须做 **gamut clamp**（将 RGB 分量 clamp 到 \[0, 1\]）。若发现个别色相溢出严重，可将 C 全局微调至 **0.12** 保证全部 N 色 in-gamut。  
* **版本化**：色板变更须 bump 宇宙数据版本号。

## **2\. 交互状态与视觉反馈 (Interaction States)**

### **2.1 宏观漫游状态 (Default) — Phase 8 定稿**

* 渲染层级：全部 ~60K 影片为**两份** **`InstancedMesh`**（**idle** `Icosahedron(1,0)` + **active** `Icosahedron(1,1)`），同实例矩阵与 hue / vote / size；条带内 **`inFocus`** 用 **smoothstep**（`W = zVisWindow × 0.2`）驱动 **互补尺度**（详见 [`星球状态机 spec.md`](星球状态机%20spec.md) 与 Tech Spec §1.1）。**非**单 `Points` 主路径。  
* **视距窗口（Phase 5.1.5 · 方案 1）**：在时间轴 Z 上定义闭区间 **`[zCurrent, zCurrent + zVisWindow]`**：  
  * **`zCurrent`**、**`zVisWindow`**、**`zCamDistance = 30`** 含义不变（见 Tech Spec §1.4.1）。  
  * 状态在 Zustand 中维护；**拾取**以 **active mesh** + 世界球逻辑为准（Tech Spec §1.5）。  
* **与旧 A/B「点大小」的对应（心智模型）**：条带外可见性主要由 **idle** 支路 + **`uBgSizeMul`** 体现；条带内由 **active** 支路 + **`uActiveSizeMul`** 体现；**初值** `uSizeScale=0.3`，`uActiveSizeMul=0.02`，`uBgSizeMul=0.002`（以《视觉参数总表》与 `galaxyMeshes.ts` 为准）。

| 层             | 定义                | 视觉                      | 交互                                        |
| :------------- | :------------------ | :------------------------ | :------------------------------------------ |
| **A — 背景感** | 条带外 `inFocus` 低 | idle 支路为主、较淡较小   | 不作为主拾取层                              |
| **B — 条带内** | `inFocus` 高        | active 支路为主、可辨明暗 | **可** hover / click（实现上仅 **active**） |

  * **过渡**：**smoothstep**，非旧版 A/B `step` 硬切。  
* 摄像机控制（**宏观 idle**；**focus 态**例外见 **§2.2 Phase 13**）：  
  * **摄像机轴线始终与 Z 轴平行**（无旋转、无倾斜；参数永远为 `Euler(0, π, 0, 'YXZ')`）。  
  * **滚轮**：沿 Z 轴（release\_date 时间纵深）前后穿梭；**宏观 idle 态下实际写入的是 `zCurrent`**，相机位置由 `zCurrent - zCamDistance` 驱动（Phase 5.1.5）。  
  * **拖拽**：仅执行 **truck**（水平平移）与 **pedestal**（垂直平移）——改变 Camera Position，**Rotation 恒定不变**；XY 位置被 `xy_range + padding` 约束。

### **2.2 微观聚焦状态 (Selected · Phase 13 起含「邻域探索」)**

当用户明确**点击选中**某颗星球时，触发以下**分阶段过渡序列**：

1. **相机推进**（生产 **`700 ms` 选中** / **`450 ms` 取消**，`easeOutCubic`；以《视觉参数总表》为准）：飞向 **固定物距** 的 focus 机位；**宏观段**轴线与 Z 平行。**Phase 13**：**`selected`** 阶段相机切换为**轨道相机**——绕焦点 world 位置（pivot）**偏航 / 俯仰**查看，**半径恒为 `FOCUS_PERLIN_CAMERA_STANDOFF`**；**滚轮不响应**（不推拉、不改变该距离），以保证 Perlin 球屏幕尺寸与 **`vote_count`** 严格对应。进入 / 退出 focus 时位姿与 **`uFocusCameraBlend`** 等由统一 **`transitionDriver`**（`focusDriver.progress`）驱动，含 **position lerp + quaternion slerp**（见 Tech Spec §1.4.2 / §1.4.3 与状态机 spec §3.4.6）。  
2. **双 mesh 与 Perlin 切换**：飞入过程中，该影片在 **idle + active** 两 mesh 上 **instance 尺度归零**（`uFocusedInstanceId`）；**C 层**为 **`IcosahedronGeometry(1, 8)`** + **Perlin**（**P8.3 → P11.3**）：CPU 上 noise 分位数定面积比，片元 **分档** + 色相来自 **genre_hue** + L/C。旧版 `detail=4` / 单一 `uThreshold` 已废弃。  
3. **档案抽屉滑出**（`easeOutCubic`，在 Perlin 稳定后）：侧边详情滑入。  
4. **取消选中 / 回退**：时长见上，相机与 mesh 显隐由 `scene.ts` 状态机驱动。  

* **环境景深重构**：未被选中的背景星球（无论远近）依然保持极简单色渲染，作为视觉背景，凸显主体。在视距窗口视图下等价于 §2.1 的 A 背景层。**Phase 13**：**球形邻域**内的背景 / active 影片按 mask **可见且可拾取**（`uSelectionMode = 2`），用户可点击**邻域 active** 切换 focus；与 Phase 11.6 Perlin 球拾取优先级一致。

* **Timeline 与年份**：进入 focus 时，时间轴读数与焦点片 **`movie.z`** 对齐（**渐变**或瞬时与相机飞入共用 `focusDriver.progress`，见 Tech Spec §1.4.1）；**退出 focus 后 `zCurrent` 保留在 `movie.z`**，不回退到进入前宏观漫游值。

* **focus 态图例（Phase 13.5 + Phase 14.7.1）**：Perlin 球同心 **`vote_count` 档位参照圆环**（`frontend/src/three/FocusSizeReferenceRings.ts`）与 HUD **`FocusLReference`**（主流派色相上的 **rating→亮度** 参照：**Phase 14.7.1** 起为**竖直色带**（低分在底、高分在上，与 shader 中 **`voteNorm`** 分档一致）+ 横向指针线 + **当前片评分一行**文案；整体布局在视口内**星球左侧**，避免与**横置 Timeline**（§3.1.1）、右侧 Drawer 抢位。**不**展示完整 **0→10** 分度标题轴；文案与圆环 tier 标签同源走 **`STRINGS` / `locales/en.json`**（见 §3）。显隐与 Perlin 球 / focus 过渡一致。

> **注**：飞入/退出毫秒数以《视觉参数总表》与 `scene.ts` 常量为**当前定稿**；若改动画须双处同步。

## **3\. HUD 界面规范 (UI Layout & Styling)**

所有 UI 元素属于前端 DOM 覆盖层，与底层 3D 画布分离。

* **Phase 14 — HUD 文案 SSOT**：所有面向用户的 HUD **英文**字面量以 **`frontend/src/lib/locales/en.json`** 为**键值与模板**的单一事实源；运行时由 **`frontend/src/lib/strings.ts`** 聚合为 **`STRINGS`**（含 `{{key}}` 插值等），组件**仅**通过 `STRINGS` 引用。**不在**各 React 组件内写死可复用文案（**例外**：一次性 **dev-only** **`console.log`** 等开发审计输出可保留字面量）。

### **3.1 全局时间轴 (Timeline Indicator)**

在宏观漫游状态（层级零）下常驻显示的唯一 HUD 元素，为用户提供当前 Z 轴（时间纵深）的**位置感知**：

* **形态**：屏幕边缘（建议左侧或底部）的**纵向 / 横向刻度条**，标注关键年份刻度。  
* **当前位置标记**：高亮指示器显示 **`zCurrent`**（Phase 5.1.5 / **Phase 13**）——即用户当前关注的发行年；**HUD 订阅 `bridgeZ = zCurrent`**（与 Tech Spec §1.4.1 单一路径一致）。**Focus 态 `FocusLReference`**（§2.2）：**Phase 14.7.1** 起置于**星球左侧**竖条，与 **`?timeline=horizontal`** 底部横轴、右上角 **Info / 全屏**控件分工，避免重叠或可读性明显下降（窄屏以实现对齐为准）。  
  * **宏观 idle 态**：`zCurrent` 由滚轮 / 时间轴与相机 **`zCurrent - zCamDistance`** 同步。  
  * **focus 态及过渡**：`zCurrent` 与焦点 **`movie.z`** 对齐（可与飞入动画**渐变**）；**退出 focus 后 `zCurrent` 保留在 `movie.z`**。
* **交互（可选 / 规划中）**：点击刻度或拖动 thumb 可快速跳转至对应年代，反向写入 `zCurrent`（相机跟随）——本阶段实现为纯被动指示即可；拖动交互作为 **Phase 5.3.1** 单独排期。  
* **视觉基调**：极低存在感——半透明、细线、小字号，避免遮挡 3D 场景主体。具体视觉样式参照 Figma 设计稿。

#### **3.1.1 Orientation 双变体（Phase 14）**

* **`Timeline` 形态**：支持 **`orientation`** 属性：**`vertical`**（**默认**，与当前实现一致：纵向刻度条）与 **`horizontal`**（底部居中横置刻度条，**刻度朝下**）。
* **URL 切换**：开发 / 验收可通过 **`?timeline=horizontal`** 或 **`?timeline=vertical`** 切换；两种 orientation **共享**关键年份刻度算法与「视觉基调」规则（细线、低对比、不抢主体）。

### **3.2 Tooltip (悬停层)**

* 极简样式，紧跟鼠标，响应速度需极快。  
* **内容**：第一行为影片 **标题**；第二行为 **`genres[0]`** 主类型标签——若 `meta.genre_palette` 中有对应 hex，则该行文字使用该色强调；否则使用 `muted-foreground`。

### **3.3 档案详情抽屉 (点击层)**

* **位置**：屏幕侧边（左/右侧固定滑出）。  
* **背景 & 内容排版**：具体视觉设计（半透明/遮罩处理、信息层级、排版风格）以 **Figma 设计稿**为准。本文档仅约束规则层面的要求：  
  * 需确保能够有效区分 UI 与 3D 场景层次，防止完全遮挡底层宇宙。  
  * 信息层级分明：海报、标题/原名、日期、Tagline 等主次清晰。  
  * 滑出/收回动画遵循 §2.2 定义的时序与缓动函数。

### **3.4 Phase 9 — HUD 排版、流派表面与 Dev 主题**

以下规则为 **Phase 9** 在 React / shadcn 层的定稿，**不改变** `galaxy_data` 契约与 Three.js 渲染；画布背景仍为 §1 与《视觉参数总表》中的黑色输出，HUD 单独走 DOM token。

#### **3.4.1 抽屉 typography 与结构（P9.1）**

* **色彩**：一律使用 shadcn 语义类（如 `bg-popover`、`text-foreground`、`text-muted-foreground`、`border-border`），不在 HUD 写死 zinc 例图 hex。  
* **主标题**：`text-2xl font-bold leading-tight`。  
* **副标题**（`original_title`）：仅当存在且 **不等于** `title` 时显示。  
* **评分行**：星标、分数、票数、发行日期同一视觉行，允许换行时使用 `gap-x-4 gap-y-2`。  
* **海报**：`AspectRatio` 2:3；`rounded-xl`、`shadow-sm`；海报 URL 无效时的 **`DrawerPoster`** 占位与 fail 状态保留。  
* **Tagline**：`blockquote` 风格，左侧 `border-l-2`，斜体、muted。  
* **Overview**：区块标题 `text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground`；正文 `text-sm leading-relaxed`。  
* **Details**：两列网格 `grid-cols-2`；字段名小标题与值层次区分（标签 `font-semibold` 档、值 `text-muted-foreground`）；实现细节以 `Drawer.tsx` 为准。  
* **Details 四组显隐（Phase 14.6）**：仅约束 **Details** 小标题下的元数据网格（Overview / Cast / 外链等不重排）。**组 1** Runtime → Language：**整组永远渲染**；单栏无有效数据时**值**显示斜杠占位 `/`；**Runtime = 0 分钟视为有**，须正常展示。**组 2** Director → Producers → Writers、**组 3** Director of Photography → Music Composer：逐栏判断，无数据则**该栏不渲染**；组内三栏或两栏尽缺则**整组不出现**。**组 4** Budget → Revenue：单栏无（含 **`0`** / `null` / `undefined` / 缺失）则该栏值为 `/`；两栏皆无则**整组不渲染**。栏从左到右填满一行再换行；组与组之间仅换行，不增分割线。完整判定表见仓库 **`.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md`** §P14.6（与 Storybook **`Drawer.stories`** 对照验收）。  
* **Cast**：`sm` 及以上双列编号列表（序号 + `truncate` 人名），窄屏单列。  
* **Sheet 骨架**：保留 shadcn `Sheet` / `SheetContent` / `AspectRatio`；**`SHEET_OPEN_EASE`**（Phase 4.3）时序不改。  
* **六人字段**：在 `director` / `writers` / `cast` 之外展示 **`director_of_photography`**、**`producers`**、**`music_composer`**；对应数组为空时 **整块不渲染**。  
* **外链**：TMDB 影片页始终可链；**`imdb_id` 非空** 时额外提供 IMDb ghost 按钮（`https://www.imdb.com/title/{imdb_id}/`）。

#### **3.4.2 流派标签表面（P9.2）**

* **Badge `variant="genre"`**：以 `meta.genre_palette[g]` 的 sRGB hex 为 **`--genre-color`**，在 CSS 中做 **三段式** 表面：  
  * **背景**：`color-mix(in oklch, var(--genre-color) 18%, transparent)`  
  * **边框**：`color-mix(in oklch, var(--genre-color) 60%, transparent)`  
  * **字色**：`foreground`（与流派色分离，保证对比度）  
* **回退**：不支持 `color-mix` 的引擎使用 **`rgb(r g b / 0.18)`** 与 **`/ 0.6`** 内联（`frontend/src/lib/genreColor.ts`）。  
* **hex 无效或缺失**：回退为现有 **outline** 等未染色样式。  
* **抽屉**：渲染 **`movie.genres` 全量**（不再截断为前四条）。  
* **Tooltip**：主类型与抽屉同源 **palette** 色规则（见 §3.2）；样式为紧凑文本行，与抽屉 Badge 可略有形态差异，但 **色源一致**。

#### **3.4.3 Info 弹层（P9.4）**

* **`InfoModal`** 内区块标题与正文排版与抽屉 **Overview 段** 同源：`text-[0.65rem] font-bold uppercase tracking-wider` + `text-sm leading-relaxed`；`infoCopy` 文案本身不在 Phase 9 替换。**Phase 14.1** 起：`infoCopy` 从 **`STRINGS.info`**（见 §3，`en.json`）再导出，保持 import 路径稳定。

#### **3.4.4 URL `?theme=light|dark`（P9.5，Dev / 验收）**

* **用途**：开发或验收时快速查看 HUD 在亮 / 暗 CSS 变量下的表现。  
* **行为**：App 挂载时读取 `theme` query；命中 `light` 或 `dark` 时设置 **`document.documentElement.dataset.theme`**，并与 Tailwind **`dark` class** 联动（见 `useThemeFromQuery`）；无参数时维持默认暗色 HUD。  
* **画布**：**不要求** Three.js 场景、星空或 Bloom 随浅色主题重算；画布可保持深色底，与浅色 HUD 并存仅作工程验收场景。

#### **3.4.5 Phase 14 — 文案语言与 dev / 验收**

* **产品 HUD**：主体文案为 **英语**（以 **`locales/en.json`** + **`strings.ts`（`STRINGS`）** 为准，见 §3 头部 SSOT）。
* **中文**：仅出现在**项目文档**（如本 Design Spec、Pipeline、报告）与 **dev 审计用 `console.log`** 中；**不**作为生产 HUD 用户可见字符串来源。

### **3.5 Cover-with-Start（Phase 15）**

* **与加载态分工**：**`mode='loading'`** 时根容器为 **`role="status"`**（忙状态）；**`mode='await-start'`** 时为 **`role="dialog"`**（Cover）。详见 **`frontend/src/components/Loading.tsx`**。  
* **范围**：**极简**。首屏**全程**（含 gzip 三阶段与索引阶段）**不**展示独立 **Spinner** 与进度区上方的**标题行**文案——加载叙事完全由 **四阶段 `ol` + 分段进度条**（以及可选的 gzip / 索引 **`footerMessage`**）承担。四阶段完成后进入 **Cover**，仍用**同一全屏覆盖层**；**进度条保持满格/终态**（第四阶段在 **`skipped`** / **`error`** 时按 token 灰显或 destructive，与 Tech Spec §1.4.7 一致）。**不**加品牌大标题、副提示长句、教程或额外视觉编码说明。  
* **文案（SSOT）**：**`STRINGS.cover`** 仅含 **`title`**、**`start`**、**`startAriaLabel`**（**`locales/en.json` → `strings.ts`**，与 §3.4.5 一致）。**`cover.title`** 在 Cover 态以 **`sr-only` 标题**供读屏；根容器同时设 **`aria-label`**（与 `Loading` 的 `label` prop 对齐，实现中 Cover 为「Ready」）。**无**独立副文案键。  
* **Start 按钮**：原生 **`<button type="button">`**，**吸底**（视口**下方** `shrink-0` 区域，与上方 **`flex-1` 进度区**分离）；样式走 **primary**；**`autoFocus`**，**Enter** / **Space** 默认可触发。  
* **键盘**：**Enter** / **Space** 等同点击；**Esc** **不**关闭 Cover（无可关闭语义）。  
* **可访问性**：Cover 时根容器 **`role="dialog"`**、**`aria-labelledby="cover-title"`**（对应该 **visually hidden** 的 `h1`）；**不**再设 **`aria-describedby`**（无可见/独立副文段）。按钮 **`aria-label`** 走 **`STRINGS.cover.startAriaLabel`**。

### **3.6 Close 控件 primitive（Phase 14）**

* **组件**：**`CloseButton`**，实现路径 **`frontend/src/components/ui/close-button.tsx`**。
* **Variants**：**`default`**（带边框的方形按钮）/ **`ghost-sm`** / **`ghost-lg`**（轻量幽灵态，尺寸分档）。
* **图标**：**`lucide-react`** 的 **`X`**；**`aria-label`** 等可访问性文案走 **`STRINGS`**（与 §3 SSOT 一致）。
* **视觉**：**`CloseButton`** 的边框线宽与 **hover 环 / Timeline** 同属 **UI edge** 线宽语义（**`--ui-edge-stroke-width`**，见《视觉参数总表》**§7**、**§7a**）。**颜色**：按钮叠在 **DOM 壳层**，使用随主题变化的 **`--ui-edge-color` / `--ui-edge-color-strong`**；**HoverRing** 与 **Timeline** 仅叠在 **黑色 WebGL 画布**上，使用 **`:root` 固定**的 **`--ui-edge-canvas-color` / `--ui-edge-canvas-color-strong`**（与 **§3.4.4**「画布可保持深色底」一致，避免 `?theme=light` 时环与轴变成浅灰细线导致对比度错误）。

### **3.7 全局键盘快捷键与全屏控件（Phase 14 · HUD）**

* **全屏按钮**：HUD 右上角 **`FullscreenButton`**（`frontend/src/hud/FullscreenButton.tsx`；**`lucide-react`** Maximize / Minimize），与 **Info** 同列；监听 **`fullscreenchange`** / **`webkitfullscreenchange`** 同步图标；行为与下述 **`F`** 一致（Safari 等需 **webkit** 前缀检测时以源码为准）。

以下快捷键在 **App 级** 全局监听（与 §4 搜索 combobox 内 **`↓`/`↑`/`Enter`/`Tab`** 等**不重复登记**同一键位语义；实现以源码为准）：

* **`F`**：**切换浏览器全屏**（**仅当**焦点不在 **`input` / `textarea` / `contenteditable`** 等文本输入控件内时生效，避免打断输入）。
* **`Cmd` + `K`（macOS）** / **`Ctrl` + `K`（Windows / Linux）**：聚焦顶部搜索框（`input[data-galaxy-search-input]`）；当搜索因 **`meta.has_search_index !== true`** 而 **disabled** 时 **noop**；与 combobox 内输入 **不冲突**（未在输入框内劫持同一键位语义）。
* **`Esc`**：**焦点栈**与状态回退维持 **§4.6**（Phase 12.8）不变。

## **4\. 搜索 UX（Phase 12 起 · UX SSOT）**

本节为搜索功能的 **UX 单一事实源（SSOT）**：覆盖入口位置、控件、联想规则、ESC 焦点栈与状态嵌套行为。**数据契约**（管线字段、`galaxy_search_index.json.gz` Schema）以《Tech Spec》§4 为准；**渲染层语义**（selectionMask、focus×select 优先级）以《星球状态机 spec》§3.6 为准；**功能需求**（产品价值、用户旅程）以《PRD》§3 为准。**性能与 fps 归档**（含人名 60+ active、genre 大集合压力片段）见 [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) **`## P12 入口/出口`**、**`## P13.0 入口`** 与 **`## P13 出口`**（Phase 13 focus 邻域 + 轨道相机主战场）。

顶部 **HUD** 搜索：与 3D 画布分层。数据来源为 `galaxy_data`（电影字段）+ 配套 `galaxy_search_index.json.gz`（人名 / genre 索引）。当 **`meta.has_search_index !== true`** 时，搜索框为 **disabled**，仅显示提示语，不阻塞画布。

### **4.0 三条核心体验（验收口径）**

1. **搜电影名**（含其它语言的 **`original_title`**）：关键词联想 → 点击正确项 → 进入对应影片 **focus** 态（相机飞入 + Perlin + 抽屉）。  
2. **搜人名**（覆盖 **`cast` / `director` / `director_of_photography` / `writers` / `producers` / `music_composer`** 聚合）：点击人物 → 进入 **`person` select 会话**：**该人物参与的全部影片星球 active，其余 idle**（**active 集合由搜索结果决定**，不再受 timeline `viswindow` 条带控制；timeline 数值仍可在后台被 wheel 写入，但**不影响视觉**）。同时按 **`release_date` 升序** 用纯白细线连接星座图（**默认开**；产品 HUD **无**开关，调试用 **`window.__galaxy.constellationEnabled`**，见《视觉参数总表》§4a）。**Phase 12.7 起**连线按职位拆为**三条独立时间链**，使「演员同框」「主创班底」「制片同盟」三种叙事并行可读；各链端点沿弦内缩到 active 球壳外（避免线段切入星球 mesh），连线视觉细则与降级行为见 §4.4a。  
3. **搜 genre**：点击某一 genre → 进入 **`genre` select 会话**：**凡 `movie.genres` 包含该 genre（不限于 `genres[0]`）** 的影片 **active**，其余 **idle**；**不**画星座连线；同样不再受 viswindow 控制。

### **4.1 布局与控件**

* **位置**：`fixed` 贴顶居中，`top-4`、`left-1/2` + `-translate-x-1/2`；`z-index` 高于画布且低于系统级 modal（实现约定 **`z-[90]`**）；容器 **`max-w-lg`**、水平内边距防贴边。
* **分段**：三档 **`movie` / `person` / `genre`**（segmented control：`Tabs` 或三键 ToggleGroup）。**切换分段时清空** query + 联想，避免跨模式残留。
* **输入框**：单行文本；右侧 **清除按钮（X）**，一键清空 query 并收起联想；点击 X **同时退出**当前 select 会话（清 `selectionIds`，见 §4.7）。
* **联想面板**：输入框下方浮动列表（`Popover` 或自建 `<ul>`）。

### **4.2 联想触发、节流与键盘交互**

* **触发阈值**：query **`trim().length >= 3`** 才触发联想；不足 3 字符时面板不展开（不显示空列表/历史）。
* **防抖**：**`200 ms` debounce**；可叠加 `useDeferredValue` 抗顿。
* **条数上限**：电影名 **≤ 12**；人名 **≤ 8**；genre **≤ 5**。
* **键盘**（标准 combobox）：
  * **`↓` / `↑`**：在联想列表内高亮上下条；列表未展开但有结果时 `↓` 展开并定位到第一条。
  * **`Enter`**：等价于点击当前高亮项（无高亮则不触发）。
  * **`Tab`**：**不**拦截（让浏览器自然移焦，方便键盘用户继续浏览页面）。
  * **`Esc`**：见 §4.6。
* **点击联想项**：关闭下拉；`movie` 走 §4.3 → focus；`person` / `genre` 走 §4.4 / §4.5 → select 会话；并将输入框 `searchQuery` 替换为已选项的格式化文本（见各节点击行为）。

### **4.3 联想：电影名（`movie`）**

* **过滤（Filter）**：搜索词与 **`title`** / **`original_title`** 做 **忽略大小写**子串检索（实现可用管线产物 **`title_normalized`** + 原名规范化形）。**仅**支持 **前缀匹配（Starts with）** 与 **包含匹配（Contains）**；**不做** Fuzzy / 拼写纠错。
* **排序（Sort）**  
  * **第一维度（匹配类型）**：前缀匹配 **优于** 包含匹配。  
  * **第二维度（加权热度）**：同档内 `Score = Math.log10(vote_count + 1) × vote_average`，**降序**。  
  * **`release_date` 不参与排序**（任何维度）。
* **格式化（Format）**：行内布局语义为 **`Title`** + **`原始标题`** + **`(YYYY)`** + **`Genre0`**（即 **`genres[0]`**；`YYYY` 取 `release_date` 前 4 字符）。  
  * **去重**：若 **`original_title`** 与 **`title`** 相同或为空，**不再重复**展示原始标题段。
* **高亮（Highlight）**：用忽略大小写正则在最终展示字符串上匹配 query，命中子串用语义 mark（`<mark>` + `bg-primary/30` 等）包裹。
* **点击行为**：`useGalaxyInteractionStore.setState({ selectedMovieId: id })`，复用现有 focus 链路；**不进入** `select` 会话；输入框 query 替换为该电影联想格式化标签（`Title [Original] (YYYY) Genre0`）。

### **4.4 联想：人名（`person`）**

* **过滤**：搜索词与 `searchIndex.people[*]` 的 **normalized 键** 做忽略大小写子串检索。索引须覆盖 **`cast` / `director` / `director_of_photography` / `writers` / `producers` / `music_composer`**。
* **匹配类型（任意 token 前缀）**：把 **normalized 键**按空白拆分为 token 列表；当 query 是任一 token 的前缀（含整体前缀）时记为 **prefix**；否则若是整串子串则记为 **contains**。  
  * 例：query「nolan」对「christopher nolan」记为 **prefix**（命中 `nolan` token 的前缀），对「al pacino」既非前缀也非子串则不召回。
* **排序**：第一维度 prefix **优于** contains；第二维度为 **`movie_ids.length`** **降序**（参演越多越靠前）。
* **格式**：展示 **全名**（索引内 **`full`**）；可选追加 **`role_mask`** 角色标签（位定义见 Tech Spec §4.5）。
* **高亮**：在 `full` 上用同一忽略大小写正则匹配 query，规则同 §4.3。
* **点击行为**：写入 store —— `searchMode='person'`、`selectionIds=people[name].movie_ids`、**`selectionPersonKey=name`**（normalized key，供 `scene.ts` 在 RAF 中读取该人 `movie_roles` 拆三组连线，见 §4.4a）、`selectedMovieId=null`、`constellationEnabled` 走 Leva 默认（默认 `true`）；输入框 query 替换为 `people[name].full`。

### **4.4a 人名星座连线（Phase 12.7 · 三组职位链）**

`person` select 会话且 `constellationEnabled` 为 true 时绘制；`genre` 模式不画线。

* **数据来源**：`searchIndex.people[selectionPersonKey].movie_roles`（每片职位位掩码，详见 Tech Spec §4.5.1）。
* **三条独立时间链**（按 `release_date` 升序相邻连段，各链互不相交）：
  1. **producers**（位 `16`）—— 该人作为制片人参与的影片串。
  2. **crew**（位 `2 | 4 | 8 | 32`，即 director / director_of_photography / writers / music_composer 合并为一根「主创班底」链）。
  3. **cast**（位 `1`）—— 演员同框链。
* **视觉**：统一**纯白** `0xffffff`、`opacity ≈ 0.07`、`transparent: true`、`depthWrite: false`、线宽 1px（WebGL Line 限制）；**不**做按职位分色，避免与 genre 色板冲突；多链同时存在时整体仍呈低存在感「星图」。
* **几何避让**：每段两端沿弦方向各内缩 `r + CONSTELLATION_SURFACE_GAP_WORLD`（`r` = 该端点 active 球壳半径，常量默认 **0.2** world），缩进后弦长不足则**跳过该段**，确保线段不切入 active 星球 mesh；`mesh.renderOrder = 0.5`（介于 idle 0 与 active 1 之间）。
* **focus 嵌套**：`selectedMovieId !== null`（单片 focus + Perlin 球会话）时**整层星座隐藏**；ESC 取消 focus 后连线恢复（select 会话仍在则继续显示）。
* **降级路径**：旧包 `searchIndex` 缺失 `movie_roles` 时**不报错**，退化为 `selectionIds` 一条按时间序的折线（与 Phase 12.6 初版一致）。

### **4.5 联想：流派（`genre`）**

* **过滤**：对 **全部 genre**（与 `meta.genre_palette` 键集合一致）做忽略大小写**前缀**与**包含**匹配。
* **排序**：第一维度 prefix **优于** contains；**第二维度按该 genre 在数据集中的 `count`（电影数）降序**（管线侧产出，见 Tech Spec §4.5）。
* **格式**：展示 genre 字符串；高亮规则同 §4.3。
* **点击行为**：`searchMode='genre'`、`selectionIds = movies 中含该 genre 的 id 列表`、**`selectionPersonKey=null`**（清掉人名上下文）、`selectedMovieId=null`、连线不开启；输入框 query 替换为 `GenreName (count)`。

### **4.6 ESC 焦点栈（全局 keydown，自上而下匹配第一级即处理并 `preventDefault`）**

按用户口径**保持四级独立**，每按一次 ESC 推进一格：

1. **搜索输入框获焦**：仅 **`blur()`** 搜索框 — **不**清空 query、**不**关闭联想下拉、**不**改变 select 会话。
2. **档案抽屉打开**（drawer / Sheet 开启状态）：关闭抽屉。
3. **`selectedMovieId !== null`**（focus 态）：取消 focus（相机退回 / Perlin 收起）。**若同时存在 select 会话，select 会话保留**（见 §4.7）。
4. **`searchMode !== 'idle'`**（select 会话存在）：退出搜索 select 模式（清 `selectionIds` / `searchMode='idle'` / 清连线 / mask 归零）。

未命中以上任一级时，**不**拦截 ESC。键盘 `↑↓Enter` 在搜索输入框聚焦且联想展开时仍优先消费（不与 ESC 冲突）。

**与搜索栏清除（X）对齐**：搜索输入框右侧 **清除（X）** 在实现上须与 **§4.6 第 3 级**一致——当 **`selectedMovieId !== null`** 时，清除操作**同时**将 **`selectedMovieId → null`**（取消 focus），并保留 person/genre **select** 上下文（与 ESC 栈语义一致；详见 Phase 13 P13.6 收口）。

### **4.7 search × focus 嵌套**

* **场景**：用户搜某人 → 进入 person select（多 active + 连线）→ 点击其中一颗影片进入 focus（相机推进 + Perlin + 抽屉）。
* **嵌套规则**：focus 与 select **可并存**；优先级 **`focus > select > active / idle / hover`**（见状态机 spec §3.6）。
* **ESC 出栈**：按 §4.6 顺序，先取消 focus（保留 select 上下文：searchMode / selectionIds / 星座连线），再取消 select。
* **focus 中点击其它 active**：保留 select 会话；focus 切换到新影片（与既有 Phase 11.6 拾取分流一致）。

### **4.8 无搜索索引退化**

* `meta.has_search_index !== true` 时：搜索框 **disabled**；即便用户尝试切换 `person` / `genre` 分段也禁用提示。
* 即使无 `title_normalized`，电影名搜索仍可通过运行时对 `title` / `original_title` 做忽略大小写子串实现，**作为最简退化**；但此时不保证多语言 fold（如重音去敏）。
