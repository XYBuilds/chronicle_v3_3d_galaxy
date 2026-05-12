# **The Movie Cosmos \- 视觉与交互设计规范 (Design Spec)**

## **1\. 视觉映射法则 (Visual Mapping Rules)**

在 3D 宇宙场景中，数据特征必须严格按照以下规则映射为天体的物理外观：

* **天体体积 (Size)**：映射 vote\_count（评价人数）。  
  * 规则：使用**对数缩放 (Log Scale)**。爆款呈现为巨大恒星，长尾呈现为微小星尘。  
* **内核亮度（OKLab Lightness / L）**：映射 vote\_average（评分，1–10 分）。  
  * 规则：宏观星系 shader 内由 **rating→L** 曲线（Phase 10.1：`uLMin`/`uLMax`、分段压缩与非线性）得到 **L_star**，再经 **Phase 17 距离-L**（观测深度相对 **`zCamDistance`** 参考面的 **\(2/3\)** 次幂衰减，见《视觉参数总表》）得到 **L_distance**，最后由 **Hunt 效应** 令色度 **C** 随 **L** 同步衰减（**`C_new ∝ (L/uLMax)^γ`**），模拟远处低光照下「变暗且降饱和」的感知；**idle 层不再用片元透明度**表达远近（opaque + depthWrite，见状态机 spec §3.1）。**屏幕空间 Bloom** 不是当前产品的默认外观（生产默认不挂 `UnrealBloomPass`；本地可调 `window.__bloom`，见 Tech Spec §1.2）。  
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
  * **`zCurrent`**、**`zVisWindow`**、**`zCamDistance`**：前两者语义不变；**`zCamDistance` 默认仍为 30**，**Phase 17 起**为**运行时可调**物理后退距离（**按住 Space + 滚轮** dolly；**松开 Space** 复位默认；局部 dolly clamp **`[2,30]`**），详见 Tech Spec §1.4.1 / §1.4.3。  
  * 状态在 Zustand 中维护；**拾取**以 **active mesh** + 世界球逻辑为准（Tech Spec §1.5）。  
* **与旧 A/B「点大小」的对应（心智模型）**：条带外可见性主要由 **idle** 支路 + **`uBgSizeMul`** 体现；条带内由 **active** 支路 + **`uActiveSizeMul`** 体现；**初值** `uSizeScale=0.3`，**`uActiveSizeMul=0.01`**（**P22.2**，约为历史 **`0.02` 的 0.5×**），`uBgSizeMul=0.002`（以《视觉参数总表》与 **`galaxyUniformDefaults.ts`** / `galaxyMeshes.ts` 为准）。
* **Phase 19**：宏观漫游（含电影名联想未 focus、Space dolly 推近）下 **active** **默认 opaque + depthWrite**；**仅** focus 会话内保留非目标 **active** 片元 **alpha**（**P11.1**），与《星球状态机 spec》**§3.2.1** 路径 **B** 一致。

| 层             | 定义                | 视觉                      | 交互                                        |
| :------------- | :------------------ | :------------------------ | :------------------------------------------ |
| **A — 背景感** | 条带外 `inFocus` 低 | idle 支路为主、较淡较小   | 不作为主拾取层                              |
| **B — 条带内** | `inFocus` 高        | active 支路为主、可辨明暗 | **可** hover / click（实现上仅 **active**） |

  * **过渡**：**smoothstep**，非旧版 A/B `step` 硬切。  
* 摄像机控制（**宏观 idle**；**focus 态**例外见 **§2.2 Phase 13**）：  
  * **摄像机轴线始终与 Z 轴平行**（无旋转、无倾斜；参数永远为 `Euler(0, π, 0, 'YXZ')`）。  
  * **滚轮（双模式，Phase 17）**：**无 Space 武装**——沿 Z 轴（release\_date 时间纵深）前后穿梭；**宏观 idle 态下写入 `zCurrent`**，相机 **`z = zCurrent - zCamDistance`**（Phase 5.1.5 macro）。**按住 Space + 滚轮**——**dolly-to-cursor**：只改 **`zCamDistance`**（及相机 XY 保持光标下 **`z = zCurrent`** 平面上的世界点），**不改 `zCurrent`**；**松开 Space** 将 **`zCamDistance` 复位为默认**。**Ctrl + 滚轮**交给浏览器页面缩放。**focus 会话**内滚轮（含 Space + wheel）**noop**（Tech Spec §1.4.3）。  
  * **拖拽**：仅执行 **truck**（水平平移）与 **pedestal**（垂直平移）——改变 Camera Position，**Rotation 恒定不变**；XY 位置被 `xy_range + padding` 约束。

### **2.2 微观聚焦状态 (Selected · Phase 13 起含「邻域探索」)**

当用户明确**点击选中**某颗星球时，触发以下**分阶段过渡序列**：

1. **相机推进**（生产 **`700 ms` 选中** / **`450 ms` 取消**，`easeOutCubic`；以《视觉参数总表》为准）：飞向 **固定物距** 的 focus 机位；**宏观段**轴线与 Z 平行。**Phase 13**：**`selected`** 阶段相机切换为**轨道相机**——绕焦点 world 位置（pivot）**偏航 / 俯仰**查看，**半径恒为 `FOCUS_PERLIN_CAMERA_STANDOFF`**；**滚轮不响应**（不推拉、不改变该距离），以保证 Perlin 球屏幕尺寸与 **`vote_count`** 严格对应。进入 / 退出 focus 时位姿与 **`uFocusCameraBlend`** 等由统一 **`transitionDriver`**（`focusDriver.progress`）驱动，含 **position lerp + quaternion slerp**（见 Tech Spec §1.4.2 / §1.4.3 与状态机 spec §3.4.6）。  
2. **双 mesh 与 Perlin 切换**：飞入过程中，该影片在 **idle + active** 两 mesh 上 **instance 尺度归零**（`uFocusedInstanceId`）；**C 层**为 **`IcosahedronGeometry(1, 8)`** + **Perlin**（**P8.3 → P11.3**）：CPU 上 noise 分位数定面积比，片元 **分档** + 色相来自 **genre_hue** + L/C。旧版 `detail=4` / 单一 `uThreshold` 已废弃。  
3. **档案抽屉滑出**：右侧 **`Sheet`** 详情；**Phase 25.6** 起为**自视口右缘整幅向左滑入**、关闭时**向右滑出**（仅 **`transform`**，不透明度过渡关闭）。**Phase 26.2** 起叠放以 **`--z-hud-drawer`**（见 **§3.0.5**）为准，高于 Hover / Tooltip，低于 **Info** 模态（**`--z-hud-modal-*`**）；缓动与时长见《视觉参数总表》与 `Drawer.tsx` / `Phase 25.6` 实施报告。  
4. **取消选中 / 回退**：时长见上，相机与 mesh 显隐由 `scene.ts` 状态机驱动。  

* **环境景深重构**：未被选中的背景星球（无论远近）依然保持极简单色渲染，作为视觉背景，凸显主体。在视距窗口视图下等价于 §2.1 的 A 背景层。**Phase 13**：**球形邻域**内的背景 / active 影片按 mask **可见且可拾取**（`uSelectionMode = 2`），用户可点击**邻域 active** 切换 focus；与 Phase 11.6 Perlin 球拾取优先级一致。

