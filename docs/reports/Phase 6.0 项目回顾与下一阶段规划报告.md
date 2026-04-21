# Phase 6.0 — 项目回顾与下一阶段规划报告

> **报告日期**: 2026-04-21
> **阶段标签**: Phase 6.0（Phase 5 收尾后的第二轮 Review）
> **评估方法**: 用户手动复测 + 代码现状审计
> **承接**: [Phase 5 后续开发计划](../../.cursor/plans/phase_5_follow-up_plan_64727854.plan.md) · [Phase 5.0 项目全面评估与测试报告](<./Phase 5.0 项目全面评估与测试报告.md>)

---

## 0. 执行摘要

Phase 5 的核心改造（视距窗口 / 三层粒子 / DPR 兼容性 / UMAP 调参 / Timeline 拖动 / Drawer 打磨等）已全部交付；残留的 3 个 **低优先级 pending 项**（5.3.3 前端搜索、5.4.1 Vitest、5.4.2/5.4.3 Bundle 与 far 收窄）经评估**暂不执行**，后续按需回到 Phase 5 计划中执行。

基于 Phase 5 完成后的第二轮用户复测，识别出 **6 项新 Issue**，按优先级分布为 1 High / 3 Medium / 2 Low。其中 3 项（I1 数据堆叠、I3 hover 偏移、I4 星点前后关系）对宏观浏览体验仍有可见影响，本阶段将作为核心攻坚；I2（视觉参数整体复盘）依赖 I1 管线改造完成后再统一调参。

**本阶段的关键工程转向**：I1 的根治方案需要 `n_neighbors=100 + densmap=True` 的 UMAP，`umap-learn`（CPU）在 59K 数据集上耗时与内存都无法接受，必须迁移到 **RAPIDS cuML GPU UMAP**。由此衍生出一次"**Python 数据管线整体 GPU 化 · WSL Ubuntu 化**"的基础设施升级 —— 这是 Phase 6.0 最重的 enabler，完成后 I1 / I2 / 未来的重训都会受益。

| 维度            | 评级     | 说明                                                                     |
| --------------- | -------- | ------------------------------------------------------------------------ |
| Phase 5 完成度  | ✅ 良好  | 关键路径 100% 完成；3 项低优先级 pending 可延期或取消                    |
| 宏观浏览体验    | ⚠️ 待改进 | 视距窗口 + 三层已到位，但局部堆叠与 hover/遮挡偏差在高密度星团仍明显     |
| 数据管线基础设施 | ⚠️ 待升级 | 当前 UMAP 为 CPU (`umap-learn`)，无法开启 densmap + 大 n_neighbors       |
| 文档完备度      | ⚠️ 待补齐 | 项目 README、数据集版权声明（TMDB CC-BY）未发布到根目录                  |
| HUD 可发现性    | ⚠️ 小缺口 | 无入口说明项目背景 / 数据来源 / 技术栈，新用户首次访问缺少上下文         |

### 0.1 Phase 5 → Phase 6.0 状态快照

| Phase 5 子任务 | 状态       | 备注                                                           |
| -------------- | ---------- | -------------------------------------------------------------- |
| 5.1.1–5.1.8    | ✅ completed | 视距窗口 + 三层粒子 + DPR 修复 + Spec 同步全部落地             |
| 5.2.1          | ✅ completed | `min_dist=0.4`；本次 Review I1 为继续调参的延伸                |
| 5.2.2          | ✅ completed | Model B（768d mpnet）评估完成 + 已切换                         |
| 5.3.1 / 5.3.2  | ✅ completed | Timeline 拖动跳转 / Drawer 打磨上线                            |
| 5.3.3          | 🕒 pending   | 前端搜索 — 暂不执行（保留在 Phase 5 plan）                     |
| 5.4.1–5.4.3    | 🕒 pending   | Vitest / Bundle / `far` 收窄 — 暂不执行（保留在 Phase 5 plan） |

