# Phase 29 — 发布门槛与技术判定（Spec SSOT）

> **状态**：P29.0 已建立本文档与 Tech / Design Spec 交叉引用；§29.1–§29.7 中标记 **待填** 的表格与结论由后续 TODO（29.1–29.7）补全。  
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

| ID | 决策 | 说明 |
| :--- | :--- | :--- |
| **D1** | **HDR 定义** | 「真实 HDR 输出」= 在 HDR 显示器 + 系统 HDR 开启 + 浏览器/画布链路支持时，**高光可超过 SDR 参考白**且可复现；**不等于** `uLMax` 调高、Bloom、或 emissive 在 SDR  framebuffer 内变亮。 |
| **D2** | **当前生产色彩语义** | `WebGLRenderer.outputColorSpace = THREE.SRGBColorSpace`（`scene.ts`）；全星系为 **SDR WebGL** 主路径。 |
| **D3** | **Bloom 与 HDR** | `UnrealBloomPass` **生产默认关闭**（`postFxBloomEnabled = false`）；`window.__bloom` 仅调试。Bloom **不得**作为 HDR 验收或发布门槛。 |
| **D4** | **Phase 33 门禁** | 仅当 §29.3 proof 在 **D5 矩阵** 的目标组合上稳定满足 D1 时，才进入 Phase 33 HDR production；否则保留 capability 结论 + SDR-only（见 Phase 33 plan）。 |
| **D5** | **路由实现形态** | Phase 30 **不**引入 React Router；采用**轻量手写** path parser + `history.pushState` / `popstate`（见 §5）。 |
| **D6** | **选中态 SSOT** | 影片 focus 的 store 字段为 `galaxyInteractionStore.selectedMovieId`；Today/Cover 为 `coverModeStore`（`coverMode`、`todayMovieId`）。 |
| **D7** | **Query 保留** | path 更新时**必须保留**现有 query：`lang`、`theme`、`timeline`（及未来仅追加、不破坏的 query）；实现细节归 Phase 30。 |
| **D8** | **静态资源豁免** | SPA fallback **不得** rewrite：`/data/*`、`/fonts/*`、Vite 构建 assets、favicon、manifest、icons、robots、sitemap 等（§6）。 |
| **D9** | **Today SSOT** | 当日影片 ID 以 `today.json`（manifest `today_url`）解析为准，`loadToday.ts` / `coverModeStore`；`/today` 深链语义见 §5.3。 |

---

## 3. 现状基线（代码锚点）

| 领域 | 现状 | 锚点 |
| :--- | :--- | :--- |
| 渲染输出 | SDR sRGB；WebGL2 硬前置 | `frontend/src/three/scene.ts` |
| Bloom | 构造存在，生产 loop 默认 `renderer.render` | `scene.ts` · `postFxBloomEnabled` · `window.__bloom` |
| 路由 | **无** path 路由；仅 query hooks | `App.tsx` · `useLocaleFromQuery` · `useThemeFromQuery` · `useTimelineOrientationFromQuery` |
| 分享 | Today HUD 分享**站点根路径** | `ShareMovieTodayButton.tsx` |
| Drawer | **无**影片深链分享区 | `Drawer.tsx` |
| 静态 headers | `_headers` 设 cache，**无** SPA rewrite | `frontend/public/_headers` |
| 部署 rewrite | 仓库内**无** `vercel.json` / `_redirects` | — |
| Base path | `import.meta.env.BASE_URL` | `loadGalaxyData.ts` · `galaxyAssetUrls.ts` |

---

## 4. HDR 支持矩阵（§29.1 — 待填）

**负责人**：TODO 29.1 · `p29-hdr-matrix`

建议字段（验收时逐格填写）：

| 维度 | 取值示例 |
| :--- | :--- |
| OS | Windows HDR on/off；macOS HDR on/off |
| Browser | Chrome / Edge / Safari 稳定版（实验 flag 单独标注） |
| Rendering API | WebGL2（当前）；canvas HDR API；WebGPU proof（可选） |
| Display | HDR 显示器 / 普通 SDR |
| 判定 | `supported` / `experimental` / `fallback-sdr` / `blocked` |

