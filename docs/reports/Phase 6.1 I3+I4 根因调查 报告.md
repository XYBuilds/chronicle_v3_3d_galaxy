# Phase 6.1 · I3 + I4 根因调查报告

> 对应 Plan A **P6.1**：并行调查 I3（hover 偏移）与 I4（前后遮挡），**不落地生产修复**（修复归入 P6.2 / P6.3）。  
> 数据基线：`frontend/public/data/galaxy_data.json`（`meta.count` = 59014，与 Phase 6.0 回顾报告一致）。

## 1. 摘要

| Issue | 结论（本轮） | 是否需升 Phase 6.1（InstancedSprites） |
|-------|----------------|----------------------------------------|
| **I3** | **Path 1（meta.xy_range 错位）对当前主数据不成立**；**Path 2（threshold 相对局部点距过大）高度成立**——在 Z 密集 slab 内，全局均匀 Z 假设下的 `nSlab` 严重低估局部密度，导致 `Raycaster` 的 Points threshold 过大，易误拾相邻星。 | **否** — P6.3 在 `interaction.ts`（或辅以导出校验）即可收敛 |
| **I4** | 与 Phase 6.0 §5 一致：`galaxy.ts` 中 `transparent: true` + **`depthWrite: false`** 会使同一条 `Points` 内排序依赖顶点顺序而非相机深度，可解释「近处被远处盖住」。**本轮未在浏览器内完成 Step1 截图确认**（见 §3.2）；建议在 P6.2 前按 §3.2 做一次本地复测。 | **否（当前证据）** — 优先 P6.2 试 M1/M2/M4；仅当硬边/性能/ Bloom 不可接受再评估升级 |

---

## 2. I3 调查

### 2.1 Path 1：`meta.xy_range` vs 实际 `movies[].x/y`

**方法**：对 `galaxy_data.json` 全量扫描 `movies` 的 `x`、`y` min/max，与 `meta.xy_range` 比较。

**结果**（数值为双精度逐字段一致）：

- `meta.xy_range.x` = [-15.054807662963867, 27.085742950439453]  
- 实际 `x` min/max = 同上  
- `meta.xy_range.y` = [-17.08205795288086, 20.057228088378906]  
- 实际 `y` min/max = 同上  
- `meta.z_range` 与全量 `z` min/max 一致  

**结论**：当前导出链路在该文件上 **未出现**「meta 透传模板与坐标脱节」类问题；与 `scripts/export/export_galaxy_json.py` 中由 `xy64` 直接写入 `xy_range` 的实现一致。  
**I3 主因不应归因于 Path 1**（至少对当前主数据）。

### 2.2 Path 2：`computeFocusSlabPointsThreshold` 与局部点距

**相关代码**：`frontend/src/three/interaction.ts` — `computeFocusSlabPointsThreshold()`：用 **全库** `movieCount`、`z_span` 与 `zVisWindow` 估计「典型」slab 内点数 `nSlab`，再得 `avgXYSpacing` 与 threshold（含系数 `0.75`）。

在 **默认 UI** 下 `zVisWindow = 1`（`galaxyInteractionStore` / `scene.ts` 初始值），全局近似：

- `z_span` ≈ 151.71（decimal year）  
- `nSlab ≈ 59014 × 1 / z_span` ≈ **389**  
- `avgXYSpacing` ≈ **2.006**（世界单位）  
- **`threshold t` ≈ 1.504**（与 `0.75 × avgXYSpacing` 及 clamp 上限一致）

**问题**：近年单年 slab 内真实点数远高于 389（发行年份极度不均匀）。例如 `zCurrent = 2018`、`zVisWindow = 1` 时：

- slab 内 **n ≈ 1829**  
- 若用**真实** `n` 重算「局部」`avgXYSpacing`，约 **0.925**，对应「若仍用 0.75 系数」的 threshold 约 **0.694**  
- 对该 slab 内全部点做 XY **最近邻距离**（`scipy.spatial.cKDTree`，k=2）：  
  - p50 ≈ **0.151**，p90 ≈ **0.538**，p99 ≈ **0.933**  
  - **约 99.7%** 的点的最近邻距离 **&lt; 全局公式给出的 t（1.504）**  
  - **约 97.3%** &lt; **t/2**