---

## 1. 本轮 Review 识别的 Issue 清单

| ID  | 描述                                                 | 标签    | 优先级 | 对应章节 |
| --- | ---------------------------------------------------- | ------- | ------ | -------- |
| I1  | 数据点堆叠情况依旧显著                               | Dataset | High   | §2       |
| I2  | 完整的三层视觉重新设计                               | Design  | Medium | §3       |
| I3  | 鼠标位置与触发 hover 不符，相邻星星更容易出现        | ThreeJS | Medium | §4       |
| I4  | 星星前后关系有问题（近处被远处遮挡）                 | ThreeJS | Medium | §5       |
| I5  | 添加一个 INFO 按键用于展示项目相关信息               | HUD     | Low    | §6       |
| I6  | 项目 README、数据版权等文档补充                      | Meta    | Low    | §7       |

> **复测环境**: 已完成 5.2.2 切换 768d mpnet + 5.2.1 `min_dist=0.4` + Phase 5.1 全部三层 shader / 视距窗口架构；Windows 100/125/150% 缩放下视窗裁切问题已修复（H-G）。

---

## 2. Issue I1 · 数据点堆叠情况依旧显著（High / Dataset）

### 2.1 现象

在 Model B（768d mpnet）+ `min_dist=0.4` 重训后，整体分布相较 Model A 已有改善，但局部星团（尤其同流派高密度区，如 Drama/Comedy 当代电影）**仍存在肉眼可见的"糖浆状"糊合**：窗口内焦点层放大后，相邻星体 XY 距离明显小于点视觉半径，导致 hover 不可分辨、视觉上成片。

### 2.2 根因假设

| 假设 | 机制 | 证据 |
| ---- | ---- | ---- |
| **A（主因）** | UMAP 默认 `n_neighbors=15` 侧重局部结构保留，对大数据集产生过强的局部 contraction；且 `min_dist` 单独提升无法对抗 | Phase 5.2.1 `min_dist` 从 0.1 → 0.4 只能稀释但不能解开局部密度团 |
| **B** | UMAP 本身在 59K+ 点上**保密度能力弱**，需要 DensMAP 变体（UMAP 的密度保留扩展）才能把高密度区在低维中也显式保留 | `umap-learn` 文档 §densmap；论文"Assessing single-cell transcriptomic variability through density-preserving data visualization" |
| **C（次）** | 融合阶段 `w_text / w_genre / w_lang` 等权，text block（768d）信号强度仍可能淹没 genre/lang 的离散分段 | 管线当前三路全部 `w=1.0`；待 I2 扫参阶段验证 |

### 2.3 开发方向

> 本轮用户决策：A + B 一起做；C 留到 I2 扫参阶段评估。

**参数调整**（对 `scripts/feature_engineering/umap_projection.py`）:
- `n_neighbors`: `15` → **`100`**（增强全局结构感知，拉开高密度区）
- 启用 **`densmap=True`**（UMAP 的密度保留模式）
- `min_dist` 暂维持 `0.4`，待重训后由 I2 复评

**执行前提（硬约束）**:
- `n_neighbors=100 + densmap=True` 在 59K × ~800d 融合向量上用 `umap-learn`（CPU）实测**内存与耗时不可接受**
- 必须切换到 **RAPIDS cuML `cuml.manifold.UMAP`**（GPU 版本，支持 `densmap` 参数，且在 10⁵ 数量级上有 10–50× 加速）
- cuML 对 Windows 原生支持薄弱 → 连带触发"管线整体迁移到 WSL Ubuntu + 全链路 GPU"的基础设施升级（见 §8）

**预期验收**:
- 同样的 `cleaned.csv` 输入下，重训后的 `umap_xy.npy` 肉眼对比：局部高密度星团由"糖浆团"改善为"可辨别的星云"；窗口内焦点层 hover 可单独命中
- 同时重新导出 `galaxy_data.json`，`meta.umap_params` 写入 `n_neighbors=100 / densmap=True / min_dist=0.4`（不要漏同步 `scripts/export/export_galaxy_json.py` 内的 meta 默认值）