* **Timeline 与年份**：进入 focus 时，时间轴读数与焦点片 **`movie.z`** 对齐（**渐变**或瞬时与相机飞入共用 `focusDriver.progress`，见 Tech Spec §1.4.1）；**退出 focus 后 `zCurrent` 保留在 `movie.z`**，不回退到进入前宏观漫游值。

* **focus 态图例（Phase 13.5 + Phase 14.7.1）**：Perlin 球同心 **`vote_count` 档位参照圆环**（`frontend/src/three/FocusSizeReferenceRings.ts`）与 HUD **`FocusLReference`**（主流派色相上的 **rating→亮度** 参照：**Phase 14.7.1** 起为**竖直色带**（低分在底、高分在上，与 shader 中 **`voteNorm`** 分档一致）+ 横向指针线 + **当前片评分一行**文案；整体布局在视口内**星球左侧**，避免与**横置 Timeline**（§3.1.1）、右侧 Drawer 抢位。**不**展示完整 **0→10** 分度标题轴；文案与圆环 tier 标签同源走 **`STRINGS` / `locales/en.json`**（见 §3）。显隐与 Perlin 球 / focus 过渡一致。

> **注**：飞入/退出毫秒数以《视觉参数总表》与 `scene.ts` 常量为**当前定稿**；若改动画须双处同步。

## **3\. HUD 界面规范 (UI Layout & Styling)**

所有 UI 元素属于前端 DOM 覆盖层，与底层 3D 画布分离。

* **Phase 14 — HUD 文案 SSOT**：所有面向用户的 HUD **英文**字面量以 **`frontend/src/lib/locales/en.json`** 为**键值与模板**的单一事实源；运行时由 **`frontend/src/lib/strings.ts`** 聚合，组件**仅**通过 **`useStrings()`** hook 引用。**不在**各 React 组件内写死可复用文案（**例外**：一次性 **dev-only** **`console.log`** 等开发审计输出可保留字面量）。
* **Phase 21.2 — HUD i18n（多语言）**：HUD 文案扩展为多语言，**仅 HUD / DOM 层**翻译；TMDB 电影标题、人名、genre 名等数据库字段保持原文。当前提供 **EN / 简体中文 / 繁體中文 / 日本語 / Español / Français / العربية**（实现以 [`frontend/src/lib/locales/`](../../frontend/src/lib/locales/) 与 [`LOCALE_IDS`](../../frontend/src/lib/locales/index.ts) 为准）。运行时由 **`useLocaleStore`** 维护当前 locale，**React 组件**用 **`useStrings()`**，**非 React 路径**（loader 错误、`scene.ts`、Three.js Sprite 等）用 **`getStrings()`**；详见 Tech Spec §1.4.8。`zh.json` / `zh-Hant.json` 等所有 locale JSON 的 **leaf key paths** 与 `en.json` 一致，由 `locales.schema.spec.ts` 单测断言。
* **初始化与持久化**：`?lang=zh|zh-Hant|ja|es|fr|ar|en` query → `localStorage['tmc.locale']` → `navigator.language` 启发式 → 默认 `en`。**`setLocale`** 同步写 localStorage 与 `?lang=`（`history.replaceState`），并更新 `<html lang>` 与 `dir`（**`ar` → `rtl`**）。
* **LanguageSwitch HUD**：HUD 右上常驻按钮组顺序固定为 **Info → Lang → Fullscreen**。`LanguageSwitch` 为 Lucide `Languages` 图标按钮 + 下拉菜单，菜单使用**母语标签（endonym）**展示（`简体中文` / `繁體中文` / `日本語` / `Español` / `Français` / `العربية` / `English`）。RTL 全局环境下下拉 `<ul>` 显式 `dir="ltr"`，保证勾选 ✓ 始终位于选项右侧。Three.js focus 尺寸参考圆环的 vote-tier Sprite 标签订阅 `useLocaleStore`，locale 变更时重绘。

### **3.0 Phase 26.2 — HUD 空间设计体系（视口、内容框与 token SSOT）**

> **定位**：本节是 **DOM HUD 与视口几何**的共同语言，与 **§2** 状态机、**§3.1** 起各控件专节互补。**实现上的数值 SSOT** 为 **`frontend/src/index.css`** 中 `:root` 的 **`--hud-*`** / **`--z-hud-*`**；组件内以 `var(--…)` 引用，避免散落魔法数。

#### **3.0.1 目标设备与输入假设**

| 维度 | 约定 |
|------|------|
| **设计基准（视口）** | **约 1600×900**（逻辑像素）**横屏**：HUD 间距、密度与 **P26.2 级回归截图** 的**首要参照**；版式与 Focus 邻域以该尺度「够用且舒服」为第一目标。**不是分辨率硬下限**——更小的横屏仍可访问；底线为 **无功能性裁切**（关键 CTA 可点、文案可读）， exhaustive 视觉 polish 优先低于设计基准。 |
| **主用户与输入** | 桌面 / 笔记本浏览器；**鼠标指针**为主交互。 |
| **纵横比** | 自 **1∶1（方屏）** 至 **超宽屏** 连续变化；布局须在「偏窄的横屏」与「极宽横屏」两端都可读、不重叠关键信息。 |
| **触控** | **不做触屏专项支持**（不要求 44px 触控热区、不做拇指区假设、不验收手指遮挡）。平板 / 手机为**非目标**，仅偶然访问时不保证体验。 |
| **刘海 / 相机 housing** | **保留 §3.0.3.2 内容框**：用 `env(safe-area-inset-*)` 与 token 取 max，以适配 **带刘海的 MacBook** 等「横屏 + 物理遮挡」场景；与「触控安全区」无绑定。 |

以下各节在「断点、clamp、较短 `dvh`」等处均指：**以设计基准横屏为主、覆盖 1∶1～超宽的窗口缩放与浏览器 chrome**；**非**小屏手机竖屏专项。

#### **3.0.2 设计目标**

| 目标 | 说明 |
|------|------|
| **可读** | 3D 画布始终是主角；HUD 低对比、细线、少遮挡。 |
| **可推理** | 任意控件的位置、层级、显隐都能用同一套**空间参照 + 模式**解释，而非「历史 class 堆叠」。 |
| **可验收** | **设计基准**下必过；另在 **1∶1～超宽** 与 **低于基准的横屏压窗** 做抽样，验收 **无功能性裁切** 与 **刘海内容框**（§3.0.3.2）。 |
| **可实现** | DOM 排版与画布锚点分工清晰，减少「为盖住某层临时改 z-index」。 |

**品牌叙述**（与仓库 branding 规则一致）：叙述性文字用 **The Movie Cosmos**；浏览器标题、封面、HUD 内品牌标识用 **the movie cosmos**。

#### **3.0.3 三层空间参照系**

HUD 元素**不得混用参照系而不声明**。统一为下列三类之一。

##### **3.0.3.1 视口框（Viewport frame）**

