# Phase 26.1 — Mac 色彩修复与阶段收口（最终实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 26（设备与空间感优化）子项 **P26.1** |
| 计划来源 | `.cursor/plans/phase_26_device_spatial_optimization.plan.md` §「P26.1 HDR / 色彩验证矩阵」 |
| 报告性质 | **最终决策 + 已执行操作** 归档；本阶段 **不做** 原计划中的跨设备 HDR 矩阵「验收」 |

---

## 1. 背景与计划差异

原计划 P26.1 侧重：在 Mac / Windows、HDR 开/关、多浏览器下建立对比矩阵，区分偏色来自 CSS token、WebGL sRGB、系统 HDR 或显示链路，并辅以临时 QA 工具（浮层色卡、`readPixels`、URL 固定「今日」影片等）。

实际执行中得出以下结论，**与计划中的「矩阵验收」路径脱钩**：

- **Mac 上 idle/active 星点色相异常**已在渲染路径上**修复并验证通过**（与 Windows 观感对齐），根因与「HDR 内容管线」无关。
- 当前产品 **不存在 HDR 显示/色调映射专用管线**（仍为常规 SDR WebGL + `THREE.SRGBColorSpace` 等既有约定）。**HDR 能力**可作为未来增强项单独立项；**本阶段不对 HDR 矩阵做正式验收**。
- 为减少长期维护面与误用风险，**本阶段临时验证工具已全部从仓库移除**（见 §5）。

---

## 2. 最终决策（摘要）

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **Mac 偏色问题按已修复状态收口** | 修复手段为 shader 侧对线性 sRGB 的 gamut 钳制，避免 NaN 在 Metal/ANGLE 上污染混色（§3）。 |
| D2 | **本阶段不开展 P26.1 原计划中的跨设备 HDR 色彩矩阵验收** | 与 HDR 管线缺失（D3）及问题已收敛（D1）一致；不再要求按矩阵表逐项签字。 |
| D3 | **HDR 不作为本阶段交付物** | 记录为技术债/未来方向；若上线 HDR，需另列：输出色彩空间、合成与 HUD、测试矩阵与回退策略。 |
| D4 | **移除 P26.1 专用 QA 工具链** | 含浮层、`p26ColorAudit` / `p26Today` 等 query、WebGL canvas 标记、关联单测与独立测试指南（§5）。 |
| D5 | **保留生产级渲染修复与相关注释** | `galaxyIdle` / `galaxyActive` 顶点着色器及实例属性打包逻辑保留，作为 SSOT 级实现记录（§4）。 |

---

## 3. 根因与修复（技术结论）

### 3.1 现象

在 **macOS**（Safari / Chrome，底层常见为 **Metal / ANGLE-Metal**）上，**idle / active** 星系粒子出现**色相错乱或失效**；在 **Windows（D3D11 等）** 上同一数据表现正常或差异不明显。

### 3.2 根因

色球管线中由 **OKLab（L, a, b）→ 线性 sRGB** 的转换，在部分色相/彩度组合下会产生 **负的线性 RGB 分量**。后续对线性分量做 **gamma 编码**（`pow` 等）时，在 **GLSL ES 3.0** 中对负底数行为为 **未定义**：

- **Metal / ANGLE-Metal** 路径上易产生 **NaN**，经 `mix` 等传播，表现为 Mac 上星点色相整体异常。
- **部分 Windows 驱动路径**可能对 `pow` 负底数静默处理为 0，从而**掩盖**问题。

### 3.3 修复

在 **gamma 编码之前**，对 `oklab_to_linear_srgb` 的输出做 **线性 sRGB gamut 钳制**到 `[0, 1]`，保证进入 `pow` 的通道非负、有定义行为。

实现位置（顶点着色器，idle / active 各一份，逻辑镜像）：

- `frontend/src/three/shaders/galaxyIdle.vert.glsl`
- `frontend/src/three/shaders/galaxyActive.vert.glsl`

（片段着色器中 Perlin 路径已有类似钳制策略的，在注释中与本次修复互文。）

### 3.4 实例数据布局（相关但非根因）

`frontend/src/three/galaxyMeshes.ts` 将每实例 `(hue, voteNorm, size, pad)` 打包为 **vec4 / 16-byte stride**，注释中说明：有利于 **Apple Metal / ANGLE-Metal** 的对齐习惯；并明确 **Mac 色相 bug 的根因是 OKLab→sRGB 未钳位**，而非该打包本身。

### 3.5 诊断过程（审计记录）

以下手段用于在修复前**收敛根因**，相关临时调试代码**均已移除**，仅保留文字记录：