---

## 3. Issue I2 · 完整的三层视觉重新设计（Medium / Design）

### 3.1 背景

Phase 5.1.6 已落地三层 shader（A 背景 / B 焦点 / C 选中 Perlin），但参数是**分别在开发过程中单点调到"能看"**，缺少一次**系统化的整体视觉评估**。I1 重训后星系分布会再次变化，正好是统一复盘视觉参数的最佳时点。

### 3.2 开发方向

> 两步走：先列参数总表（agent 可完成），再由用户人工走查视觉（agent 不替代审美判断）。

#### 3.2.1 参数清单化（agent 任务）

产出文档 `docs/project_docs/视觉参数总表.md`，按层级枚举**所有影响视觉的可调参数**，每条附上：

- 当前值 / 文件 / 行号
- 作用描述与肉眼效应
- 取值范围与依赖关系（例如 bloom strength 与 threshold 的耦合）

涵盖范围（初步盘点，实际以 agent 产出为准）:

| 类别           | 参数样例                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 相机 / 视距    | `FOV`、`zCamDistance`、`zVisWindow`（当前 1 年）、near/far                                                                |
| 粒子通用       | `uPixelRatio` clamp 上限、`sizeAttenuation` 相关常量、HDR emissive 比例                                                   |
| A 层背景       | 固定 size、单色取色策略（当前 `genres[0]`）、transparent + alpha                                                          |
| B 层焦点       | `genres[0]` 色相映射、真实 size 的缩放系数、窗口边缘 alpha/size 过渡（当前硬切）                                          |
| C 层选中       | `IcoSphere detail`、`uScale / uOctaves / uPersistence / uThreshold`、边界 smoothstep 宽度、Perlin fbm 参数                |
| 后处理 Bloom   | `strength`、`radius`、`threshold`（当前已重新启用）                                                                       |
| 交互 / 动画    | 相机飞入 duration / easing、hover 光晕透明度、Drawer 开合动效曲线                                                         |
| HUD            | Timeline 高度、Drawer 宽度、字体层级、暗化叠加                                                                            |

#### 3.2.2 人工扫参（用户任务）

以参数总表为 checklist，在 `localhost:5173` 上**逐组调节 → 截图比对**，最终产出：

- 每组最佳值 + 备选值
- 如有 uniform 级别的调参需求，评估是否引入一个 **开发期调试面板**（leva / lil-gui）作为临时工具，不入生产构建

**预期验收**:
- 三层之间存在清晰的视觉层级（背景-焦点-选中 → 对应 "near-stars / focus-window / hero"）
- Bloom 不再淹没 genre 颜色；C 层 Perlin 分区边界与色块识别度达到 Design Spec §2 要求
- 所有最终值回写进相关文件 + Tech Spec / Design Spec 同步

---

## 4. Issue I3 · 鼠标位置与触发 hover 不符（Medium / ThreeJS）

### 4.1 现象

相邻星星更容易抢到 hover，尤其在 768 模型重训后出现。鼠标指针明显在 A 星，但 tooltip 绑定到相邻 B 星。

### 4.2 根因分析（先调查再动）

两条候选路径：

**路径 1 — threshold 未随模型切换同步**
- `frontend/src/three/interaction.ts:15-36` `computeFocusSlabPointsThreshold()` 从 `meta.xy_range / z_range / count + zVisWindow` 动态推导 threshold
- 换模型后 `meta.xy_range` 改变 → 如果切换模型时 `galaxy_data.json` 或 `meta.umap_params` 未完整重导，`xy_range` 可能与实际 `movies[].x/y` 范围错位，导致 `avgXYSpacing` 估错
- **验证手段**: 打印重训后 `meta.xy_range` 与实际 `movies.map(m=>m.x)` 的 min/max，比对；同时打印当前 threshold 与任意相邻两星 XY 距离，看 threshold 是否 ≥ 距离