* **定义**：以 `100vw` / `100dvh`（或等价 `fixed inset-0` 宿主）为外矩形，边距为设计 token（见 §3.0.6）。
* **适用**：搜索条、右上角工具组、时间轴（边对齐）、Cover 相关全屏层等**与星球投影无绑定**的排版。
* **实现提示**：优先相对「视口」`fixed` + token；在 **较短横屏高度** 或 **方屏导致水平紧张** 时用 `clamp` / `min()` 防止裁切；与 §3.0.3.2 配合处理刘海侧。

##### **3.0.3.2 内容框（Content layout frame）**

* **定义**：在视口框内侧再收缩一层：\(\mathrm{inset}_{\mathrm{edge}} = \max(\mathrm{token}_{\mathrm{edge}},\ \texttt{env(safe-area-inset-*)})\)，其中 `safe-area` 在 `env(..., 0px)` 退化。
* **动机**：**MacBook 刘海 / 圆角屏**下的可用矩形为主；若产品需要全屏沉浸，再在 `index.html` viewport 层评估 `viewport-fit=cover`（与当前实现是否一致以 Tech Spec / 代码为准）。
* **适用**：所有「应避开刘海区」的**常驻**控件；与 §3.0.3.1 关系：**内容框 ⊆ 视口框**。
* **现状与方向**：体系化后应统一约定哪些组件必须读内容框（至少：**顶栏 / 右上工具 / 搜索** 与 **顶/左 safe-area** 取 max）。实现见 **`index.css`** `--hud-inset-*` 与各 `fixed` 容器上的 `max(var(--hud-inset-*), env(...))`。

##### **3.0.3.3 画布锚点（Canvas anchor）**

* **定义**：由 Three 桥接写入的**屏幕像素坐标**（如 `hoverAnchorCss`）及派生量（如 `hoverPlanetRadiusCss` → `hoverRingLayout`）。
* **适用**：Hover 环、片名片 Tooltip 的触发点、与星球半径成比例的 offset。
* **规则**：**不**用视口 token 去「手调」锚点位置；半径与 gap 的公式保持**单一来源**（与 §3.2 Tooltip、`hoverRingLayout.ts`、实现模块一致）。
* **性能注**：当前工程在 **`pointermove`** 路径更新 hover 锚点，并对连续相等的值 **去重**，**不**在 `requestAnimationFrame` 每帧向 React 灌入锚点；与「每帧 setState 改 top/left」类反模式不同。若未来需要「相机运动但锚点始终贴住悬停体」，优先 **rAF 直写 DOM** 或轻量订阅，而非每帧 React `setState`。

#### **3.0.4 模式（Mode）与地盘**

交互状态驱动 HUD **显隐与强度**，与 **§2.1 / §2.2** 一致；本节只从**空间设计**归纳。

| 模式 / 条件 | 空间设计要点 |
|-------------|----------------|
| **宏观漫游（idle）** | Timeline、Search、右上工具为主；Hover/Tooltip 随指针与锚点。 |
| **Focus** | 星球邻域：`FocusLReference` 居星球左侧；`FocusExitButton` 置底居中；Timeline 只读、不驱动 `zCurrent`；Drawer 可从右侧占幅滑入。 |
| **Cover** | 全屏品牌与遮罩优先；与漫游 HUD 互斥挂载策略以 App 实现为准。 |
| **Drawer 打开** | Sheet 贴视口边缘滑入；须与 **§3.0.5** z 语义一致，避免误挡退出焦点等关键操作（与 **§2.2** / `Drawer.tsx` 实施为准）。 |

**地盘原则**：每一模式下列出「主舞台 / 次信息 / 系统入口」，并标明是否允许与 3D 中心重叠；新增控件须先落入某一地盘，再分配 z 档位。

#### **3.0.5 叠放层级（z）语义表**

数值以 **`--z-hud-*`** 为准，可与下表语义序微调，但**语义序**不可颠倒。

| 语义档位 | 典型内容 | 相对顺序（低 → 高；以 `index.css` 中 `--z-hud-*` 为准） |
|----------|-----------|----------------------|
| **Canvas** | WebGL 宿主 | 最低（DOM 下） |
| **Cover veil / brand** | Cover 遮罩与品牌层 | `--z-hud-cover-veil` → `--z-hud-cover-brand` |
| **Ambient HUD** | Timeline、右上工具 | `--z-hud-timeline`、`--z-hud-top-tools`（语言下拉 `--z-hud-lang-menu` 紧随其后） |
| **Focus chrome / exit** | `FocusLReference`、`FocusExitButton` | `--z-hud-focus-chrome`、`--z-hud-focus-exit` |
| **Hover feedback** | Hover 环、Tooltip | `--z-hud-hover-ring`、`--z-hud-tooltip` |
| **Search** | 顶部搜索条（含展开面板） | **`--z-hud-search`** 高于 Hover / Tooltip，以便联想层压在画布反馈之上 |
| **Drawer** | 详情 Sheet | **`--z-hud-drawer`** |
| **Modal** | Info 对话框等 | **`--z-hud-modal-overlay`** → **`--z-hud-modal-content`** |

**规则**：禁止为单个 PR「+10 盖过邻居」；若冲突，应调整地盘或模式而非无限堆 z。

#### **3.0.6 间距与尺寸 token（`:root`）**

下列 token 在 **`frontend/src/index.css`** 定义；命名与语义为本节 SSOT。

| Token 语义 | 用途 | 说明 |
|------------|------|------|
| `--hud-inset-xs` / `--hud-inset-sm` / `--hud-inset-md` | 视口边默认 gutter（与 safe-area 取 max 前的基准） | **P26.2 产品约定**：三档统一 **1rem**，不做阶梯缩小 |
| `--hud-gap-stack` | 纵向堆叠间距 | 如右上工具按钮组 |
| `--hud-radius-chrome` | HUD 控件圆角 | 与 `--radius` 家族对齐或略小 |
| `--hud-search-max-w` / `--hud-search-width` | 搜索条最大宽度与「视口 − gutter − 横向 safe-area」合成宽度 | 与 §4.1 搜索条布局一致 |
| `--hud-drawer-max-by-planet-safe` / `--hud-drawer-max-readable` / `--hud-drawer-max-w` / `--hud-drawer-min-w` | 右侧 Drawer 宽度的上/下限 | **最大**：`min(0.28×100vw, 32rem, 右侧留白公式)` — `0.28` 略紧于「中间三分之一」纯几何，为 Focus Perlin 留出中心加权空域；**最小**：详情可读地板（如 **18rem**），极窄下可能与 max 竞合，以浏览器 min/max 解析为准 |
| `--hud-focus-ref-center-gap-*` / `--hud-focus-ref-height-*` | Focus 评分参考条水平锚点与竖直高度 | 水平：`max(下限, 100vw/6)`；竖直：`max(下限, 100vh×0.4)` 等（以 `index.css` 为准） |
| `--hud-focus-exit-*` | 退出 Focus 按钮相对视口中心与底部的 clamp | 与 `FocusExitButton` 中 `100dvh`、safe-area 组合一致 |

**指针命中**：以桌面惯例即可（如 shadcn `Button` / `IconButton` 默认 padding），**不**设独立「触控最小边长」token。

