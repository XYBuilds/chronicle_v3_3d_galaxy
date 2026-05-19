# Phase 29 — 发布门槛与技术判定（Spec SSOT）

> **状态**：P29.0 已建立本文档与 Tech / Design Spec 交叉引用；**§4（29.1）** 已锁定 HDR 支持矩阵；**§7（29.2）** 已锁定 HDR capability probe 设计与运行时模块；§29.3–§29.7 中其余标记 **待填** 的表格与结论由后续 TODO 补全。  
> **计划**：`.cursor/plans/phase_29_release_gates_technical_decision.plan.md`  
> **下游**：Phase 30（路由产品化）、Phase 32（SDR 可读性）、Phase 33（HDR 生产，**条件阶段**）、Phase 34（社交预览）。

---

## 1. 目标与范围

Phase 29 **不**交付完整深链产品化或 HDR 生产管线，而是判清两类发布门槛：

1. **HDR**：当前栈能否在目标环境产生**真实扩展亮度**（非「SDR 画得更亮」、非 Bloom 伪 HDR）。
2. **深链**：`/movie/:id`、`/today` 在静态托管下是否有**安全落地路径**（契约 + rewrite 预检）。

### 1.1 本 Phase 要做

- 建立 HDR 支持矩阵、capability probe 设计、最小 proof 方法与 SDR 降级策略（文档 + 可选探测代码见 29.2+）。
- 锁定 Phase 30 路由契约与静态部署 rewrite 方案（预检结论写入 §5、§6）。
- 输出 Phase 33 go/no-go 前置条件（§7 待 29.7 汇总）。

### 1.2 本 Phase 不做

- 不实现完整 `/movie/:id`、`/today` 路由与 Drawer 分享迁移（Phase 30）。
- 不默认开启 Bloom；不把 SDR 提亮当作 HDR 验收（Phase 32 负责 SDR 可读性标定）。
- 不承诺每部电影独立 OG 卡片（Phase 34）。

---

## 2. 已锁定决策（P29.0）

| ID     | 决策                 | 说明                                                                                                                                                                                  |
| :----- | :------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1** | **HDR 定义**         | 「真实 HDR 输出」= 在 HDR 显示器 + 系统 HDR 开启 + 浏览器/画布链路支持时，**高光可超过 SDR 参考白**且可复现；**不等于** `uLMax` 调高、Bloom、或 emissive 在 SDR  framebuffer 内变亮。 |
| **D2** | **当前生产色彩语义** | `WebGLRenderer.outputColorSpace = THREE.SRGBColorSpace`（`scene.ts`）；全星系为 **SDR WebGL** 主路径。                                                                                |
| **D3** | **Bloom 与 HDR**     | `UnrealBloomPass` **生产默认关闭**（`postFxBloomEnabled = false`）；`window.__bloom` 仅调试。Bloom **不得**作为 HDR 验收或发布门槛。                                                  |
| **D4** | **Phase 33 门禁**    | 仅当 §29.3 proof 在 **D5 矩阵** 的目标组合上稳定满足 D1 时，才进入 Phase 33 HDR production；否则保留 capability 结论 + SDR-only（见 Phase 33 plan）。                                 |
| **D5** | **路由实现形态**     | Phase 30 **不**引入 React Router；采用**轻量手写** path parser + `history.pushState` / `popstate`（见 §5）。                                                                          |
| **D6** | **选中态 SSOT**      | 影片 focus 的 store 字段为 `galaxyInteractionStore.selectedMovieId`；Today/Cover 为 `coverModeStore`（`coverMode`、`todayMovieId`）。                                                 |
| **D7** | **Query 保留**       | path 更新时**必须保留**现有 query：`lang`、`theme`、`timeline`（及未来仅追加、不破坏的 query）；实现细节归 Phase 30。                                                                 |
| **D8** | **静态资源豁免**     | SPA fallback **不得** rewrite：`/data/*`、`/fonts/*`、Vite 构建 assets、favicon、manifest、icons、robots、sitemap 等（§6）。                                                          |
| **D9** | **Today SSOT**       | 当日影片 ID 以 `today.json`（manifest `today_url`）解析为准，`loadToday.ts` / `coverModeStore`；`/today` 深链语义见 §5.3。                                                            |

