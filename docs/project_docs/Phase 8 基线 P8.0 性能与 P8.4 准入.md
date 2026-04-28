# Phase 8 基线（P8.0 · 性能与 P8.4 准入）

> 从 `视觉参数总表.md` 拆出单独跟踪（**2026-04-27**）。Phase 7 宏观参数清单仍见 **`视觉参数总表.md`**（Git 跟踪；**不再**列入 `.cursorignore`）。总表文首注明：开发者速查用，**非** Agent SSOT。

---

## P8.0.1 现状主场景 · Chrome Performance（各约 5 s）

> 本节在 Phase 8 各子任务落地前建立**可复现**的测量口径。下表 **P8.0.1** 三行已于 **2026-04-27** 按本机 Chrome Performance 摘录填入（`vite preview`，`http://127.0.0.1:4173/…`）。**JS Main** 列为 Summary **Scripting** 总毫秒 ÷ 选区时长 × **60 fps** 粗算之「平均每帧 Scripting」（未含 Rendering/Painting）；**GPU time** 无 Summary 汇总时记 **N/A**。Chrome 精确版本号 / GPU 型号请补在环境行。

**环境（2026-04-27 本机）**：Windows；构建 **`npm run build` + `vite preview`（4173）**；`devicePixelRatio` 等以录制机为准（可控制台 `window.devicePixelRatio`）。**待补**：Chrome 版本字符串、GPU 型号（任务管理器 → 性能）。

| 片段 | 操作说明 | GPU time（ms / frame，中位数） | JS Main（ms / frame） | Long tasks（>50 ms，次数） | fps 中位数 | 备注 |
|------|----------|--------------------------------|----------------------|-----------------------------|------------|------|
| **idle** | 主应用加载默认数据；`zCurrent` 远离热点年份，无 hover；**整段录制约 7.1 s** | N/A（trace 未汇总 GPU ms） | **~0.6**（236 ms Scripting ÷ ~427 帧 @60fps） | **1**（开头 **Evaluate Script** Long Task） | **~60**（Frames 几乎全绿） | 含**冷启动首屏**；若只要稳态 idle 应「画面稳定后再 Record 5 s」另录一条对照 |
| **timeline 拖动** | 拖动时间轴扫过可用跨度；Performance **选区 2.05–7.02 s**（Total **4 969 ms**） | N/A；选区内 **GPU 轨道持续高占用**（定性） | **~4.1**（1 224 ms Scripting ÷ ~298 帧） | **0**（以 Main 无 Long Task 为准） | **~60** | **INP 10 ms**（Insights）；纯交互段子选区，口径优于「整段 10 s 含拖前/拖后」 |
| **focus** | 高 `vote_count` 片：飞入 + Perlin 出现至稳定；选区 **3.02–8.00 s**（Total **4 980 ms**） | N/A；GPU 全程有活（定性） | **~1.1**（324 ms Scripting ÷ ~299 帧） | **0** | **~60** | 选区含 **飞入（约 4.8–5.5 s 球体亮起）+ 稳态 focus**；**INP 19 ms**，**CLS 0**；稳态-only 可再框 **5.6–8.0 s** 子选区 |

**录制步骤（摘要）**：DevTools → **Performance** → Record → 执行上表操作 → Stop → 在 **Frames** / **GPU** / **Main** 栏读取中位数（或 Summary 总览）。

---

## P8.0.2 双 InstancedMesh 压力 Story（P8.4 准入门槛）

- **入口**：Storybook → `Dev/Instanced mesh bench (P8.0)` → `DualMeshWorstCase`。源码：`frontend/src/storybook/InstancedMeshBench.tsx`。
- **内容**：同屏两个 `InstancedMesh`，各 **60 000** 实例；几何为 `IcosahedronGeometry(1, 0)` 与 `IcosahedronGeometry(1, 1)`；**相同** `instanceMatrix`（模拟最坏 overdraw）；材质为 `MeshBasicMaterial`（无 OKLab / 自定义片元），idle 侧 `transparent + !depthWrite` 近似未来 idle mesh。
- **Three.js r183 几何说明**：当前 `IcosahedronGeometry` 为**非索引**展开，`position.count` 为 **60**（detail 0）与 **240**（detail 1）每实例，故两 draw 合计约 **60 000×(60+240) = 18×10⁶** 次顶点属性参与 / 帧（高于拓扑意义上的 12+42 估算；若后续改为索引化几何，须重测并重写本段）。
- **理论备忘（拓扑顶点，仅供参考）**：`60k×12 + 60k×42 = 3.24M`（计划原文）— 与引擎实际 buffer 可能不一致，以本 Story **HUD + `renderer.info`** 为准。
- **实测摘录（2026-04-27 · Storybook）**：HUD `WebGL2: yes`；`fps median (~1s)` **158.7**（**n=160**）。显著高于 60 时多为**高刷显示器**或 **rAF 未锁 60 Hz vblank**，准入仍以「≥ **50** fps」判通过即可。

**双 mesh Story fps（~1 s 滑动中位数，与 HUD 绿字一致）**