**水平搜索条**：宽度宜为「内容框宽度 − 水平 inset ×2」的函数，并设 `max-width` 避免超宽屏一条过长。

**竖直方向**：对依赖 `50%` + `rem` 的控件（如退出焦点），继续采用 **`min(理想位置, 短视口上限)`** 与 **`safe-area-inset-*`** 的组合，避免 **较短窗口高度** 或 **底部/侧边 safe-area** 导致裁切。

#### **3.0.7 断点与密度**

* **Tailwind 断点**（`sm` / `lg` / `2xl` 等）作为**密度切换**触发，而非随意混用魔法数。
* **Focus 星球邻域**：在 **1∶1～超宽** 范围内，水平锚点以 **视口比例 + inset 下限** 表达（见 `--hud-focus-ref-*`）；方屏时保证不越左缘；超宽时避免与星球、Drawer 抢位。
* **横置时间轴**（**§3.1.1**）：与左侧竖轴、右上工具的地盘分工以 **§3.1** 为准；两种 orientation **共享** token 与 z 语义，仅改变刻度几何。

#### **3.0.8 动效与过渡（空间的一部分）**

| 类型 | 原则 |
|------|------|
| **Drawer** | 以 **§2.2** 为准：整幅位移进出场、与 duration / easing 常量一致。 |
| **模式切换** | Cover ↔ 漫游、进入 / 退出 Focus，避免同一控件无意义大跳；若必须变位，应有可感知的过渡或统一对齐边。 |
| **微交互** | Tooltip、按钮 hover 时长短于抽屉，避免「全屏同一 easing」的拖沓感。 |

#### **3.0.9 信息架构与控件秩序**

* **右上常驻顺序**（已定稿）：Info → Language → Fullscreen（本节篇首与 **§3.7**）。
* **搜索**：主入口；与 Drawer 同时存在时，明确主次（例如 Drawer 打开时搜索是否保持可点，以产品决策为准并回写实现）。
* **退出 Focus**：单一主路径（`FocusExitButton` / **`STRINGS.hud.exitFocus`**）；不依赖「点空白关闭」。

#### **3.0.10 国际化与 RTL**

* 文案键与模板以 **`en.json`** 为结构 SSOT；插值变量与 HTML 标签不得破坏（仓库 `sync-doc` 规则）。
* **`ar` locale**：`html` 上 `dir="rtl"`；下拉等需保持可读性的区域可按 **`LanguageSwitch`** 的 **`dir="ltr"`** 等例外执行，并在组件级注释标明「例外原因」。

#### **3.0.11 可及性（A11y）与输入形态**

* **指针**：Hover / Click 为主；不要求触屏手势或双指缩放（页面级 Ctrl+滚轮缩放仍遵循浏览器约定）。
* **键盘**：焦点顺序应沿内容框与语义档位合理循环；Focus 态下 Timeline 不作为 **`slider`** 暴露（**§3.1**）。
* **读屏**：抽屉标题 / 描述、`aria-label` 与 **`STRINGS` / `en.json`** 及本篇 **§3** 专节已定稿文案同源。

#### **3.0.12 工程映射与单一事实来源**

| Concern | SSOT |
|---------|------|
| 文案与 i18n | `frontend/src/lib/locales/en.json` + `locales.schema.spec.ts` |
| 星球邻域几何 / Tooltip offset | `frontend/src/hud/hoverRingLayout.ts`（及本节 §3.0.3.3） |
| Focus 动画时长 | 《视觉参数总表》+ `scene.ts` / `transitionDriver` |
| HUD 布局与 z token | **`frontend/src/index.css`** `:root`（本节 §3.0.5–§3.0.6） |

**反模式**：在业务组件内散落互不关联的 `z-[N]`、`top-[calc(...)]` 而无注释归属 §3.0。

#### **3.0.13 验收清单（P26.2 视口回归）**

以下可在 PR 或发布前勾选：**必测**为 **§3.0.1 设计基准**（约 1600×900 横屏）+ **比例两端**（约 1∶1、超宽）；**抽样**可选低于基准的横屏压窗，确认无功能性裁切与 safe-area。

* [ ] **较短 `dvh`**（横屏窗口压扁）：搜索条、退出焦点、竖/横 Timeline 无裁切、不与浏览器底栏 / safe-area 冲突。
* [ ] **刘海 / safe-area**：`env(safe-area-inset-*)` 下右上工具、搜索、顶缘控件不进入刘海不可用区（若启用 `viewport-fit=cover` 需单列一条）。
* [ ] **比例两端**：**约 1∶1** 与 **超宽** 各至少一屏截图归档；超宽下搜索条不过度拉伸（`max-width` 仍生效）。
* [ ] **Focus**：`FocusLReference` 不与横置 Timeline、Drawer 同时不可读（以 **§3.1** / **§2.2** 分工为准）。
* [ ] **z 序**：Hover / Tooltip 低于 Search 联想层；Drawer 高于 Search；Info 模态始终最顶（见 **§3.0.5**）。

### **3.1 全局时间轴 (Timeline Indicator)**

在宏观漫游状态（层级零）下常驻显示的唯一 HUD 元素，为用户提供当前 Z 轴（时间纵深）的**位置感知**：

* **形态**：屏幕边缘（建议左侧或底部）的**纵向 / 横向刻度条**，标注关键年份刻度。  
* **当前位置标记**：高亮指示器显示 **`zCurrent`**（Phase 5.1.5 / **Phase 13**）——即用户当前关注的发行年；**HUD 订阅 `bridgeZ = zCurrent`**（与 Tech Spec §1.4.1 单一路径一致）。**Focus 态 `FocusLReference`**（§2.2）：**Phase 14.7.1** 起置于**星球左侧**竖条，与 **`?timeline=horizontal`** 底部横轴、右上角 **Info / 全屏**控件分工，避免重叠或可读性明显下降（窄屏以实现对齐为准）。  
  * **宏观 idle 态**：`zCurrent` 由滚轮 / 时间轴与相机 **`zCurrent - zCamDistance`** 同步。  
  * **focus 态及过渡**：`zCurrent` 与焦点 **`movie.z`** 对齐（可与飞入动画**渐变**）；**退出 focus 后 `zCurrent` 保留在 `movie.z`**。
* **交互（宏观 idle · Phase 5.3.1 已落地）**：拖动轨道或点击刻度 / 键盘方向键可写入 **`zCurrent`**（与 `galaxyCameraZBridge` 一致）。**Phase 25.2 · focus 被动态**：**单片 focus**（`selectedMovieId !== null`）下 Timeline **仍渲染**读数与刻度，但**不**绑定 **`onZCurrentChange`**——用户操作不改变 **`zCurrent`**；无障碍不将轨道暴露为 **`slider`**（见 `Timeline.tsx`）。  
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
* **P22.5 退出入口收口**：Drawer 右上角 `X`（`SheetClose`）已移除；focus 退出由屏幕底部居中的 floating 按钮触发（**`FocusExitButton`**）。**Phase 25.6 文案定稿**：英文 **`STRINGS.hud.exitFocus`** = **`View cosmos`**（全 locale 键对齐，见 `frontend/src/lib/locales/en.json`）。不接受“点击空白区域退出 focus”的交互路径。
* **P22.3 海报档位**：`poster_url` 对应 TMDB `w780` 档位，用于提升 Drawer 海报清晰度（尤其高 DPI 屏幕）。

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
* **Cast（Phase 25.5）**：**无序号**；响应式 **`grid-cols-1` / `sm:grid-cols-2` / `lg:grid-cols-3`**，与 **`movies[].cast` 全量**（主包默认不截断，见 Tech Spec §2 / Data Pipeline）一致；长列表在抽屉**可滚动正文区**内换行展示，不撑破视口。  
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