---

## 3. 现状基线（代码锚点）

| 领域         | 现状                                       | 锚点                                                                                       |
| :----------- | :----------------------------------------- | :----------------------------------------------------------------------------------------- |
| 渲染输出     | SDR sRGB；WebGL2 硬前置                    | `frontend/src/three/scene.ts`                                                              |
| Bloom        | 构造存在，生产 loop 默认 `renderer.render` | `scene.ts` · `postFxBloomEnabled` · `window.__bloom`                                       |
| 路由         | **无** path 路由；仅 query hooks           | `App.tsx` · `useLocaleFromQuery` · `useThemeFromQuery` · `useTimelineOrientationFromQuery` |
| 分享         | Today HUD 分享**站点根路径**               | `ShareMovieTodayButton.tsx`                                                                |
| Drawer       | **无**影片深链分享区                       | `Drawer.tsx`                                                                               |
| 静态 headers | `_headers` 设 cache，**无** SPA rewrite    | `frontend/public/_headers`                                                                 |
| 部署 rewrite | 仓库内**无** `vercel.json` / `_redirects`  | —                                                                                          |
| Base path    | `import.meta.env.BASE_URL`                 | `loadGalaxyData.ts` · `galaxyAssetUrls.ts`                                                 |

---

## 4. HDR 支持矩阵（§29.1 — P29.1 已锁定）

**负责人**：TODO 29.1 · `p29-hdr-matrix` · 实施报告见 [`docs/reports/Phase 29.1 P29.1 HDR 支持矩阵 实施报告.md`](../reports/Phase%2029.1%20P29.1%20HDR%20支持矩阵%20实施报告.md)

### 4.1 判定语义（D1 对齐）

| 判定               | 含义                                                                                                                 | 与 Phase 33 关系                                                          |
| :----------------- | :------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **`supported`**    | 平台链路**具备**交付真实扩展亮度的技术前提；须在 **§29.3 proof** 中逐组合验证像素级结论后，方可标为发布门槛 **通过** | 可纳入 **D4** 目标组合；proof 失败则降为 `experimental` 或 `fallback-sdr` |
| **`experimental`** | API/驱动存在但**不稳定**、需实验 flag、或**尚未**与 Three.js WebGL2 主路径集成；仅作 capability 记录与 lab proof     | **不**作为普通用户发布门槛                                                |
| **`fallback-sdr`** | **必须**走现有 SDR 主路径（D2：`SRGBColorSpace` + WebGL2）；非缺陷，为默认与降级语义                                 | Phase 33 **不**要求 HDR；与 §9 一致                                       |
| **`blocked`**      | 该组合在平台语义下**不可能**产生真实 HDR 输出（如 OS HDR 关、SDR 屏、或 API 无 extended tone mapping）               | 禁止标为 HDR 能力；probe 应明确 `recommendedMode: sdr`                    |

**硬排除（任何组合均不适用 D1）**：

- 仅调高 `uLMax` / emissive / Bloom（D3）而无 extended 画布输出。
- OS HDR **关** 或 SDR 显示器——即使浏览器报告「HDR 可用」也记 `blocked` 或 `fallback-sdr`。
- WebGL2 + `THREE.SRGBColorSpace` **单独**作为 HDR 路径——记 `fallback-sdr`（当前生产）。

### 4.2 渲染 API 分层（与现状基线）

| API                                     | 当前代码              | HDR 输出潜力（平台，2026-Q2）                                                                                     | 矩阵默认判定                                      |
| :-------------------------------------- | :-------------------- | :---------------------------------------------------------------------------------------------------------------- | :------------------------------------------------ |
| **WebGL2 + Three.js**                   | `scene.ts` 生产主路径 | 绘制缓冲与 swapchain 通常为 **SDR clamp**；W3C WebGL HDR tone mapping **未**在稳定版全面落地                      | **`fallback-sdr`**                                |
| **WebGPU `toneMapping.mode: extended`** | 未接入                | Chrome ≥129、Edge（Chromium）、Safari（WebKit 已合入，部分环境需 flag）在 **OS HDR on + HDR 屏** 下可解锁扩展范围 | **`experimental`** → proof 通过后升为 `supported` |
| **Canvas 2D HDR / `targetHDRHeadroom`** | 未使用                | 标准与实现仍在 Color on the Web CG；**无**稳定跨浏览器承诺                                                        | **`experimental`**（仅 lab，不进发布门槛）        |