**路径 2 — 单星拾取半径 > 点间距**
- 当前 `avgXYSpacing * 0.75` 的 clamp 上限为 `xyMin * 0.08`，在 1 年窗口下 `nSlab ≈ movies × (1/z_span)`，某些年份局部密度远高于均值（例如 1990+ 的剧情片集中年），实际 XY 间距远小于均值 spacing
- 透视下 threshold 是世界单位的球形容限，镜头下被放大的近处点容差也被放大，覆盖到相邻星
- **验证手段**: 在 I1 重训后同样复测；若仍存在，考虑把 threshold 从"slab 均值"改为"局部 kNN 距离估计"，或直接固定为"点视觉半径 × 世界尺度系数"

### 4.3 开发方向

1. **先做根因定位（不直接改代码）**：加诊断日志打印上述两条路径的数据，复现 → 判定主因
2. 若主因是路径 1：重跑完整导出 → 校验 `meta.xy_range` 与 `movies[].x/y` 对齐；必要时在 `export_galaxy_json.py` 中 **强制从实际坐标计算**，而非从 `meta_template` 透传
3. 若主因是路径 2：改造 threshold 计算为"每粒子视觉半径一致"策略，或缩小系数（`0.75 → 0.4`）再复测
4. I1 重训后**必须重新评估**，因为 `xy_range` 与局部密度分布都会变，不要基于旧数据下结论

**原则**: 与 Phase 5.1.4 T1 调查模式一致 — **先观察再下结论，不靠"拍脑袋改系数"**。

---

## 5. Issue I4 · 星星前后关系有问题（Medium / ThreeJS）

### 5.1 现象

较近（相机前方更近）的星体有时被较远的星体遮挡，表现为"近星闪烁消失 / 被后方星点覆盖"。

### 5.2 根因分析（先调查再动）

**核心嫌疑**: `frontend/src/three/galaxy.ts:73-76`:

```ts
transparent: true,
depthTest: true,
depthWrite: false,
```

`depthWrite: false` 对 `THREE.Points` 的半透明渲染是常见默认（避免 alpha 边缘打穿深度），但代价是**同一 Points mesh 内部的点之间没有正确深度排序** → 渲染顺序由 geometry 中的顶点 index 顺序决定。我们的顶点 index = 按导出顺序的 movie index（无 z-sort），因此"前后关系"是数据顺序决定的，不是相机距离决定的。

这能解释为什么"**较近的星体有时会被远处的星体遮挡**"——当较远星对应的 index 在数组末尾时，它最后绘制，在 `depthWrite:false` 下覆盖了已绘制的近星 alpha 残留。

### 5.3 开发方向

> 同样先定位再决策。可能的修复方向（由 agent 探索 + 用户复测）:

| 方案 | 描述 | 代价 | 副作用                                            |
| ---- | ---- | ---- | ------------------------------------------------- |
| M1   | 打开 `depthWrite: true`（配 `alphaTest` 避开透明边缘打穿） | 低   | 需调 `alphaTest` 阈值；点圆盘边缘可能出现硬边 |
| M2   | CPU 每帧按相机距离排序 geometry index / `drawRange` | 中   | 59K 排序 @ 60fps 需评估；一般只在相机大范围移动时触发 |
| M3   | 改用 **logarithmic depth buffer** (`renderer.logarithmicDepthBuffer`) 或收窄 far | 低 | 只解精度问题，若主因是 `depthWrite=false` 则无效  |
| M4   | 把 Points 拆成**多层 mesh** 按 slab 分批渲染 + 启用 depthWrite | 中 | 与 5.1.6 三层架构天然契合 |