#### **3.4.5 Phase 14 → Phase 21.2 — 文案语言与多语言切换**

* **产品 HUD**：默认 **英语**；**Phase 21.2 起**支持多语言切换（EN / 简体中文 / 繁體中文 / 日本語 / Español / Français / العربية），实现细节见 §3 头部 SSOT 段落与 Tech Spec §1.4.8。
* **DB 字段**：电影标题、原标题、`overview`、`tagline`、人名、genre 名等**沿用 TMDB 原文**，不进入 i18n 翻译范围（避免歪曲数据语义并保持搜索一致性）。
* **dev 审计 `console.log`**：保留**英文前缀**（如 `[Search] genre AND filter`），**不**进入 `STRINGS` / `locales/*.json`。中文仍可出现在**项目文档**（PRD / Tech Spec / Design Spec / 报告）。

### **3.5 首屏 Loading + Cover（Phase 23 · The Movie Today）**

本节取代原 **Phase 15 Cover-with-Start**：**已移除 Start 按钮**；加载完成后 **自动**进入 Cover，**Perlin 球**为唯一主入口。

#### **3.5.1 Loading（gzip + 索引）**

* **组件**：**`frontend/src/components/Loading.tsx`**；根容器 **`role="status"`**（忙状态）。  
* **叙事**：**四阶段**（download → decompress → parse → index），以**百分比数字 + 阶段词**为主；**无**旧版条形进度条。  
* **品牌（UI 身份面小写）**：**`the movie cosmos`** 与 **`today`** 双品牌字；标题级字形使用 **`font-butler`**（Butler webfont，仅用于首屏品牌区）。  
* **设计 token（P23.4b）**：**`--cosmos-universe-bg`**（宇宙背景色）与 **`--cosmos-brand-muted`**（浅灰场 / 完成态字色，当前 **`#f2f2f2`**）定义于 **`frontend/src/index.css`**；Loading 与 Cover 共用。**加载中**：**`the` / `movie` / `cosmos`** 在浅场上使用宇宙背景色字；**`today`** 使用 **`--cosmos-brand-muted`**。**旧版全屏背景 CSS 渐变动画已删除**。  
* **完成态过渡**：Loading 卸载后，Cover 入场 **1000ms** 过渡由 **`CoverBackdrop`** 与页面遮罩（如 **`cosmos-cover-entry-page-shade`**）承担：**页面底色 → 宇宙背景**；**`the` / `movie` → brand-muted**；**`cosmos`** 保持宇宙色（分轨）；**`today`** 全程 brand-muted。实现须尊重 **`prefers-reduced-motion`**（见 `index.css` 媒体查询）。  
* **像素级 SSOT**：间距、断点、曲线以 **Figma** 为准；对齐记录见 [`Phase 23.2 P23.2 Loading Figma 对齐实施报告.md`](../reports/Phase%2023.2%20P23.2%20Loading%20Figma%20对齐实施报告.md)、[`Phase 23.4b P23.4b Cover 首屏品牌与入场动效 实施报告.md`](../reports/Phase%2023.4b%20P23.4b%20Cover%20首屏品牌与入场动效%20实施报告.md)。

#### **3.5.2 Cover（场景已挂载 · 无 click hint）**

* **文案层**：**`frontend/src/hud/CoverBackdrop.tsx`** — 仅保留 **`the movie cosmos`**（左）与 **`today`**（右）；**不渲染** **`STRINGS.cover.todayHint`**（词条可保留兼容）。**不新增**其它提示文案。文案层 **`pointer-events: none`**，避免阻挡空白处 **orbit** 拖拽。  
* **中心 Perlin**：**The Movie Today** 对应影片的 focus 球体；**复用主体 hover**（**`HoverRing`** 白圈）+ **`MovieTooltip`**（字段与主体一致：**title + genres**）。  
* **点击 / 键盘**：点击球体，或 **`Enter` / `Space`**（**`CoverBackdrop`** 内在 **`showTodayFocusTrap`** 时渲染的透明 **`button`**，**`aria-label`** 来自 **`STRINGS.cover.todayFocusAriaLabel`**）→ **`exitCoverIntoFocus`**：展开 **Drawer**、**`coverMode=false`**；**相机 yaw/pitch/distance 沿用** Cover orbit。  
* **空白拖拽**：与 **focus** 态一致绕 pivot **orbit**；**`?orbitDrag=normal|inverted`**（**`orbitDragDirection.ts`**）在 Cover / focus **一致**。  
* **ESC**：Cover 阶段 **不**作为「取消 today」；退出 focus 仍按 **P22** **`FocusExitButton`**。  
* **交叉引用**：**`coverModeStore.ts`**、**`scene.ts`** **`uCoverMode` / `uCoverTodayInstanceId`**、Tech Spec §1.1 / §1.4.7。

### **3.6 Close 控件 primitive（Phase 14）**

* **组件**：**`CloseButton`**，实现路径 **`frontend/src/components/ui/close-button.tsx`**。
* **Variants**：**`default`**（带边框的方形按钮）/ **`ghost-sm`** / **`ghost-lg`**（轻量幽灵态，尺寸分档）。
* **图标**：**`lucide-react`** 的 **`X`**；**`aria-label`** 等可访问性文案走 **`STRINGS`**（与 §3 SSOT 一致）。
* **视觉**：**`CloseButton`** 的边框线宽与 **hover 环 / Timeline** 同属 **UI edge** 线宽语义（**`--ui-edge-stroke-width`**，见《视觉参数总表》**§7**、**§7a**）。**颜色**：按钮叠在 **DOM 壳层**，使用随主题变化的 **`--ui-edge-color` / `--ui-edge-color-strong`**；**HoverRing** 与 **Timeline** 仅叠在 **黑色 WebGL 画布**上，使用 **`:root` 固定**的 **`--ui-edge-canvas-color` / `--ui-edge-canvas-color-strong`**（与 **§3.4.4**「画布可保持深色底」一致，避免 `?theme=light` 时环与轴变成浅灰细线导致对比度错误）。

### **3.7 全局键盘快捷键与全屏 / 语言控件（Phase 14 · HUD ；Phase 21.2 LanguageSwitch）**