### 4.3 组合矩阵（平台能力预分类）

下表为 **29.1 锁定的能力预分类**；**§29.3** 须在标有 ★ 的行上完成像素 proof 后方可将 `supported` 生效为 Phase 33 门禁。

|   #   | OS                        | Browser            | Rendering API                | Display     | 预分类                     | 说明                                                                                                     |
| :---: | :------------------------ | :----------------- | :--------------------------- | :---------- | :------------------------- | :------------------------------------------------------------------------------------------------------- |
|   1   | Win11 **HDR on**          | Chrome **stable**  | WebGPU `extended`            | HDR         | **`experimental`** ★       | Phase 33 **首选 proof** 组合；须 `navigator.gpu` + `configure({ toneMapping: { mode: "extended" } })`    |
|   2   | Win11 **HDR on**          | Edge **stable**    | WebGPU `extended`            | HDR         | **`experimental`** ★       | 与 #1 同 Chromium 栈；proof 可与 #1 抽样其一或双验                                                       |
|   3   | macOS **HDR on**          | Safari **stable**  | WebGPU `extended`            | XDR / HDR   | **`experimental`** ★       | WebKit 已合入 HDR canvas；部分版本/预览版需 **Canvas Color Types** 等 flag——proof 时须记录 build 与 flag |
|   4   | Win11 **HDR on**          | Chrome stable      | WebGL2 + `SRGBColorSpace`    | HDR         | **`fallback-sdr`**         | 当前生产栈；**不能**作为 HDR 发布路径                                                                    |
|   5   | macOS HDR on              | Safari stable      | WebGL2 + `SRGBColorSpace`    | XDR         | **`fallback-sdr`**         | 同 #4                                                                                                    |
|   6   | Win11 / macOS **HDR off** | 任意 stable        | 任意                         | HDR 屏      | **`blocked`**              | OS 未向合成器交付 HDR；浏览器无法单独突破                                                                |
|   7   | 任意                      | 任意 stable        | 任意                         | **SDR 屏**  | **`blocked`**              | 无扩展亮度物理通道；一律 SDR                                                                             |
|   8   | 任意                      | **Firefox** stable | WebGPU / WebGL2              | HDR + OS on | **`experimental`**         | WebGPU HDR 跟进中；**不**进首发发布门槛，仅 capability 记录                                              |
|   9   | 任意                      | Chrome stable      | WebGPU `extended`            | HDR         | **`experimental`**（flag） | 若 proof **仅**在 `#enable-unsafe-webgpu` 等 flag 下成立 → 永久 **`experimental`**，不进 D4              |
|  10   | 任意                      | 任意               | Canvas 2D HDR / headroom API | HDR         | **`experimental`**         | 与 Three 主路径无关；仅 §29.3 lab                                                                        |
|  11   | 任意                      | 任意               | WebGL2 + Bloom on            | 任意        | **`blocked`**              | D3：Bloom **不是** HDR；不得用于验收                                                                     |
|  12   | 任意                      | 任意               | SDR 提亮（`uLMax` 等）       | 任意        | **`blocked`**              | D1：非真实 HDR                                                                                           |

### 4.4 发布门槛组合（D4 / Phase 33 目标）

**须满足 §29.3 proof 的候选发布门槛**（三选二或全验，由 29.3 记录实测稳定性）：

| 优先级 | 组合 ID | 用途                                          |
| :----- | :------ | :-------------------------------------------- |
| **P0** | #1      | Windows 桌面主受众 + Chromium WebGPU extended |
| **P0** | #2      | 与 #1 同引擎；企业/Edge 用户抽样              |
| **P1** | #3      | Apple 桌面 / XDR 受众                         |

**不在发布门槛内、但必须支持的组合**（SDR 无回归，§29.4）：

- 所有 **`fallback-sdr`** 行（含 #4–#5 及当前生产默认）。
- **`blocked`** 行：行为 = 明确 SDR，**不得**黑屏或强开 Bloom。

### 4.5 仅实验、不进发布门槛