在 `zCurrent = 1995`（n≈398）的 slab 中，仍有 **约 94.5%** 最近邻 &lt; 全局 t。

**结论**：**Path 2 成立** — threshold 按「Z 均匀」假设推导，在 **高密度年份** 会系统性地 **偏大**，与 Phase 6.0 §4「相邻星更易误触发」一致。  
**推荐修复方向（供 P6.3）**：

1. **按当前 focus slab 内实际点数**（或 `zCurrent`/`zVisWindow` 解析积分）重算 `nSlab`，替代 `movieCount × zVisWindow / z_span`；或  
2. 使用 **局部 kNN / 视觉半径 × 世界尺度**；或  
3. 在证实无副作用前提下 **收紧系数**（如 `0.75 → 0.4`）作为低风险备选。

### 2.3 附：初始 `zCurrent = zLo` 时的 slab 基数

`scene.ts` 将 `zCurrent` 设为 `z_range` 最小值。对当前数据，`[zLo, zLo+1]` 内仅有 **1** 部影片 —— 与「近年高密度」是不同现象；用户滚动时间轴后进入高密度区，I3 更易暴露。调查脚本与结论仍以 **2018 等典型高密度 slab** 为主。

---

## 3. I4 调查

### 3.1 代码现状

`frontend/src/three/galaxy.ts` 中 `ShaderMaterial`：

- `transparent: true`  
- `depthTest: true`  
- **`depthWrite: false`**  

`frontend/src/three/planet.ts` 选中行星同样为 `depthWrite: false`（与 I4「星点前后」主诉相关度低，但深度策略需与 Bloom/合成一并回归）。

Phase 6.0 报告 §5 已说明：**`depthWrite: false` 时，同一条 `Points` 内各粒子不写深度，绘制顺序主要由 buffer 顺序决定**，可导致远处片元后绘覆盖近处，表现为「近星被远星挡」。

### 3.2 Step 1 建议复测（临时、不入库为定案）

**目的**：验证主因是否为 `depthWrite: false`。

在本地工作区 **临时** 修改 `galaxy.ts` 中创建 `ShaderMaterial` 的配置（**勿与 P6.2 最终方案混为一谈**）：

- 将 `depthWrite` 改为 **`true`**  
- 增加 **`alphaTest: 0.5`**（与 Phase 6.0 §5.3 M1 一致；自定义 `point.frag.glsl` 已输出 `gl_FragColor.a`，Three.js 会按 `alphaTest` 丢弃低 alpha 片元）

保存后运行前端，观察：

- 「近处被远处遮挡」是否 **明显减轻或消失**  
- Bloom、三层 slab 视觉、过渡是否出现 **硬边或闪烁**（M1 已知风险）

**本轮**：自动化环境未替代人工对「遮挡是否消失」做录屏确认；**P6.2 实施前应完成上述一次复测**，以便在 M1 / M2 / M4 之间做有据选择。

### 3.3 P6.2 方案建议（仅推荐，非实施）

| 方案 | 适用起点 |
|------|-----------|
| **M1** | `depthWrite: true` + `alphaTest` 调参；若硬边可接受则成本最低 |
| **M2** | M1 不可接受时，对 59K 级点数做每帧/按需 CPU 排序 index 的代价与抖动评估 |
| **M4** | 与现有 Z slab 分层渲染思路一致，按层控制 `depthWrite` |

若 M1+M2+M4 均无法在可接受视觉下解决，再考虑升为 **Phase 6.1 · InstancedSprites** 级设计（本报告 **不** 建议现在就升级）。

---

## 4. 交付与后续

| 产出 | 状态 |
|------|------|
| 本报告 | ✅ |
| I4 Step1 浏览器复测 | ⏳ 建议人工在 P6.2 前补做 |
| **P6.2** I4 修复落地 | 待办 |
| **P6.3** I3 threshold 修复 | 待办（优先 slab 真实计数或局部密度） |

**调查脚本提示**（可复现 I3 数值）：在项目根目录用 Python 加载 `frontend/public/data/galaxy_data.json`，复现 §2.1 的 min/max 比较；对任意 `zCurrent` 子集构建 XY 的 `cKDTree` 计算最近邻分布，与 §2.2 中全局 `t` 对比即可。

---

*文档版本：与 Phase 6 Plan A P6.1 对齐 · 2026-04-22*
