# **TMDB 电影宇宙 \- 视觉与交互设计规范 (Design Spec)**

## **1\. 视觉映射法则 (Visual Mapping Rules)**

在 3D 宇宙场景中，数据特征必须严格按照以下规则映射为天体的物理外观：

* **天体体积 (Size)**：映射 vote\_count（评价人数）。  
  * 规则：使用**对数缩放 (Log Scale)**。爆款呈现为巨大恒星，长尾呈现为微小星尘。  
* **内核发光度 (Bloom/Emissive)**：映射 vote\_average（评分，1-10分）。  
  * 规则：控制材质的自发光强度与 Bloom 泛光阈值。高分片刺眼，低分片黯淡。  
* **星系色彩 (Color)**：映射 genres（流派）。  
  * 规则：基础颜色由第一顺位主类别 genres\[0\] 决定，以保持大星团的纯粹色彩秩序。

### **1.1 流派色板生成规则 (Genre Palette — OKLCH)**

全项目统一使用 **OKLCH 色彩空间**。

* **Lightness (L)** 与 **Chroma (C)**：所有 genre 使用统一的 L 与 C 值（具体数值由视觉调试确定；初始建议 **L ≈ 0.75**、**C ≈ 0.14**）。  
* **Hue (H) 分配**：  
  * **步长**：`hueStep = 360 / N`（N = 数据集中实际出现的去重 genre 数量，由管线运行时从数据源算出，**不写死**），确保色相环等间距划分。  
  * **Index → Hue**：`genreHue = hueStep × index`（index 从 0 开始）。**Phase 8.1**：管线同步导出 **`genre_hue`**（**弧度**，\(2\pi \times \mathrm{index}/N\) 或与 palette 序一致），GPU 与 `cos(hue)` / `sin(hue)` OKLab 构建一致；**hex `genre_palette`** 仍以 OKLCH→sRGB 供 HUD 色块。  
  * **Index 分配策略（目标态）**：按每个 genre 的电影数量分配 index，目标是使**宇宙内所有星球的加权平均色相矢量和趋近零**（即整体视觉色彩重心接近消色差 / 中性灰）。具体而言，寻找一个 genre → index 的排列，最小化 \(\bigl|\sum_k c_k \cdot e^{i \cdot H_{\sigma(k)}}\bigr|\)，其中 \(c_k\) 为该 genre 的影片数量。  
  * **现阶段简化**：若优化实现成本较高，先**随机分配** index（使用固定种子保证可复现），待全链路跑通后再迭代为按数量优化的版本。  
* **sRGB 转换与 Gamut 安全**：管线中须将 OKLCH 转为 sRGB hex 后写入 `meta.genre_palette`。部分色相在高 Chroma 下可能溢出 sRGB gamut，转换时须做 **gamut clamp**（将 RGB 分量 clamp 到 \[0, 1\]）。若发现个别色相溢出严重，可将 C 全局微调至 **0.12** 保证全部 N 色 in-gamut。  
* **版本化**：色板变更须 bump 宇宙数据版本号。

## **2\. 交互状态与视觉反馈 (Interaction States)**

### **2.1 宏观漫游状态 (Default) — Phase 8 定稿**

* 渲染层级：全部 ~60K 影片为**两份** **`InstancedMesh`**（**idle** `Icosahedron(1,0)` + **active** `Icosahedron(1,1)`），同实例矩阵与 hue / vote / size；条带内 **`inFocus`** 用 **smoothstep**（`W = zVisWindow × 0.2`）驱动 **互补尺度**（详见 [`星球状态机 spec.md`](星球状态机%20spec.md) 与 Tech Spec §1.1）。**非**单 `Points` 主路径。  
* **视距窗口（Phase 5.1.5 · 方案 1）**：在时间轴 Z 上定义闭区间 **`[zCurrent, zCurrent + zVisWindow]`**：  
  * **`zCurrent`**、**`zVisWindow`**、**`zCamDistance = 30`** 含义不变（见 Tech Spec §1.4.1）。  
  * 状态在 Zustand 中维护；**拾取**以 **active mesh** + 世界球逻辑为准（Tech Spec §1.5）。  
* **与旧 A/B「点大小」的对应（心智模型）**：条带外可见性主要由 **idle** 支路 + **`uBgSizeMul`** 体现；条带内由 **active** 支路 + **`uActiveSizeMul`** 体现；**初值** `uSizeScale=0.3`，`uActiveSizeMul=0.02`，`uBgSizeMul=0.002`（以《视觉参数总表》与 `galaxyMeshes.ts` 为准）。