| 组合 / 能力                    | 处理                                                          |
| :----------------------------- | :------------------------------------------------------------ |
| #8 Firefox                     | 文档 + probe 记录；不承诺用户可见 HDR                         |
| #9 仅 flag 可用的 WebGPU       | 记入 §8 proof「失败/实验」；不进入 Phase 33                   |
| #10 Canvas 2D HDR              | lab / Storybook 可选；不接入默认 galaxy                       |
| #11 Bloom                      | 保持 `postFxBloomEnabled = false`；调试 `window.__bloom` only |
| 任何 **WebGL2-only**「伪 HDR」 | 禁止作为产品能力宣传                                          |

### 4.6 对 29.2 / 29.3 的输入

| 下游 TODO      | 本矩阵要求                                                                                                                               |
| :------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **29.2 probe** | 输出须能映射到 §4.3 行号：`osHdr`, `browser`, `apiPath`, `displayHdr`, `matrixRow`, `verdictPre`, `meetsTargetMatrix`（对照 §4.4 P0/P1） |
| **29.3 proof** | 在 ★ 行上对比 **SDR reference white** vs **HDR candidate**；若 candidate 与 reference 被同一 clamp → 该行 **不得** 升为 `supported`      |
| **29.7 gate**  | 若 P0 无一稳定 `supported` → **No-go Phase 33**，保留 probe + 本矩阵                                                                     |

---

## 5. 深链路由契约（§29.5 — P29.0 锁定，Phase 30 实现）

### 5.1 Path 契约

| Path         | 语义         | 数据 ready 后行为                                                                                               |
| :----------- | :----------- | :-------------------------------------------------------------------------------------------------------------- |
| `/`          | Cover / Home | 与现网一致：Cover 今日星或已进入宏观浏览                                                                        |
| `/movie/:id` | 单片深链     | `selectedMovieId = id`；打开 Drawer；Three focus 飞入                                                           |
| `/today`     | 今日影片入口 | 解析 `todayMovieId`；进入 Today/Cover 体验；自 Cover 进入 focus 时 URL **迁移**为 `/movie/:id`（Phase 30 细则） |

- `:id` 为 TMDB `Movie.id`（数字）；非法 / 不存在 ID：**不**白屏——降级为 `/` 或仅打开宏观并提示（Phase 30 选一种并写入测试矩阵）。
- Path 前缀须尊重 `import.meta.env.BASE_URL`（GitHub Pages 子路径部署）。

### 5.2 URL ↔ Store 同步

| 方向        | 规则                                                                                                                  |
| :---------- | :-------------------------------------------------------------------------------------------------------------------- |
| URL → state | 解析 path → 待 `galaxyData` **ready** 后写入 `selectedMovieId` / cover 相关 store                                     |
| state → URL | 用户点击星体、搜索选中 focus、Drawer close、ESC、Focus exit、Today cover→focus 等动作更新 path（Phase 30 枚举完整表） |
| **D7**      | 任意 `pushState` / `replaceState` **保留** `lang`、`theme`、`timeline` query                                          |

### 5.3 ESC / Back / Forward 优先级（与 Design Spec §4.6 对齐）

1. 搜索框 blur（不改 URL path）
2. Drawer 关闭（若 path 为 `/movie/:id`，Phase 30 定义是否退回 `/` 或保留 path）
3. `selectedMovieId` 清空（focus 退出）
4. `searchMode !== 'idle'` 清空 select 会话

`popstate`：按历史条目恢复 path 解析结果，**禁止**与 ESC 栈冲突的双写（Phase 30 实现时单测覆盖）。

### 5.4 Today SSOT

- 运行时：`resolveTodayMovieId` / `loadToday.ts` + manifest `today_url`。
- `/today` **不**替代 `today.json` 为数据源；仅深链入口语义。

---

## 6. 静态部署 rewrite 预检（§29.6 — P29.0 基线结论）

### 6.1 当前结论