**发布门槛组合**（待 29.1 勾选）：_TBD_

**仅实验、不进发布门槛的组合**：_TBD_

---

## 5. 深链路由契约（§29.5 — P29.0 锁定，Phase 30 实现）

### 5.1 Path 契约

| Path | 语义 | 数据 ready 后行为 |
| :--- | :--- | :--- |
| `/` | Cover / Home | 与现网一致：Cover 今日星或已进入宏观浏览 |
| `/movie/:id` | 单片深链 | `selectedMovieId = id`；打开 Drawer；Three focus 飞入 |
| `/today` | 今日影片入口 | 解析 `todayMovieId`；进入 Today/Cover 体验；自 Cover 进入 focus 时 URL **迁移**为 `/movie/:id`（Phase 30 细则） |

- `:id` 为 TMDB `Movie.id`（数字）；非法 / 不存在 ID：**不**白屏——降级为 `/` 或仅打开宏观并提示（Phase 30 选一种并写入测试矩阵）。
- Path 前缀须尊重 `import.meta.env.BASE_URL`（GitHub Pages 子路径部署）。

### 5.2 URL ↔ Store 同步

| 方向 | 规则 |
| :--- | :--- |
| URL → state | 解析 path → 待 `galaxyData` **ready** 后写入 `selectedMovieId` / cover 相关 store |
| state → URL | 用户点击星体、搜索选中 focus、Drawer close、ESC、Focus exit、Today cover→focus 等动作更新 path（Phase 30 枚举完整表） |
| **D7** | 任意 `pushState` / `replaceState` **保留** `lang`、`theme`、`timeline` query |

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

| 项 | 结论 |
| :--- | :--- |
| SPA fallback 配置 | **缺失**；深链刷新 `/movie/123` 在纯静态托管下**将 404**（除非平台默认 SPA 或人工补规则） |
| 已有 `_headers` | 仅 Cache-Control / Content-Type；**不**处理路由 |
| 主部署 | Cloudflare Pages Direct Upload + R2 数据（Tech Spec §5.2） |
| 备线 | GitHub Pages（`VITE_BASE_PATH` 可能非 `/`） |

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

## 7. HDR capability probe（§29.2 — 设计契约）

**负责人**：TODO 29.2 · `p29-hdr-probe-design`

建议模块：`frontend/src/lib/hdrCapabilities.ts` 或 `frontend/src/three/hdrCapabilities.ts`。

初始化 renderer 后记录（`console.log` 符合项目状态可见性规则）：

| 字段 | 用途 |
| :--- | :--- |
| `webgl2` | `renderer.capabilities.isWebGL2` |
| `outputColorSpace` | 当前 Three 输出色彩空间名 |
| `canvasHdrSupported` | 是否存在可用 HDR canvas / 色域 API（待 29.2 细化探测 API） |
| `webgpuAvailable` | 可选 proof 路径 |
| `meetsTargetMatrix` | 对照 §4 矩阵 |
| `recommendedMode` | `sdr` / `hdr-capable` / `hdr-active`（命名与 Phase 33 对齐） |

**限制**：probe 只报告能力，**不能**替代 §29.3 像素级 proof。

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

| 条件 | 行为 |
| :--- | :--- |
| HDR 关 / 不支持 / 用户未启用 | 保持 **现有 SDR 主路径**（D2）；`outputColorSpace` 不变 |
| 禁止 | 黑屏、色偏、过曝、**默认开启 Bloom** |
| 视觉参数 | **不**在 Phase 29 回写 `galaxyMeshes` / `galaxyUniformDefaults`（归 Phase 32） |

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

| 交付物 | 章节 | 状态 |
| :--- | :--- | :--- |
| HDR support matrix | §4 | 待 29.1 |
| HDR probe 设计 | §7 | 待 29.2 |
| HDR proof 记录 | §8 | 待 29.3 |
| SDR fallback 说明 | §9 | 契约已写，验收待 29.4 |
| Phase 30 路由契约 | §5 | **P29.0 已锁定** |
| Static hosting rewrite 方案 | §6 | **P29.0 预检已写**，配置待 30.7 |
| Phase 33 go/no-go | §10 | 待 29.7 |