* **HUD 右上按钮组**（实现位置 `App.tsx`；边距与 z 以 **`index.css`** 中 **`--hud-inset-*`**、**`--z-hud-top-tools`** 等为准，见 **§3.0**）：从左到右依次为 **`InfoButton` → `LanguageSwitch` → `FullscreenButton`**。容器 `pointer-events-none`，子按钮自身 `pointer-events-auto`，避免遮挡 3D 画布的鼠标穿透。
* **全屏按钮**：**`FullscreenButton`**（`frontend/src/hud/FullscreenButton.tsx`；**`lucide-react`** Maximize / Minimize）；监听 **`fullscreenchange`** / **`webkitfullscreenchange`** 同步图标；行为与下述 **`F`** 一致（Safari 等需 **webkit** 前缀检测时以源码为准）。
* **语言开关**：**`LanguageSwitch`**（`frontend/src/hud/LanguageSwitch.tsx`；Lucide `Languages` 图标 + 下拉）。点击展开 `role="menu"` 菜单，列出**母语标签**；当前 locale 项 `aria-checked` + 行尾 ✓；点击其它项即时切换并持久化（详见 §3 头部 SSOT 段落与 Tech Spec §1.4.8）。下拉 `<ul>` 显式 `dir="ltr"`，使阿拉伯语等 RTL 全局下勾选位置仍稳定在右侧。

以下快捷键在 **App 级** 全局监听（与 §4 搜索 combobox 内 **`↓`/`↑`/`Enter`/`Tab`** 等**不重复登记**同一键位语义；实现以源码为准）：

* **`F`**：**切换浏览器全屏**（**仅当**焦点不在 **`input` / `textarea` / `contenteditable`** 等文本输入控件内时生效，避免打断输入）。
* **`Cmd` + `K`（macOS）** / **`Ctrl` + `K`（Windows / Linux）**：聚焦顶部搜索框（`input[data-galaxy-search-input]`）；当搜索因 **`meta.has_search_index !== true`** 而 **disabled** 时 **noop**；与 combobox 内输入 **不冲突**（未在输入框内劫持同一键位语义）。
* **`Esc`**：**焦点栈**与状态回退维持 **§4.6**（Phase 12.8）不变。

## **4\. 搜索 UX（Phase 12 起 · UX SSOT）**

本节为搜索功能的 **UX 单一事实源（SSOT）**：覆盖入口位置、控件、联想规则、ESC 焦点栈与状态嵌套行为。**数据契约**（管线字段、`galaxy_search_index.json.gz` Schema）以《Tech Spec》§4 为准；**渲染层语义**（selectionMask、focus×select 优先级）以《星球状态机 spec》§3.6 为准；**功能需求**（产品价值、用户旅程）以《PRD》§3 为准。**性能与 fps 归档**（含人名 60+ active、genre 大集合压力片段；**Phase 16** 复跑口径与手测清单）见 [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) **`## P12 入口/出口`**、**`## P13.0 入口`**、**`## P13 出口`** 与 **`## P16 出口`**。

顶部 **HUD** 搜索：与 3D 画布分层。数据来源为 `galaxy_data`（电影字段）+ 配套 `galaxy_search_index.json.gz`（人名 / genre 索引）。当 **`meta.has_search_index !== true`** 时，搜索框为 **disabled**，仅显示提示语，不阻塞画布。

### **4.0 三条核心体验（验收口径）**

1. **搜电影名**（含其它语言的 **`original_title`**）：关键词联想 → 点击正确项 → 进入对应影片 **focus** 态（相机飞入 + Perlin + 抽屉）。  
2. **搜人名**（覆盖 **`cast` / `director` / `director_of_photography` / `writers` / `producers` / `music_composer`** 聚合）：点击人物 → 进入 **`person` select 会话**：**该人物参与的全部影片星球 active，其余 idle**（**active 集合由搜索结果决定**，不再受 timeline `viswindow` 条带控制；timeline 数值仍可在后台被 wheel 写入，但**不影响视觉**）。同时按 **`release_date` 升序** 用纯白细线连接星座图（**默认开**；产品 HUD **无**开关，调试用 **`window.__galaxy.constellationEnabled`**，见《视觉参数总表》§4a）。**Phase 12.7 起**连线按职位拆为**三条独立时间链**，使「演员同框」「主创班底」「制片同盟」三种叙事并行可读；各链端点沿弦内缩到 active 球壳外（避免线段切入星球 mesh），连线视觉细则与降级行为见 §4.4a。  
3. **搜 genre**（**Phase 21.3 起为 AND 多选 badge**，详见 §4.5）：在 **Genres** 分段下显示 **19 个流派** badge 网格（颜色源自 `meta.genre_palette`）；点击 1 个 badge 即进入 **`genre` select 会话**（凡 `movie.genres` 包含该 genre 的影片 **active**，其余 **idle**）；继续点击第 2 / 3 个 badge 进入 **AND 交集**；**死路 badge**（再选交集为 0）即时灰显并不可点。**不**画星座连线；同样不再受 viswindow 控制。**该分段不再是「输入联想」**。

### **4.1 布局与控件**

* **位置**：`fixed` 贴顶居中；水平宽度与顶边距以 **`--hud-search-width`**、**`--hud-inset-*`** 与 safe-area 组合为准（见 **§3.0.6**）。**`z-index`** 以 **`--z-hud-search`** 为准：实现上 **高于** Hover 环与 Tooltip（便于联想层压在画布悬停反馈之上），但 **低于** Drawer 与 **Info** modal（**§3.0.5**）。
* **idle / active 双态（Phase 21.4）**：联想面板根容器（同时承担 document mousedown 关闭判定）通过 **`data-state="idle" | "active"`** 切换两种视觉，外层加 **`group`** 让 input / tab 条用 **`group-data-[state=*]`** 跟随：
  * **active 触发**（**任一**为真即 active）：**`hoverInside`**（鼠标进入容器任意区域）、**`focusInside`**（任一可聚焦子元素获焦；`onFocusCapture`/`onBlurCapture` 仅在 `relatedTarget` 不在容器内时清除）、**`panelVisible`**（movie / person 分段下 `listOpen && canShowList`）。
  * **idle 视觉**：`bg-transparent` + `border-border/40` + `shadow-none` + `backdrop-blur-none`，最大限度让出星空。
  * **active 视觉**：`bg-popover/95` + `border-border/80` + `shadow-lg` + `backdrop-blur-md`；过渡 `transition-[background-color,backdrop-filter,box-shadow,border-color] duration-150`。
  * **input / tab 条同步**：input 在 idle 下为弱玻璃感（白边 + 极低 alpha 白底，**浅色主题** idle 字色为 `text-white`、active 字色回到 `text-foreground`，避免黑色画布上深色字不可见）；tab 条 idle `bg-muted/20` → active `bg-muted/40`。**深色主题**保持 `border-input` + `bg-background/30 → /80`（与 Phase 21.4 + Phase 21.5 SearchBar 实施报告一致）。
  * **退出 idle 不清空 query**：失焦 + 鼠标离开 + 联想未展开时面板回 idle，但搜索框文字保留。