| 项                | 结论                                                                                      |
| :---------------- | :---------------------------------------------------------------------------------------- |
| SPA fallback 配置 | **缺失**；深链刷新 `/movie/123` 在纯静态托管下**将 404**（除非平台默认 SPA 或人工补规则） |
| 已有 `_headers`   | 仅 Cache-Control / Content-Type；**不**处理路由                                           |
| 主部署            | Cloudflare Pages Direct Upload + R2 数据（Tech Spec §5.2）                                |
| 备线              | GitHub Pages（`VITE_BASE_PATH` 可能非 `/`）                                               |

### 6.2 Phase 30 须落地的 rewrite 原则（**D8**）

1. **Fallback**：`/movie/*`、`/today`（及必要时其余 app 路径）→ `index.html`（或带 `BASE_URL` 前缀的等价路径）。
2. **排除**（必须仍返回静态实体文件）：
   - `/data/*`（含 `galaxy_assets_manifest.json`、`today.json`、`og-today.png`）
   - `/fonts/*`
   - 构建产物 assets（`assets/*`）
   - 根级 `favicon`、`manifest`、`icons`、`robots.txt`、`sitemap.xml` 等
3. **验证**：本地 `vite preview` + 生产预览 URL 上对深链 **刷新**、**Back/Forward**、**query 保留** 做矩阵测试（Phase 30.8）。

### 6.3 配置载体（待 Phase 30 择一）

- Cloudflare Pages：`_redirects` 或 Dashboard **Redirects** / `functions`（若已有 `_middleware.js` 仅管域名，不替代 SPA fallback）
- GitHub Pages：`404.html` 复制 `index.html` 技巧或 Actions 侧文档
- Vercel（若启用）：`vercel.json` `rewrites`

**P29.0 不在此提交 rewrite 文件**；仅锁定原则供 Phase 30.7 实施。

---

## 7. HDR capability probe（§29.2 — P29.2 已锁定）

**负责人**：TODO 29.2 · `p29-hdr-probe-design` · 实施报告见 [`docs/reports/Phase 29.2 P29.2 HDR capability probe 实施报告.md`](../reports/Phase%2029.2%20P29.2%20HDR%20capability%20probe%20实施报告.md)

### 7.1 模块与挂载点

| 项 | 约定 |
| :--- | :--- |
| **模块** | `frontend/src/lib/hdrCapabilities.ts`（纯探测 + 矩阵映射；不修改 renderer 色彩语义） |
| **挂载** | `createGalaxyScene` 在 WebGL2 硬校验通过后、`createGalaxyDualMeshes` 之前调用 `createHdrCapabilitiesDebug(renderer)` |
| **日志** | 启动时 `console.log('[hdrCapabilities]', report)`；WebGPU extended 异步探测完成后**再 log 一次** |
| **调试** | `window.__hdrCapabilities`：`report`、`log()`、`refreshWebGpu()` |

### 7.2 报告字段（`HdrCapabilitiesReport`）

| 字段 | 来源 / 语义 |
| :--- | :--- |
| `webgl2` | `renderer.capabilities.isWebGL2`（生产硬前置） |
| `outputColorSpace` | Three `renderer.outputColorSpace` 标签（当前恒为 `srgb`） |
| `dynamicRangeHigh` | `matchMedia('(dynamic-range: high)')` |
| `colorGamut` | `screen.colorGamut`（无则 `unknown`） |
| `canvasHdrSupported` | `dynamicRangeHigh` **或** 宽色域（非 `srgb`）— **显示器能力提示**，非 OS HDR 开关 |
| `webgpuAvailable` | `'gpu' in navigator` |
| `webgpuExtendedToneMapping` | 离屏 canvas `configure({ toneMapping: { mode: 'extended' } })`；初值 `pending` / 无 API 为 `unsupported` |
| `browser` | UA → `chrome` \| `edge` \| `safari` \| `firefox` \| `other` |
| `os` | UA → `windows` \| `macos` \| … |
| `osHdr` | **恒 `unknown`**（Web 平台不可可靠读取；人工验收时补记） |
| `displayHdr` | `dynamicRangeHigh` → `hdr`，否则 `sdr` |
| `apiPath` | 生产路径恒 `webgl2-srgb`；若 extended 探测成功，矩阵映射用 `webgpu-extended` |
| `matrixRow` | `resolveMatrixRow()` → §4.3 行号（1–12）或 `null` |
| `verdictPre` | `deriveVerdictPre()` → §4.1 预分类 |
| `meetsTargetMatrix` | `matrixRow ∈ {1,2,3}` **且** `webgpuExtendedToneMapping === true` |
| `recommendedMode` | 生产恒 `sdr`；P0/P1 候选且 extended 成功 → `hdr-capable`；未来 extended 主路径 → `hdr-active` |