**推荐流程**:
1. **Step 1 诊断**：临时把 `depthWrite` 设为 `true` + `alphaTest: 0.5`，复现是否消失，确认主因是否为 `depthWrite=false`
2. **Step 2 取舍**：如果 M1 视觉上点边缘硬边不可接受，再评估 M2（CPU 排序）或 M4（分层 mesh）
3. **Step 3 回归**：确保 Bloom pass、三层 shader、window 边缘过渡都不被破坏

---

## 6. Issue I5 · 添加 INFO 按键（Low / HUD）

### 6.1 背景

当前 HUD 无任何"这个项目是什么 / 数据从哪来 / 谁做的"入口。首次访问者看到 59K 星点但不知道在看什么。

### 6.2 开发方向（不在 Phase 6.0 必做范围）

- 右上角或 Timeline 侧边添加 `INFO (i)` 按钮
- 点击弹出一个 Sheet / Dialog（复用现有 shadcn 组件），内容包含：
  - 项目简介、数据集来源（TMDB）与版权声明（CC-BY）
  - 技术栈（Three.js + React + Python 管线）
  - 主要交互说明（拖动/滚轮/点击/Timeline）
  - GitHub 链接
- 该 Sheet 可直接**引用 I6 产出的 README 内容片段**，避免文案双写

**预期规模**: S（单组件 + 若干文案），与 I6 联动交付。

---

## 7. Issue I6 · README / 数据版权等文档补充（Low / Meta）

### 7.1 缺口盘点

- 根目录 `README.md` 缺失或仅占位
- TMDB 数据集的 **CC-BY / Attribution 要求** 未在项目任何位置声明
- `frontend/public/data/galaxy_data.json` 的 schema 无面向外部的说明文档
- Phase 5/6 迭代后的架构总览图（视距窗口 + 三层 + 管线）未沉淀到任何对外文档

### 7.2 开发方向

产出物（优先级从高到低）:

1. **`README.md`（根目录）** — 含项目 one-liner、效果截图/GIF、快速运行指引（前端 `npm run dev` / 管线 `python scripts/run_pipeline.py`）、License
2. **`DATA.md` 或 README §数据声明** — TMDB 数据集出处、抓取时间、字段定义链接、CC-BY 归属文案
3. **`docs/project_docs/` 补充**：在 Tech Spec / Design Spec 之外，增加一份"**架构总览**"简图（可用 mermaid），把 Python 管线 → UMAP → JSON 导出 → Three.js 三层渲染 → HUD 这条链路一图说清
4. **与 I5 文案共享**：README 中的"技术栈 + 数据来源 + 交互说明"段落，INFO 对话框直接引用同一份源

---

## 8. Phase 6.0 基础设施升级 · 管线全链路 GPU 化（WSL Ubuntu）

> 这是 I1 的**前置 enabler**，也是 Phase 6.0 最重的一块基础工作。独立成章以强调其跨 Issue 的影响面。

### 8.1 背景与动机

- **I1 的 `n_neighbors=100 + densmap=True` 需求**在 `umap-learn`（CPU 单线程 / `n_jobs=1`）下不可行
- `cuML` 的 GPU UMAP 在 Linux 有成熟支持，但 Windows 原生 cuML 长期不完善 → 自然导向 WSL2 Ubuntu
- 已完成的前置条件：用户已在本机装好 WSL2 Ubuntu，账号密码可用；NVIDIA GPU 在 Windows 侧已可工作（Phase 2.1 CUDA embedding 已在用）
- 当前 Python 管线散布在 Windows `.venv`（embedding / UMAP）和部分 WSL，拓扑不一致

### 8.2 目标

把**整条 Python 数据管线**（Phase 1 清洗 → Phase 2 embedding → Phase 2.4 融合 + UMAP → Phase 2.5 导出 JSON）**统一迁移到 WSL Ubuntu 环境**，并在 GPU 上运行所有支持 GPU 的步骤。

### 8.3 工作项（agent 负责为主，用户仅需授权 + 最终复测）