* **分段（Phase 21.5 浅色 tab 对比修复）**：三档 **`movie` / `person` / `genre`**（segmented control：`Tabs` 或三键 ToggleGroup）。**切换分段时清空** query + 联想，避免跨模式残留。**Tab 视觉**：选中 / 未选中均使用 `buttonVariants({ variant: 'ghost', size: 'xs' })` + 条件叠类——浅色（无 `.dark`）选中 `bg-foreground text-background shadow-sm`、未选 `bg-transparent text-muted-foreground`；深色选中 `dark:bg-secondary dark:text-secondary-foreground`、未选 hover 走 `dark:hover:bg-muted/50`。**不修改** [`button-variants.ts`](../../frontend/src/components/ui/button-variants.ts)，避免影响全局 Button 语义。
* **输入框 placeholder（Phase 16 · HUD 文案 SSOT）**：面向用户的占位符以 **`frontend/src/lib/locales/en.json`** 为键值 SSOT，经 **`strings.ts`** 聚合为 **`STRINGS.searchBar`**；组件按当前分段 / 索引可用性切换，**不**在 JSX 内写死。**三档精确字符串（D1）**：**`movie`** → `Search movie titles…`；**`person`** → `Director / Producer / Cast …`；**`genre`** → `Drama / Comedy / Thriller …`。未点分段、或实现将「空闲」视为 movie 档时，取 **movie** 档文案。**`meta.has_search_index !== true`** 时输入 **disabled**，占位符为 **`Search index unavailable`**。切换分段时 placeholder **立即**随控属性更新（无需过渡动画）。
* **输入框**：单行文本；右侧 **清除按钮（X）**，一键清空 query 并收起联想；点击 X **同时退出**当前 select 会话（清 `selectionIds`，见 §4.7）。
* **联想面板**：输入框下方浮动列表（`Popover` 或自建 `<ul>`）。

### **4.2 联想触发、节流与键盘交互**

* **触发阈值**：默认 query **`trim().length >= 3`**（拉丁 / 西里尔 / 阿拉伯等）。**Phase 21.1 起**：若 trimmed 串包含 **`\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}`** 任一脚本，则最小长度降为 **1**（CJK / 假名 / 谚文单字即可触发）；判定函数 `searchMinQueryLengthForTrim` 由 SearchBar 与 `score*ForQuery` 共用，UI 门槛与召回门槛一致。
* **防抖**：**`200 ms` debounce**（`SEARCH_QUERY_DEBOUNCE_MS`）；可叠加 `useDeferredValue` 抗顿。
* **条数上限**：电影名 **不再设上限**（Phase 21.6 取消硬编码 12 条 cap）；联想列表用既有 `max-h-72 overflow-y-auto` 滚动容器承载，DEV 环境 `>300` 条时一次性 `console.warn`，但**不**做虚拟列表（不在本 phase 范围）。人名 **≤ 8**；genre **不再用搜索联想**（Phase 21.3 改为 AND 多选 badge，见 §4.5）。
* **键盘**（标准 combobox）：
  * **`↓` / `↑`**：在联想列表内高亮上下条；列表未展开但有结果时 `↓` 展开并定位到第一条。
  * **`Enter`**：等价于点击当前高亮项（无高亮则不触发）。
  * **`Tab`**：**不**拦截（让浏览器自然移焦，方便键盘用户继续浏览页面）。
  * **`Esc`**：见 §4.6。
* **点击联想项**：关闭下拉；`movie` 走 §4.3 → focus；`person` / `genre` 走 §4.4 / §4.5 → select 会话；并将输入框 `searchQuery` 替换为已选项的格式化文本（见各节点击行为）。

### **4.3 联想：电影名（`movie`）**

* **过滤（Filter）**：搜索词与 **`title`** / **`original_title`** 做 **忽略大小写**子串检索（实现优先消费管线产物 **`title_normalized`**；前端镜像 `normalizeForSearch`：**Phase 21.1 起为 NFKC + `\p{M}` 去 mark + `toLowerCase()`**，与 Python 侧 `normalize_for_search_v2` 同构，保留 CJK / 西里尔 / 阿拉伯 / 谚文等非拉丁脚本）。**仅**支持 **前缀匹配（Starts with）** 与 **包含匹配（Contains）**；**不做** Fuzzy / 拼写纠错。**`meta.search_normalize_version !== "v2"`** 的旧包仍可消费 `title_normalized`，但其值为旧 v1 ASCII fold，CJK 已被剥离丢失（前端 `loadGalaxyData` 在加载时 `console.warn`）。
* **排序（Sort）**  
  * **第一维度（匹配类型）**：前缀匹配 **优于** 包含匹配。  
  * **第二维度（加权热度）**：同档内 `Score = Math.log10(vote_count + 1) × vote_average`，**降序**。  
  * **`release_date` 不参与排序**（任何维度）。
* **条数（Phase 21.6）**：返回**全部命中**，不再截断为 12 条；后缀类 contains 命中（如 query `batman` → `The Batman`）可在滚动列表中浏览到。
* **格式化（Format）**：行内布局语义为 **`Title`** + **`原始标题`** + **`(YYYY)`** + **`Genre0`**（即 **`genres[0]`**；`YYYY` 取 `release_date` 前 4 字符）。  
  * **去重**：若 **`original_title`** 与 **`title`** 相同或为空，**不再重复**展示原始标题段。
* **高亮（Highlight）**：用忽略大小写正则在最终展示字符串上匹配 query，命中子串用语义 mark（`<mark>` + `bg-primary/30` 等）包裹。
* **点击行为**：`useGalaxyInteractionStore.setState({ selectedMovieId: id })`，复用现有 focus 链路；**不进入** `select` 会话；输入框 query 替换为该电影联想格式化标签（`Title [Original] (YYYY) Genre0`）。**`zCurrent`（Timeline）**：上述 `setState` 触发 **Phase 13.4** 既定过渡——**`zCurrent` 自动对齐到该片 `movie.z`**（与相机飞入等同节奏的 **`transitionDriver`** 标量）；搜索层 **无需**再写独立 zCurrent 写入逻辑。

### **4.4 联想：人名（`person`）**

* **过滤**：搜索词与 `searchIndex.people[*]` 的 **normalized 键** 做忽略大小写子串检索。索引须覆盖 **`cast` / `director` / `director_of_photography` / `writers` / `producers` / `music_composer`**。
* **匹配类型（任意 token 前缀）**：把 **normalized 键**按空白拆分为 token 列表；当 query 是任一 token 的前缀（含整体前缀）时记为 **prefix**；否则若是整串子串则记为 **contains**。  
  * 例：query「nolan」对「christopher nolan」记为 **prefix**（命中 `nolan` token 的前缀），对「al pacino」既非前缀也非子串则不召回。
* **排序**：第一维度 prefix **优于** contains；第二维度为 **`movie_ids.length`** **降序**（参演越多越靠前）。
* **格式**：展示 **全名**（索引内 **`full`**）；可选追加 **`role_mask`** 角色标签（位定义见 Tech Spec §4.5）。
* **高亮**：在 `full` 上用同一忽略大小写正则匹配 query，规则同 §4.3。
* **点击行为**：写入 store —— `searchMode='person'`、`selectionIds=people[name].movie_ids`、**`selectionPersonKey=name`**（normalized key，供 `scene.ts` 在 RAF 中读取该人 `movie_roles` 拆三组连线，见 §4.4a）、`selectedMovieId=null`、`constellationEnabled` 走 Leva 默认（默认 `true`）；输入框 query 替换为 `people[name].full`。**`zCurrent`（Timeline）**：与写入 `selectionIds` / `searchMode='person'` **同帧**，**额外**驱动 **`zCurrent`** 经与 **Phase 13.1** **`focusDriver` / `zCurrentDriver`** 同节奏的 **`transitionDriver` 曲线**（**`700 ms`**、**`easeOutCubic`**）渐变到 **`min(movie.z over selectionIds)`**（选区内按发行年**最早**的 active 所在 Z，即「最早的 active 星星」语义）。若 `selectionIds` 为空（不应发生）则 **noop**（实现可 `console.warn`）。