| 层 | 定义 | 视觉 | 交互 |
| :---- | :---- | :---- | :---- |
| **A — 背景感** | 条带外 `inFocus` 低 | idle 支路为主、较淡较小 | 不作为主拾取层 |
| **B — 条带内** | `inFocus` 高 | active 支路为主、可辨明暗 | **可** hover / click（实现上仅 **active**） |

  * **过渡**：**smoothstep**，非旧版 A/B `step` 硬切。  
* 摄像机控制：  
  * **摄像机轴线始终与 Z 轴平行**（无旋转、无倾斜；参数永远为 `Euler(0, π, 0, 'YXZ')`）。  
  * **滚轮**：沿 Z 轴（release\_date 时间纵深）前后穿梭；**宏观 idle 态下实际写入的是 `zCurrent`**，相机位置由 `zCurrent - zCamDistance` 驱动（Phase 5.1.5）。  
  * **拖拽**：仅执行 **truck**（水平平移）与 **pedestal**（垂直平移）——改变 Camera Position，**Rotation 恒定不变**；XY 位置被 `xy_range + padding` 约束。

### **2.2 微观聚焦状态 (Selected)**

当用户明确**点击选中**某颗星球时，触发以下**分阶段过渡序列**：

1. **相机推进**（生产 **`700 ms` 选中** / **`450 ms` 取消**，`easeOutCubic`；以《视觉参数总表》为准）：飞向 **固定物距** 的 focus 机位；轴线与 Z 平行。  
2. **双 mesh 与 Perlin 切换**：飞入过程中，该影片在 **idle + active** 两 mesh 上 **instance 尺度归零**（`uFocusedInstanceId`）；**C 层**为 **`IcosahedronGeometry(1, 6)`** + **Perlin**（**P8.3**）：CPU 上 noise 分位数定 **4 段**面积比，片元 **硬分带** + 色相来自 **genre_hue** + L/C。旧版 `detail=4` / 单一 `uThreshold` 已废弃。  
3. **档案抽屉滑出**（`easeOutCubic`，在 Perlin 稳定后）：侧边详情滑入。  
4. **取消选中 / 回退**：时长见上，相机与 mesh 显隐由 `scene.ts` 状态机驱动。  

* **环境景深重构**：未被选中的背景星球（无论远近）依然保持极简单色渲染，作为视觉背景，凸显主体。在视距窗口视图下等价于 §2.1 的 A 背景层。

> **注**：飞入/退出毫秒数以《视觉参数总表》与 `scene.ts` 常量为**当前定稿**；若改动画须双处同步。

## **3\. HUD 界面规范 (UI Layout & Styling)**

所有 UI 元素属于前端 DOM 覆盖层，与底层 3D 画布分离。

### **3.1 全局时间轴 (Timeline Indicator)**

在宏观漫游状态（层级零）下常驻显示的唯一 HUD 元素，为用户提供当前 Z 轴（时间纵深）的**位置感知**：

* **形态**：屏幕边缘（建议左侧或底部）的**纵向 / 横向刻度条**，标注关键年份刻度。  
* **当前位置标记**：高亮指示器显示**`zCurrent`**（Phase 5.1.5）——即用户当前关注的发行年，而非裸 `camera.position.z`。  
  * 宏观 idle 态：Timeline 通过 `galaxyCameraZBridge` 订阅 `zCurrent`。  
  * 非 idle（选中飞入 / 特写）：bridge 发布 `camera.position.z + zCamDistance` 作为「等效时间轴读数」，使指示器在飞入动画中不会卡在宏观 `zCurrent` 不动。  
* **交互（可选 / 规划中）**：点击刻度或拖动 thumb 可快速跳转至对应年代，反向写入 `zCurrent`（相机跟随）——本阶段实现为纯被动指示即可；拖动交互作为 **Phase 5.3.1** 单独排期。  
* **视觉基调**：极低存在感——半透明、细线、小字号，避免遮挡 3D 场景主体。具体视觉样式参照 Figma 设计稿。

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

* **`InfoModal`** 内区块标题与正文排版与抽屉 **Overview 段** 同源：`text-[0.65rem] font-bold uppercase tracking-wider` + `text-sm leading-relaxed`；`infoCopy` 文案本身不在 Phase 9 替换。

#### **3.4.4 URL `?theme=light|dark`（P9.5，Dev / 验收）**

* **用途**：开发或验收时快速查看 HUD 在亮 / 暗 CSS 变量下的表现。  
* **行为**：App 挂载时读取 `theme` query；命中 `light` 或 `dark` 时设置 **`document.documentElement.dataset.theme`**，并与 Tailwind **`dark` class** 联动（见 `useThemeFromQuery`）；无参数时维持默认暗色 HUD。  
* **画布**：**不要求** Three.js 场景、星空或 Bloom 随浅色主题重算；画布可保持深色底，与浅色 HUD 并存仅作工程验收场景。