| # | 任务 | 负责 | 说明 |
|---|------|------|------|
| 8.3.1 | WSL Ubuntu 基础环境：apt 更新、git、build-essential、python3.11+、pip、venv | agent | 用户提供 sudo 密码后 agent 执行 |
| 8.3.2 | NVIDIA CUDA toolkit + cuDNN（WSL 版，不重复装 driver） | agent | 使用 `cuda-toolkit-wsl-ubuntu` meta-package |
| 8.3.3 | 安装 **RAPIDS cuML**（conda 或 pip），与项目 `torch` CUDA 版本兼容 | agent | 以 `conda create -n rapids -c rapidsai -c conda-forge ...` 为首选方案；失败则 fallback pip |
| 8.3.4 | 移植 `requirements.txt` → 拆分 `requirements.cpu.txt` / `requirements.gpu.txt`，或按 `extras_require` 分组 | agent | 保留 Windows 兼容的 CPU 回退路径 |
| 8.3.5 | `scripts/feature_engineering/umap_projection.py` 重构：支持 `--backend {umap,cuml}`；cuml 分支启用 `densmap=True / n_neighbors=100` | agent | 输出格式（float32 (n,2)）保持不变，对 export 无感 |
| 8.3.6 | `scripts/run_pipeline.py` 同步支持 GPU 路径；检测 `CUDA_VISIBLE_DEVICES` 自动选 backend | agent | 默认 GPU；`--cpu` 强制回退 |
| 8.3.7 | 数据与代码的 WSL/Windows 共享策略：代码走 `/mnt/e/projects/chronicle_v3_3d_galaxy` 直挂，或 clone 到 WSL home + rsync 回写产物到 `data/output` | agent + 用户 | 性能 vs 一致性取舍；默认建议 clone 到 WSL home，产物通过 `cp` 写回 Windows 侧 |
| 8.3.8 | 冒烟测试：在 WSL GPU 上跑 `tmdb2025_random20.csv` 子样本端到端 | agent | 复用 Phase 2.6 冒烟流程，确认产物 JSON 加载到前端正常 |
| 8.3.9 | 全量重训（I1 的实际发动）：59K × (n_neighbors=100, densmap=True)；记录耗时与 GPU 显存占用 | agent | 触发 I1 / I2 的下游评估 |
| 8.3.10 | 文档更新：Tech Spec §2 数据管线章节追加 GPU/WSL 分支；README 的"运行管线"加 WSL 路径 | agent | 与 I6 联动 |

### 8.4 交付原则

- **agent 自治优先**：用户已明确"工作最好全部交由 agent 完成"。agent 在每个需要 sudo / 交互式输入的节点先请示，不擅自修改全局配置
- **不破坏现有 Windows 管线**：保留 `umap-learn` CPU 后端作为 fallback；`requirements.txt` 分组或保留最小公共集
- **每个 8.3.x 完成后单独产出实施报告**，纳入 `docs/reports/`，符合本项目既有节奏
- **WSL 与 Windows 的 CR/LF / 权限 / 符号链接**问题由 agent 在 8.3.7 统一处理，不让用户面对

### 8.5 风险

| 风险 | 对策 |
| ---- | ---- |
| cuML UMAP 的数值结果与 umap-learn 不完全一致（DensMAP 实现差异） | 视觉复测为主；保留旧 xy/model 备份 `data/output/umap_xy.umap-learn.npy` |
| WSL 下 GPU 显存不足（59K × ~800d 融合矩阵 + densmap 内存）| 先冒烟、再评估 batch / 降维到 PCA 前处理 |
| conda/rapids 安装链复杂且易失败 | 优先镜像；失败后允许 pip + `cuml-cu12` wheels；再失败则用户介入授权备选路径 |

---

## 9. Phase 6.0 开发路线图建议

按依赖与价值排序（agent 执行时的建议顺序）:

```
[Enabler] §8  管线 GPU / WSL 迁移
              ├─ 8.3.1–8.3.7  环境 + 代码 + 数据通路
              └─ 8.3.8       子样本冒烟
                     ↓
[攻坚]  I1  densmap + n_neighbors=100 重训 → 导出 → 前端复测
                     ↓
[并行]  ┌─ I3  hover 偏移根因调查（重训后数据已到位，比对最准）
        ├─ I4  前后关系根因调查（与数据无关，可更早切入）
        └─ I2  视觉参数总表产出 + 用户扫参（依赖 I1 新分布）
                     ↓
[收尾]  ┌─ I6  README / DATA.md / 架构总览
        └─ I5  INFO 按键（引用 I6 文案）
```

**里程碑**:

- **M6.0.A — WSL GPU 管线就绪**（§8.3.1–8.3.8 完成）
- **M6.0.B — 数据集质量跃迁**（I1 完成，宏观浏览不再"糊"）
- **M6.0.C — 视觉/交互定版**（I2 + I3 + I4 完成）
- **M6.0.D — 对外化准备**（I5 + I6 完成）

---

## 10. 风险与开放问题

1. **I1 重训后 Phase 5 实施的三层 shader 参数可能失效** —— `point.vert/frag` 中的 size/alpha 系数是在旧分布下调的，I2 扫参即是为此准备的收敛环节
2. **cuML DensMAP 结果的可复现性** —— cuML 默认 `random_state` 行为与 umap-learn 不同；需明确复现策略，以免重训导致前端 diff 无法追因
3. **I3 / I4 的根因若指向同一 mesh 的深度 + 拾取耦合问题**，有可能触发"Points 换成 Instanced Sprites"的更大改造 —— 若出现这种征兆，应**即时升为 Phase 6.1 独立设计方案**，不在 6.0 内塞改
4. **用户时间投入**：I2 扫参、I1 重训后肉眼复测、I3/I4 诊断结果判定，都需要用户 "有图有感 → 下结论" 的几次回合，不可全 agent 自治
5. **暂不执行的 Phase 5 pending 项**如果后续用户反馈需要（尤其 5.3.3 搜索、5.4.1 Vitest），可直接回到 Phase 5 plan 执行，或作为 Phase 6.1 候选重新评估

---

## 附录 A · 与 Phase 5 相关文件的交叉引用（供执行期快速定位）

| 主题                 | 文件 / 行号                                                                             |
| -------------------- | --------------------------------------------------------------------------------------- |
| UMAP 管线入口        | `scripts/feature_engineering/umap_projection.py:75-92`（CLI）/ `:133-142`（reducer 构造） |
| 管线总入口           | `scripts/run_pipeline.py:41-55`（Phase 2.1–2.5 顺序）                                   |
| 导出 meta.umap_params | `scripts/export/export_galaxy_json.py`（重训后需同步 `min_dist / n_neighbors / densmap`）|
| 拾取 threshold 计算  | `frontend/src/three/interaction.ts:15-36`（focus slab threshold）                        |
| Points 深度模式      | `frontend/src/three/galaxy.ts:73-76`（`transparent:true / depthWrite:false`）            |
| 三层 shader          | `frontend/src/three/shaders/point.{vert,frag}.glsl` / `perlin.{vert,frag}.glsl`          |
| 视距窗口 store       | `frontend/src/store/galaxyInteractionStore.ts`（`zCurrent / zVisWindow / zCamDistance`） |
| Tech Spec            | `docs/project_docs/TMDB 电影宇宙 Tech Spec.md`                                           |
| Design Spec          | `docs/project_docs/TMDB 电影宇宙 Design Spec.md`                                         |

---

_本报告作为 Phase 6.0 的计划蓝本，后续将拆解为 `.cursor/plans/phase_6_plan_*.plan.md`（建议 §8 GPU 迁移单独一份 plan，§2/§3/§4/§5/§6/§7 合并为另一份 plan，以匹配 enabler 与 feature 的不同节奏）。_