### **4.4a 人名星座连线（Phase 12.7 · 三组职位链）**

`person` select 会话且 `constellationEnabled` 为 true 时绘制；`genre` 模式不画线。

* **数据来源**：`searchIndex.people[selectionPersonKey].movie_roles`（每片职位位掩码，详见 Tech Spec §4.5.1）。
* **三条独立时间链**（按 `release_date` 升序相邻连段，各链互不相交）：
  1. **producers**（位 `16`）—— 该人作为制片人参与的影片串。
  2. **crew**（位 `2 | 4 | 8 | 32`，即 director / director_of_photography / writers / music_composer 合并为一根「主创班底」链）。
  3. **cast**（位 `1`）—— 演员同框链。
* **视觉**：统一**纯白** `0xffffff`、默认 `opacity = 0.025`、hover 命中链 `opacity = 0.2`、`transparent: true`、`depthWrite: false`、线宽 1px（WebGL Line 限制）；**不**做按职位分色，避免与 genre 色板冲突；多链同时存在时整体仍呈低存在感「星图」。
* **hover 触发语义（P22.6）**：触发对象是“人名 select 会话中 hover 到的某颗星”。根据该片 `movie_roles[movieId]` 的位掩码提升对应链透明度；一颗星可同时点亮多链（如 cast + crew）。鼠标移开后各链在 `500ms` 内线性回落到默认透明度。
* **几何避让**：每段两端沿弦方向各内缩 `r + CONSTELLATION_SURFACE_GAP_WORLD`（`r` = 该端点 active 球壳半径，常量默认 **0.2** world），缩进后弦长不足则**跳过该段**，确保线段不切入 active 星球 mesh；`mesh.renderOrder = 0.5`（介于 idle 0 与 active 1 之间）。
* **focus 嵌套**：`selectedMovieId !== null`（单片 focus + Perlin 球会话）时**整层星座隐藏**；ESC 取消 focus 后连线恢复（select 会话仍在则继续显示）。
* **降级路径**：旧包 `searchIndex` 缺失 `movie_roles` 时**不报错**，退化为 `selectionIds` 一条按时间序的折线（与 Phase 12.6 初版一致）。

### **4.5 流派 AND 多选 badge（`genre` · Phase 21.3）**

> Genre 分段不再使用「输入联想」。原因：用户记不全 19 个 TMDB 官方 genre 的英文名，且无法用单一关键字表达「Action ∩ Drama」类常见交集需求。Phase 21.3 起改为 AND 多选 badge 网格。

* **数据来源**：流派列表优先用 **`meta.genre_palette`** 的 key 集合（按字典序排序，与管线 frozen palette 一致），缺省回退 `searchIndex.genres` 的 key；每流派 `movie_ids` 来自 [`searchIndex.genres[name].movie_ids`](#)。
* **UI 结构**：
  * **顶栏（已选条 strip）**：`min-h-8`，无选中时显示 `STRINGS.searchBar.genreMultiEmptyHint`（如英文 *Click genre(s) to filter…*）；有选中时左侧为可移除的已选 badge（`md` 尺寸，带 ✕），右侧实时显示交集计数 `<n> {{matches}}`。
  * **候选网格**：`flex flex-wrap`，仅展示**未选中**流派的 badge（`sm` 尺寸，带 `(<previewN>)` 计数）；颜色由 `meta.genre_palette[name]` 的 sRGB hex 经 `color-mix(in oklch, ...)` 三段式（背景 18%、边框 60%、字色 foreground）渲染，与 §3.4.2 Badge `variant="genre"` 共享样式（实现：`.genre-chip-tint` 类与 `getGenreChipSurfaceStyle`）。
* **AND 交集与死路预测**：
  * `currentIntersection` = `selectedGenres.reduce(intersect movie_ids)`；`null` 等价于「无选中」会话，触发 `clearSearch()` 退出 genre 模式。
  * `previewCountIfAdded[g]` = 若再添加 `g`，与 `currentIntersection` 求交后的规模（无选中时即 `g` 单独 movie_ids 数）。
  * **死路 disable**：候选网格中 `previewN === 0` 即 badge 灰显（`opacity-40` + `cursor-not-allowed`）且不响应点击，即时阻止用户走入空集。
* **写回 store**（在 `useLayoutEffect` 中布局阶段同帧写，避免与 ESC `clearSearch()` 同帧竞态被覆盖）：`searchMode='genre'`、`selectionIds = sortIdsByRelease([...currentIntersection], movieById)`（按 `release_date` 升序）、`selectionPersonKey=null`、`selectedMovieId=null`、`searchQuery = selectedGenres.join(' + ')`；连线不开启（`person` 才画星座线）。
* **退出**：用户**移除最后一个**已选 badge → 同帧清空 `selectedGenres` 并 `clearSearch()`；ESC 经 §4.6 第 4 级清 `searchMode='idle'` → 组件用前次 `searchMode` 的 transition 检测重置 `selectedGenres`；**离开 Genres 分段**（切到 movie / person）显式 `setSelectedGenres([])` + `clearSearch()`。
* **快捷键**：Genre 分段下可见 `<input>` 不再渲染，但保留**屏幕外** `sr-only` 的 `data-galaxy-search-input`，使全局 **Cmd/Ctrl+K** 仍能聚焦搜索（§3.7）。
* **`zCurrent`（Timeline）**：**不修改** **`zCurrent`**，保持用户进入 genre 模式前的宏观时间关注点；与《星球状态机 spec》**§3.6** 一致——select 会话下 **`viswindow` 条带对 active 集合无视觉反馈**，不要求 Timeline 为流派大集合「滚动到条带中心」。
* **i18n 键**（`STRINGS.searchBar.*`，所有 locale 同构，由 `locales.schema.spec.ts` 断言）：`genreMultiEmptyHint`、`genreMultiMatches`、`genreMultiRemove`。**已移除**：`genreMultiHelp`（旧的网格底部说明文案，已被顶栏空态提示取代）。

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

### **4.9 已知限制（Phase 16）**

* **person select 下 active 的屏幕可读性**：多 active 跨越较大 Z 范围时，因宏观相机距离、**P11.1** 非目标 active 的 alpha 渐变等，部分 distant active 在屏幕上的**投影尺度与对比**可能不如用户直觉中的「每颗星都同样醒目」。**A.5.1.3 决策**：本阶段**不**立项修复人名模式下 active 球体「屏幕大小不可读」类问题（工程量与方案优雅性权衡，**保留现状**）。