- 曾将顶点输出临时改为「可视化 raw hue / 中间量」、在 `scene.ts` 侧暴露 buffer 转储等，用于确认：**CPU 写入的 hue 缓冲与预期一致**，问题不在实例 buffer 上传路径。
- 对比 **Perlin**（fragment 路径在 gamma 前已有 gamut 钳制）与 **galaxy 顶点着色器**（原先缺少对 `oklab_to_linear_srgb` 输出的钳制）的差异，将修复收敛为 **gamma 编码前对线性 sRGB 做 clamp**。
- 着色器注释中曾使用反引号包裹 GLSL 标识符，触发 `vite-plugin-glsl` / 预处理与模板字符串的冲突；已改为**无反引号**的注释写法（以当前 `galaxy*.vert.glsl` 为准）。

---

## 4. 保留的代码与文档（生产 SSOT）

| 路径 | 状态 |
| --- | --- |
| `frontend/src/three/shaders/galaxyIdle.vert.glsl` | **保留** — 含 P26.1 钳制与根因注释 |
| `frontend/src/three/shaders/galaxyActive.vert.glsl` | **保留** — 同上 |
| `frontend/src/three/galaxyMeshes.ts` | **保留** — vec4 实例属性与说明性注释 |
| `frontend/src/three/scene.ts` | **保留** — `renderer.outputColorSpace = THREE.SRGBColorSpace`（既有 SDR 路径事实，非 HDR 管线） |

---

## 5. 本阶段已移除内容（验证工具与附属文档）

以下项**已从仓库删除或还原**，不再对外提供：

| 类别 | 内容 |
| --- | --- |
| React | `frontend/src/hud/P26ColorAuditPanel.tsx` |
| Hook | `frontend/src/hooks/useP26ColorAuditFromQuery.ts` |
| 工具库 + 测试 | `frontend/src/lib/p26TodayMovieOverride.ts`、`p26TodayMovieOverride.spec.ts` |
| `App.tsx` | `p26ColorAudit` 浮层挂载；`todayMovieId` / `p26Today` 对 `resolveTodayMovieId` 的 query 覆盖；相关 `import` |
| `scene.ts` | WebGL canvas 上的 `data-galaxy-webgl` 属性（仅服务于 QA `readPixels`） |
| 文档 | `docs/guides/P26.1 HDR 与色彩验证测试指南.md`（依赖已删除工具，一并移除） |

**不再支持的 query（若书签中有请删除）**：`p26ColorAudit`、`p26Today`；以及曾用于矩阵的 **`?todayMovieId=` / `?p26Today=` 对 Cover「今日」影片的 URL 覆盖**（现已恢复为仅由 `resolveTodayMovieId` / `today.json` 决定，与 store 字段 `todayMovieId` 无关）。

> 说明：历史上若存在 `docs/reports/Phase 26.1 P26.1 HDR 色彩验证矩阵 实施报告.md` 等草稿，以 **本报告** 为 P26.1 最终口径。

---

## 6. 验证与回归（本仓库内）

- 移除上述文件后，在 `frontend/` 执行 **`npx vitest run`**：测试套件通过（与 P26.1 工具无关的用例保持绿）。
- **Mac 上偏色修复**的「验收」以产品侧实机确认为准；本阶段**不**将 HDR 矩阵纳入 CI 或发布门槛。

---

## 7. 后续建议（非本阶段承诺）

1. **P26.4 / Design Spec**：若需 SSOT 同步，可将 §2～§4 摘要写入 `docs/project_docs/TMDB 电影宇宙 Design Spec.md` 的「跨设备色彩」小节，并指向本报告。  
2. **HDR**：若未来实现显示端 HDR，需单独定义：目标色域、tone mapping、与 HUD/CSS 的合成顺序、以及回归用例（可重新引入受控 debug 面板，但应走正式产品/i18n 策略）。  
3. **P26.2 / P26.3**：仍可按 `phase_26_device_spatial_optimization.plan.md` 继续，与本报告收口无冲突。

---

## 8. 变更清单（便于 code review）

- 删除：`P26ColorAuditPanel.tsx`、`useP26ColorAuditFromQuery.ts`、`p26TodayMovieOverride.ts`、`p26TodayMovieOverride.spec.ts`、`docs/guides/P26.1 HDR 与色彩验证测试指南.md`
- 修改：`frontend/src/App.tsx`（恢复纯 `resolveTodayMovieId` 流程；去掉浮层）
- 修改：`frontend/src/three/scene.ts`（去掉 `data-galaxy-webgl`）
- 新增：本文件 `docs/reports/Phase 26.1 P26.1 Mac 色彩修复与阶段收口 最终实施报告.md`（取代此前同主题的 `Phase 26.1 P26.1 最终决策与实施报告.md` 草稿文件名，以本路径为 SSOT）

---

*本报告取代 P26.1 阶段内所有临时矩阵表与验证指南的效力，作为该子项的最终书面结论。*