| 设备类型 | GPU / 备注 | fps 中位数 | 是否满足准入 |
|----------|------------|------------|--------------|
| 桌面独显 | 本机 Storybook `DualMeshWorstCase`；**WebGL2**；GPU 型号待补 | **158.7**（HUD，n=160） | **是**（≥50） |
| 笔电集成显卡或等价 | *待填* | *待填* | ≥ **50**；若 35–50 须**书面接受**后继续 P8.4 |
| 可选：DevTools **4× CPU + 4× GPU** throttle | *待填* | *待填* | 仅作趋势，不作为唯一 gate |

**准入规则（摘自 Phase 8 计划）**：双 mesh 组合在两台目标设备上 idle 段 **≥ 50 fps**（集成显卡可放宽至 **≥ 35 fps** 但须书面确认）；若不达标，**优先**降低后处理 / Bloom 强度或半径，**不**优先砍掉 `detail=1` active 几何。本 bench **未**包含 Bloom 与复杂片元；P8.5 再用透明 idle + opaque active 对照 fps。

---

## P8.0.3 WebGL2

- 生产启动路径在 **P8.4** 实装 `renderer.capabilities.isWebGL2` 硬断言；本 bench 内已 `console.assert` + HUD 展示 WebGL2 可用性，便于提前发现环境红线。

---

## P8.0.4 状态机 SSOT

- 四态（idle / active / hover / focus）+ 延后 **select**：见 [`星球状态机 spec.md`](星球状态机%20spec.md)（`W = uZVisWindow×0.2`、`vote_count` focus 权重与「小片偏小」意图、draw 顺序、WebGL2）。
- **Phase 8 文档回写（2026-04-27）**：《视觉参数总表》持续与源码对齐；《Tech Spec》/《Design Spec》/《数据特征工程与 3D 映射总表》已更新 P8.1–P8.4 双 mesh 与 `genre_hue`。搜索与 `select` 能力将**另行**统一设计与排期，不维护独立 spec 文件。

---

## P10.0 入口（Phase 10 全局重映射 · 实施前基线）

> **目的**：在 P10.1（rating→L）、P10.2（Z 方向距离衰减）、P10.3（Bloom — **已收尾为生产默认关**，见 Tech Spec §1.2 与 Phase 10.3 报告）等改动并入前，锁定一条与 §P8.0.1 **同口径**的入口表，供后续性能对照。**自愿**：Phase 10 代码稳定后可用同口径补一行「出口」备注（非强制；见 Phase 10 计划 P10.5）。  
> **Git 分支（登记时）**：`phase/p10-0-entry-baseline`（由 `main` 分出，**无** Phase 10 着色器 / Bloom 默认逻辑 diff）。

**2026-04-28 复查（本仓库）**

1. **构建**：`frontend` 下 `npm run build`（tsc + vite build）**通过**，与 Phase 10 启动时生产包一致。  
2. **Chrome Performance 三线**：本环境无法在 Agent 会话内代出 DevTools **Summary → Scripting** 与 **Frames** 中位数；**下列三行数值与 §P8.0.1（2026-04-27）表逐项一致**——在「当前提交相对 4/27 无 idle/active shader、`scene.ts` Bloom 默认态等 Phase 10 差异」的前提下，视为 **P10.0 入口基线冻结**。若需日期与机器上独立重录，维护者请本地按 §P8.0.1「录制步骤」再录 idle / timeline 拖动 / focus 各约 5 s，并替换下行日期与备注。

**环境（与 §P8.0.1 对齐）**：Windows；**`npm run build` + `vite preview`（4173）**；`devicePixelRatio` 以录制机为准。Chrome 精确版本 / GPU 型号仍见 §P8.0.1 环境行（待补）。

| 片段 | 操作说明 | GPU time（ms / frame，中位数） | JS Main（ms / frame） | Long tasks（>50 ms，次数） | fps 中位数 | 备注 |
|------|----------|--------------------------------|----------------------|-----------------------------|------------|------|
| **idle** | 主应用加载默认数据；`zCurrent` 远离热点年份，无 hover；**整段录制约 7.1 s** | N/A（trace 未汇总 GPU ms） | **~0.6**（236 ms Scripting ÷ ~427 帧 @60fps） | **1**（开头 **Evaluate Script** Long Task） | **~60**（Frames 几乎全绿） | 含**冷启动首屏**；若只要稳态 idle 应「画面稳定后再 Record 5 s」另录一条对照 |
| **timeline 拖动** | 拖动时间轴扫过可用跨度；Performance **选区 2.05–7.02 s**（Total **4 969 ms**） | N/A；选区内 **GPU 轨道持续高占用**（定性） | **~4.1**（1 224 ms Scripting ÷ ~298 帧） | **0**（以 Main 无 Long Task 为准） | **~60** | **INP 10 ms**（Insights）；纯交互段子选区，口径优于「整段 10 s 含拖前/拖后」 |
| **focus** | 高 `vote_count` 片：飞入 + Perlin 出现至稳定；选区 **3.02–8.00 s**（Total **4 980 ms**） | N/A；GPU 全程有活（定性） | **~1.1**（324 ms Scripting ÷ ~299 帧） | **0** | **~60** | 选区含 **飞入（约 4.8–5.5 s 球体亮起）+ 稳态 focus**；**INP 19 ms**，**CLS 0**；稳态-only 可再框 **5.6–8.0 s** 子选区 |

**录制步骤**：与 §P8.0.1 相同（DevTools → **Performance** → Record → 执行上表操作 → Stop → **Frames** / **GPU** / **Main** / Summary）。