### 7.3 矩阵映射规则（摘要）

- **SDR 屏**（`displayHdr === 'sdr'`）→ 行 **#7**，`verdictPre: blocked`，`recommendedMode: sdr`。
- **WebGL2 + sRGB**（当前生产）→ 行 **#4 / #5**，`fallback-sdr`。
- **WebGPU extended 成功** + HDR 屏 + Win Chrome/Edge / macOS Safari → 行 **#1–#3**，`experimental`，`meetsTargetMatrix: true`。
- **Bloom 开**（仅调试）→ 行 **#11**，`blocked`（D3）。

单元测试：`frontend/src/lib/hdrCapabilities.spec.ts`（纯函数矩阵映射）。

### 7.4 限制与下游

| 限制 | 说明 |
| :--- | :--- |
| **非 proof** | probe **不能**证明像素超过 SDR 参考白；§29.3 须独立受控 patch |
| **OS HDR** | 浏览器不暴露；矩阵行 #6（OS HDR off）须人工记录，probe 无法自动区分 |
| **生产输出** | Phase 29 **不**切换 `outputColorSpace` 或 WebGPU 主渲染器 |

§29.3 建议调试入口：`window.__hdrProbe`（待实现）；可复用 `__hdrCapabilities.refreshWebGpu()` 做能力复测。

---

## 8. 最小 HDR proof（§29.3 — 方法契约）

**负责人**：TODO 29.3 · `p29-hdr-proof`

- 受控 test patch（**不**混入默认 galaxy shader）：同屏 **SDR reference white** vs **HDR candidate highlight**。
- 调试入口建议：`window.__hdrProbe` 或 Storybook lab。
- **通过**：HDR 开 + 支持组合下 candidate **可测/可见**地超过 SDR 参考白；**不**被同一 clamp/tone map 压成相同亮度。
- **失败**：仅实验 flag、不可复现、或仅 SDR 变亮 → 记 `experimental` 或 `fallback-sdr`，**不**进 Phase 33 发布门槛。

证据：截图、probe 日志、可选仪器/照片（待 29.3 记录）。

---

## 9. SDR fallback 策略（§29.4 — 策略契约）

**负责人**：TODO 29.4 · `p29-sdr-fallback`

| 条件                         | 行为                                                                           |
| :--------------------------- | :----------------------------------------------------------------------------- |
| HDR 关 / 不支持 / 用户未启用 | 保持 **现有 SDR 主路径**（D2）；`outputColorSpace` 不变                        |
| 禁止                         | 黑屏、色偏、过曝、**默认开启 Bloom**                                           |
| 视觉参数                     | **不**在 Phase 29 回写 `galaxyMeshes` / `galaxyUniformDefaults`（归 Phase 32） |

---

## 10. Phase 29 Gate report（§29.7 — 待填）

**负责人**：TODO 29.7 · `p29-gate-report`

汇总后须明确：

- [ ] 是否进入 **Phase 33** HDR production
- [ ] 若不进入，probe + 技术结论如何保留（console / debug UI / 文档）
- [ ] **Phase 30** 实施前置是否满足（§5 + §6）
- [ ] 转入 Phase 32 / 34 / backlog 的风险项

**Go / No-go 结论**：_TBD（29.7）_

---

## 11. 交付物清单

| 交付物                      | 章节 | 状态                            |
| :-------------------------- | :--- | :------------------------------ |
| HDR support matrix          | §4   | **P29.1 已锁定**                |
| HDR probe 设计              | §7   | **P29.2 已锁定**（含运行时模块） |
| HDR proof 记录              | §8   | 待 29.3                         |
| SDR fallback 说明           | §9   | 契约已写，验收待 29.4           |
| Phase 30 路由契约           | §5   | **P29.0 已锁定**                |
| Static hosting rewrite 方案 | §6   | **P29.0 预检已写**，配置待 30.7 |
| Phase 33 go/no-go           | §10  | 待 29.7                         |
