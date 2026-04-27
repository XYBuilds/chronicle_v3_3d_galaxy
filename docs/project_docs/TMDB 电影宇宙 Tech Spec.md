# **TMDB 电影宇宙 \- 技术实现方案 (Tech Spec)**

## **1\. 系统架构与技术栈**

项目采用严格的前后端计算分离架构：

* **后端/数据处理层 (Python)**：负责数据清洗、NLP 向量化及降维计算（UMAP），输出静态 JSON/Parquet 数据。  
* **前端/渲染层**：  
  * **3D 画布**：原生 **Three.js**（非 R3F / TresJS 等声明式封装），直接控制渲染循环、`InstancedMesh` + 自定义 ShaderMaterial、后处理与**非标准**轴平行相机。理由：~60K 实例双 mesh + focus 高模球体、性能敏感，原生 Three.js 可避免中间层抽象泄漏。  
  * **HUD / UI 层**：**React**（DOM 覆盖层），负责 Tooltip、档案详情抽屉、Loading 页面等。  
  * **状态桥接**：React ↔ Three.js 通过**轻量状态管理**（如 Zustand）通信——Three.js 写入选中/悬停状态，React 读取并渲染 UI；React 写入搜索/导航指令，Three.js 执行相机动画。  
* **数据加载策略**：前端启动时**一次性加载**全量坐标与属性数据（静态 JSON 或等价格式），配合 **Loading 页面**等待加载完成后再初始化 3D 场景。

### **1.1 前端渲染架构（Phase 8：双 `InstancedMesh` + focus Perlin 球）**

**生产路径**已自 Phase 7 的**单 `THREE.Points` 宏观层**切换为**两份全量 `InstancedMesh`**（idle + active）+ **按需 focus Perlin 球**；`point.{vert,frag}.glsl` 仅保留供基准 / Vitest 等，**不**再挂载主场景。

* **WebGL2 硬前置**：`WebGLRenderer` 创建后若 `!renderer.capabilities.isWebGL2` 则**抛错**并提示升级浏览器；宏观与 focus 使用 **`gl_InstanceID`** 与 per-instance 属性，**不**维护 WebGL1 或手动 `aInstanceId` 回退（与 Phase 7.2 浏览器红线一致）。  
* **宏观双 mesh（各 ~60K instance，共享 `instanceMatrix` 与 hue / voteNorm / aSize）**（`frontend/src/three/galaxyMeshes.ts`）：  
  * **idle**：`IcosahedronGeometry(1, 0)`；`ShaderMaterial` **`transparent: true`**、**`depthWrite: false`**、`depthTest: true`；`renderOrder = 0`。  
  * **active**：`IcosahedronGeometry(1, 1)`；`alphaTest: 0.01`、`depthWrite: true`；`renderOrder = 1`。  
  * **Z 条带与过渡**：与 [`星球状态机 spec.md`](星球状态机%20spec.md) 一致——`W = uZVisWindow × 0.2`，`inFocus = smoothstep(zLo−W, zLo, aZ) × (1 − smoothstep(zHi, zHi+W, aZ))`；**idle** 侧尺度 `sIdle = (1 − inFocus) × uSizeScale × uBgSizeMul × aSize`，**active** 侧 `sActive = inFocus × uSizeScale × uActiveSizeMul × aSize`；二者互补（初值 `uSizeScale=0.3`，`uActiveSizeMul=0.02`，`uBgSizeMul=0.002`，见《视觉参数总表》）。  
  * 色彩：§4.3 **`genre_hue`（弧度）** + OKLab 均匀 **`uLMin` / `uLMax` / `uChroma`**（`galaxyIdle/Active` shader 与 P8.1 一致）。  
* **Focus 态 Perlin 球（按需、单实例）**：`IcosahedronGeometry(1, 6)` + **CPU** 上按顶点 noise 分位数定 **4 个硬阈值**（`perlin.frag.glsl` 中 `step` 分色带）；`movie.id` 种子化 PRNG；面积比例由 `uAreaRatio` 等控制（P8.3 定稿）。当 `uFocusedInstanceId` 命中时，**idle + active** 上该 `gl_InstanceID` 的 scale 在 shader 中**置零**，仅由 Perlin 球呈现。  
* **后处理顺序（建议）**：同帧先画 idle → active →（`UnrealBloomPass` 等）→ focus 时 Perlin 球 `visible=true`（`renderOrder` 以 `scene.ts` 实际挂载为准）。

**历史注记（Phase 5.1.6 · 已退役）**：旧版在**单 `THREE.Points`** 上用 `uBgSizeMul` / `uFocusSizeMul` 与 `gl_PointSize` 做 A/B 层；P8.4 起由双 mesh 的 `inFocus` 与双尺度取代。

### **1.2 后处理管线（Bloom）**

```
Render Scene (galaxyIdle + galaxyActive + 可选 focus Perlin mesh)
    ↓
UnrealBloomPass（简单路线）
    ↓
(可选) FXAA / SMAA 抗锯齿
    ↓
Output
```

* **Bloom 方案**：Three.js 内置 **`UnrealBloomPass`**（`EffectComposer` 管线）。  
* **选择性泛光策略**：采用**简单路线**——不对 Layers 做分离渲染。Mesh 片元中 vote\_norm 等驱动亮度，高分 fragment 可高于 Bloom `threshold`；`UnrealBloomPass` 的 `threshold` 筛高亮。  
* **初始参数（均为可调配置，将随视觉调试迭代）**：  
  * `strength`：**0.8 – 1.2**  
  * `radius`：**0.4 – 0.6**  
  * `threshold`：**0.85**（须与 vote\_average → emissive 映射的值域对齐——以 §4.3A 默认 emissive 映射，P75 评分 ≈ 6.8 对应 emissive ≈ 1.0，threshold 0.85 使大致前 25% 高分影片触发泛光）  
* **Phase 5.1.6 实施工作点**：Bloom 曾在早期分层调试中被 strength=0 关闭；重写径向辉光片元与 A/B 分层后恢复为 **strength ≈ 0.95 / radius ≈ 0.52 / threshold ≈ 0.82**（落在上述建议区间内），运行时亦保留 **`window.__bloom`** 读写接口供调参。  
* **DPR 约束**：`UnrealBloomPass` 的 `setSize` 与 `EffectComposer.setPixelRatio` 必须随 renderer 同步——详见 **§1.4 DPR 兼容性约束**。

### **1.3 性能参考基线（非强制，仅作优化阶段对照）**

开发阶段**不设硬性性能约束**，优先跑通全链路。以下数值仅作为后期优化时的**参考锚点**：

| 指标 | 参考基线 | 备注 |
| :---- | :---- | :---- |
| 帧率 | 60 fps（中端独显） / 30 fps（最低可接受） | 低于 30fps 时 3D 漫游体感明显卡顿 |
| JS 堆内存 | ≤ 300 MB | 60K 条 JSON ≈ 30–50 MB；余量留给 Three.js 对象与海报纹理缓存 |
| GPU 显存 | ≤ 500 MB | 双 `InstancedMesh` + instance attribute；主要开销另含 Bloom 多 pass RT 与海报纹理 |
| 首屏（白屏→可交互） | ≤ 5 秒 | 已有 Loading 页，用户预期在"加载一个世界" |

### **1.4 相机初始配置与首屏加载**

#### **1.4.1 视距窗口模型（Phase 5.1.5 · 方案 1）**

引入三个参数刻画宏观漫游下「相机 Z」与「用户时间关注点」的解耦——**均作为 Zustand `useGalaxyInteractionStore` 的一级字段**，`camera.ts` / `scene.ts` / `point.*.glsl` / `interaction.ts` 共享同一份状态：

| 参数 | 含义 | 初值与来源 |
| :---- | :---- | :---- |
| **`zCurrent`** | 用户当前关注的发行年（世界 Z，与 `movies[i].z` 同轴，含小数年） | 挂载时写入 **`z_range` 排序后的较早端 `zLo`**（计划 Rev 4；从时间轴起点开始漫游） |
| **`zVisWindow`** | 可观测 Z 窗口宽度（年），定义 **`[zCurrent, zCurrent + zVisWindow]`** 闭区间 | 默认 **1 年**（非常聚焦），供 §1.1 粒子分层与 §1.5 拾取共用 |
| **`zCamDistance`** | 相机沿 −Z 相对 `zCurrent` 的后退距离 | **定稿（Phase 7.3）**：常量 **`30`** 世界单位；Zustand 默认与 `mountGalaxyScene` 挂载写入一致，**不再**按 `zSpan` 公式计算（见 `galaxyInteractionStore.ts`、`scene.ts`） |

**相机世界 Z 关系（宏观 idle 态）**：

\[
\text{camera.position.z} = z_{\text{Current}} - z_{\text{CamDistance}}
\]

* **挂载时**与 **RAF `tick`** 中 `selectionPhase === 'idle'` 的每一帧重置一次，使相机与 store 单向对齐。  
* **非 idle（选中飞入 / 特写）**：不再用 `zCurrent - zCamDistance` 覆盖 `camera.position.z`，避免打断飞入动画；Timeline bridge 改为 **`camera.position.z + zCamDistance`** 推导「等效时间轴读数」。

#### **1.4.2 相机初始位置**

* **X, Y**：`meta.xy_range` 的中心点（`(x_min + x_max) / 2`、`(y_min + y_max) / 2`）。  
* **Z**：由 §1.4.1 关系计算得 **`camera.position.z = zLo - zCamDistance`**（不再使用旧的"`z_range[0] - 2`"固定偏移）。  
* **朝向**：始终看向 **+Z 方向**（向未来），`GALAXY_CAMERA_EULER = Euler(0, π, 0, 'YXZ')`，**运行期恒定不变**（与 Design Spec §2.1 一致）；**严禁**将目测 yaw / pitch 补偿（如 -15° / -7.5°）写入代码常量（Phase 5.1.4 硬约束）。

#### **1.4.3 滚轮与拖拽控制**

* **滚轮双模式**（Phase 5.1.5）：  
  * **宏观 idle 态**：滚轮修改 **`zCurrent`**（受 `[zLo, zHi]` clamp），随即同帧写 `camera.position.z = next - zCamDistance`，减少一帧延迟感。  
  * **非 idle（选中飞入 / 特写）**：滚轮直接调节 `camera.position.z`，保留 Phase 4.5 的特写推拉体验。  
  * 控制函数暴露 **`getMacroZWheel?: () => boolean`** 钩子；缺省视为 true。  
* **滚轮步长初值**：每刻度约 **0.5**（半年），在开发阶段按实际视觉效果调整。  
* **拖拽**：仅执行 truck / pedestal（XY 平移），Rotation 恒定。

#### **1.4.4 Clamp（相机运动约束）**

* **`zCurrent`** 限制在 **`[zLo, zHi] = sorted(meta.z_range)`** 内。  
* **相机 XY** 限制在 **`meta.xy_range`** 加 **padding = 0.08 × 轴跨度**；`clampGalaxyCameraXY` 在拖拽回调与每帧 tick 均被调用，全相位一致。

#### **1.4.5 近远裁面（Phase 8 定稿）**

* **near**：**0.05**  
* **far**：**1e6**（大跨度 Z 与相机推拉余量；见 `scene.ts` `PerspectiveCamera` 构造）

旧版文档曾记 **0.1 / 300**；以**源码**为准。

#### **1.4.6 DPR 兼容性约束（Phase 5.1.4.7 · H-G）**

在 **`window.devicePixelRatio > 1`**（Windows 显示缩放 125% / 150% 等）下，`WebGLRenderer` / `EffectComposer` 的 pixelRatio 处理必须严格同步，否则会出现**画面右下裁切**与"主轴非 Z 平行"的**错觉**（用户曾在 Phase 5.0 评估中报告 T1，Rev 3 锁定为 DPR 问题）。

**强制约束**（实现于 `scene.ts`）：

1. **顺序**：`renderer.setPixelRatio(pr)` **必须早于** `renderer.setSize(w, h, ...)`；composer 侧在同次 resize 中同步 **`composer.setPixelRatio(pr)`**。  
2. **`EffectComposer` 显式对齐**：不得依赖 `EffectComposer` 构造时继承的 pixelRatio 默认值；每次 resize 都显式 `setPixelRatio`。`UnrealBloomPass.setSize(w, h)` 入参为 **CSS 尺寸**（composer 内部再乘以 pixelRatio）。  
3. **CSS 尺寸交由 Three.js 维护**：`renderer.setSize(w, h, true)`（`updateStyle=true`）或等效手动 CSS 同步，避免 drawing buffer 与 canvas CSS 尺寸比例错位。  
4. **DPR 变化兜底**：RAF `tick` 中比对 `renderer.getPixelRatio()` 与 `Math.min(window.devicePixelRatio, 2)`，不一致则重新调用 resize 流程（处理运行中跨显示器拖拽或 Windows 缩放变化）。  
5. **pixelRatio 上限**：`Math.min(window.devicePixelRatio, 2)`，避免在 3x 高 DPI 下 Bloom 多 pass RT 爆显存。  
6. 星系材质（idle/active shader）的 **`uPixelRatio`** 与 `pr` 同步，保证屏幕空间尺度一致（若与 Points 测试路径并存，同规则）。

**非目标 / 禁止**：任何将目测 `-15° / -7.5° / 0.26180 / 0.13090` 等旋转值写入 `GALAXY_CAMERA_EULER` 或相机常量的"症状掩盖"式修复。

#### **1.4.7 首屏加载体验**

* 显示**全屏 Loading**（Spinner + 可选进度：gzip 下载 / 解压或透明解码 / JSON 解析阶段文案）。  
* 前端必须**全量解析**宇宙数据（默认 **`galaxy_data.json.gz`**，见 §5.1）完毕后，才初始化 Three.js 场景并移除 Loading 覆盖层。  
* 加载失败时提供**错误提示与重试**（Phase 7 自用验收路径）。

### **1.5 交互拾取（Phase 8.4：active `InstancedMesh` + 世界球）**

生产路径**不再**对 `THREE.Points` 主拾取；**仅**对 **`galaxyActive`** 使用 `Raycaster` 时，引擎给出的网格命中**不能**直接反映 `instanceMatrix` 的顶点缩放量，故实现采用 **`screenRadius.ts` 中的世界空间球/半径** 与 `pickClosestActiveMovieAlongRay`：**射线与每颗「active 尺度下」世界球求交**，取最近合法命中，并与 shader 的 `sActive` / `inFocus` **同构**。

| 环节 | 规则 |
| :---- | :---- |
| **主拾取对象** | `galaxyActive`（`InstancedMesh`）；**idle 不作为**可点目标 |
| **Slab / inFocus 门控** | 与 §1.1 一致；采纳拾取时须 **`inFocus > 0.5`**（与《星球状态机 spec》及《视觉参数总表》一致），等同「只与条带内 active 可交互区」 |
| **hover 环** | **HTML overlay**（`HoverRing`），**无 CSS transition**，与 Tooltip 同节奏显隐 |
| **历史：Points** | 旧版对 `Points.threshold` 的估算与 A/B 层过滤见归档讨论；`interaction.ts` 中 `computePointScreenRadiusCss` 等**仅**供基准/遗留对照 |

**假设与局限**：active 在条带外趋近零尺度时极难点中，属预期；若 T6 类问题再现，可收紧容差或第二近邻（见《Phase 8 基线 P8.0 性能与 P8.4 准入》）。

## **2\. 核心坐标生成算法 (Coordinate Generation)**

### **2.1 X/Y 平面生成 (UMAP 预计算)**

二维语义坐标的 (X, Y) 在 Python 管线中**预计算**后写入 `galaxy_data.json`。**UMAP 实现后端**分为两条路径，由运行参数选择（`scripts/run_pipeline.py` 的 `--umap-backend` / `--cpu` 等），二者**不保证** bitwise 一致；**任意更换后端**须 bump 宇宙数据版本并在变更中注明。

* **Backend: `umap-learn`（CPU，Windows 本地回退）**：在 **Windows** 侧 **`.venv`** 与 `pip` 依赖（`requirements.txt` → `requirements.cpu.txt`）上运行。适合小样本、无 NVIDIA GPU、或仅做清洗与联调。  
* **Backend: RAPIDS cuML（GPU，WSL2 Ubuntu 主路径）**：在 **WSL2** 的 conda 环境 **`chronicle`**（由 `scripts/env/rapids_env.yml` 创建）中，通过 `cuml.manifold.UMAP` 计算，典型用于全量与 **DensMAP** 等需要 GPU 的超参；数据与代码宜放在 WSL 文件系统，产物可同步回 Windows 工作区见 `scripts/env/sync_artifacts_to_windows.sh`。

* **输入特征 (Input Features)**：  
  1. **剧情文本**：overview \+ tagline，通过 NLP 模型生成 Embeddings（**规范见下节 2.1.1**）。  
  2. **流派分类 (genres)**：采用**顺位加权编码 (Rank-Weighted Encoding)**；顺位权重为**等比衰减**，**现行默认公比为黄金比例** \(q=1/\varphi\)（**见下节 2.1.2**）。  
  3. **文化锚点 (original\_language)**：执行 One-hot 编码。  
* **UMAP 超参数**：`n_neighbors`、`min_dist`、`metric` 等**不在此文档锁死数值**；由实验阶段**手动调参**，并将最终取值写入运行配置与产物元数据（与宇宙数据版本号一并记录）。  
* **UMAP 随机种子（可复现）**：`umap-learn` 与 **cuML** 调用中均须传入 **`random_state=42`**（固定整数，**不可省略**）。同一套输入特征、超参与**同一后端**下，重跑管线应得到**稳定可比对**的 (X, Y) 拓扑（在相同 `torch` / `numpy` 及 **`umap-learn` 或 `cuml` 等版本**前提下的各自语义下）。`umap-learn` 与 `cuml` 之间、或库大版本升级导致的数值漂移，须在变更日志中注明；**故意**更换 `random_state` 视为新宇宙版本，须 bump 版本号并重新 `fit`/`fit_transform`。该值须写入 `meta.umap_params.random_state`。  
* **排除字段**：绝对排除 release\_date、vote\_count、vote\_average、revenue、budget 以及具有强共线性的 spoken\_languages 和 production\_countries。  
* **数据驱动原则**：genre 集合、language 集合及其对应的向量维度（N\_genre、N\_lang）均须在管线运行时**从当前数据源动态计算**，严禁写死为常量。所有依赖这些维度的下游数值（如 `1/√d` 缩放因子、色板 hueStep、One-hot 编码宽度等）也必须跟随动态计算。此原则同样适用于 `vote_count`/`vote_average` 的值域边界——映射函数的输入范围由实际数据的 min/max 决定，不可硬编码。

### **2.1.1 文本 Embedding 规范（overview + tagline）**

本节为**可执行约定**：实现与复现时须按此处固定模型、输入形态与归一化策略；更换其中任一项须视为**新宇宙版本**（与 UMAP 模型一并版本化）。

* **语言策略**：**保留所有语言的 overview**（不对 overview 做「仅英语」过滤）。TMDB 为多语言简介混布，须使用**多语言句向量模型**；不得使用纯英文句向量模型（如 `all-MiniLM-L6-v2`）作为主模型，否则非英语条目在语义空间中会被系统性扭曲，验证结论不可靠。  
* **模型分档（按项目阶段）**：  
  * **阶段 A — 轻量化验证（subsample、管线联调、算力/耗时优先）**：`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`。输出稠密向量维度 **384**。允许牺牲部分语义质量以换取速度与低显存占用。  
  * **阶段 B — 质量版（全量或周期性宇宙重构）**：`sentence-transformers/paraphrase-multilingual-mpnet-base-v2`。输出稠密向量维度 **768**。在流程跑通后，用同套清洗与特征拼接规则替换本模型，再执行 `fit_transform` 或全量重算。  
* **实现栈**：Python 侧统一使用 **`sentence-transformers`** 加载上述 Hugging Face 模型 ID；编码时**优先使用 GPU**（如 NVIDIA RTX 3070 级别）。`encode` 的 `batch_size` 建议从 **64** 起试，显存充足可逐步提高至 **128～256**；出现 OOM 则下调 batch，而非静默丢样本。  
* **PyTorch 与 CUDA（GPU 环境）**：`sentence-transformers` 依赖 PyTorch。若只执行 **`pip install -r requirements.txt`** 且未额外指定 PyTorch 官方 CUDA 索引，pip 通常会从 PyPI 解析到 **CPU 构建**（`torch.__version__` 带 **`+cpu`** 后缀，`torch.version.cuda` 为 **`None`**，`torch.cuda.is_available()` 为 **`False`**），无法满足上条「优先 GPU」的约定。  
  * **本机有 NVIDIA GPU、需要 GPU 跑 embedding 时**：须按 [PyTorch Get Started](https://pytorch.org/get-started/locally/) 选择 **Windows / Pip / 合适 CUDA 版本**，使用其给出的 **`--index-url https://download.pytorch.org/whl/cu…`** 安装 **`torch`（及官方建议捆绑的 `torchvision` / `torchaudio`）**。仓库当前开发机基准为 **CUDA 12.8 线**，示例（在项目 venv 内）：`pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128`。成功后 **`torch.__version__` 应含 `+cu128`（或所选 cu 标签）**，且 **`torch.cuda.is_available()` 为 `True`**。驱动版本须满足所选 CUDA 簇的最低要求；若驱动偏旧，在官网改选较低 CUDA 对应的索引（如 `cu126`、`cu118`）。  
  * **无 GPU 或仅需 CPU 验证**：可继续使用 PyPI 上的 CPU 构建；须在运行配置或产物元数据中注明 **CPU**，避免与 GPU 产出的宇宙数据在无说明的情况下混比。  
* **输入拼接（单条影片一条文本）**：  
  * 若 `tagline` 非空：拼接为两行结构 —— 第一行固定前缀 `Tagline:` \+ tagline 原文；第二行固定前缀 `Overview:` \+ overview 原文。  
  * 若 `tagline` 为空或仅空白：仅使用 `Overview:` \+ overview 原文。  
  * **截断**：在送入模型前对**拼接后的整段字符串**做单次截断，**保留开头、截掉超出部分**（即从尾部截断）。默认最大长度 **3000 字符**（UTF-8 下按字符计数，与 Python 字符串长度一致）；若 subsample 试验需进一步提速，可临时改为 **2000**，但须在产物元数据中注明该参数。  
* **向量归一化**：对模型输出的每条 embedding 做 **L2 归一化**（`sentence-transformers` 中 `normalize_embeddings=True` 或与等价实现），并在全项目保持一致，便于跨阶段对比与增量追加时的数值尺度稳定。  
* **可复现与版本锁定**：在 `requirements.txt`（或等价锁文件）中固定 **`torch`、`sentence-transformers`** 的主次版本；流水线配置中记录所用**模型 Hugging Face ID**；若需严格 bitwise 可复现，可额外记录模型仓库的 **Git revision**。记录 `torch` 时建议写入 **完整构建标签**（例如 **`2.11.0+cu128`** 与 **`2.11.0+cpu`** 主次版本相同但二进制不同），与上条安装来源一致。更换 `torch` / `sentence-transformers` / 模型任一项时，在变更日志中标注**宇宙数据版本号**。

### **2.1.2 流派顺位权重（等比衰减 · 默认黄金比例）**

TMDB 中一条影片可出现 **任意多个**流派标签（按 API 给定顺序作为顺位 \(k=1,2,3,\ldots\)）。权重须在无限顺位上**单调递减**，避免高阶标签与主标签抢权重。

* **现行默认（等比 + 黄金比例）**：设 \(\varphi=(1+\sqrt{5})/2\)，公比 **\(q = 1/\varphi\)**（数值约 **0.6180339887**）。第 \(k\) 顺位权重  
  \[
  w_k = \varphi^{-(k-1)} = q^{\,k-1}.
  \]  
  即 \(w_1=1,\ w_2\approx0.618,\ w_3\approx0.382,\ w_4\approx0.236,\ldots\)，相邻顺位恒满足 \(w_{k+1}/w_k = q\)。  
* **与特征向量拼接**：将各流派的 one-hot（或该流派在嵌入空间中的分量）乘以对应的 \(w_k\) 后**累加**（或按实现约定拼接后再缩放）；具体张量形状与 genres 编码实现一致即可，但**顺位权重必须来自同一套 \(w_k\)**。  
* **可调参（保留未来调整空间）**：公比 **不必写死在业务逻辑里**。实现中应以**单一常量或配置项**暴露（例如 `genre_weight_ratio`，默认等于 `1/φ`）。若日后改为其他 \(q\in(0,1)\) 或改用别的衰减族，须：  
  * 在运行配置与产物元数据中记录 **`genre_weight_ratio`**（及可选的 **`genre_weight_scheme`**，例如 `geometric_phi`）；  
  * 在变更日志中** bump 宇宙数据版本号**（与 UMAP 再训练策略一致）。  
* **视觉层**：宏观主色仍取 **genres\[0\]**；微观混合纹理若使用多流派加权，**建议使用同一组 \(w_k\)**，避免 UMAP 输入与 Shader 各用一套比例。

### **2.1.3 多模态特征融合规范（Multi-modal Feature Fusion）**

三类特征组维度量级差距悬殊（文本 384/768 vs 流派 N_genre vs 语言 N_lang，后两者的维度由数据集中实际出现的去重值数量决定，**不可写死常量**）。若直接拼接，高维组将在距离计算中天然主导，低维组的拓扑贡献被压扁。本节规定拼接前的**逐组归一化与尺度对齐**策略。

* **逐组 L2 归一化**：三组各自独立做 L2 归一化（文本向量已在 §2.1.1 中完成；genres 加权向量与 language One-hot 向量在拼接前亦须各自 L2 归一化），使每组样本的向量模长 = 1。  
* **维度均衡缩放（`1/√d`）**：L2 归一化后，每组再乘以 `1/√d`（d 为该组维度数）。数学依据：两个随机单位向量在 d 维空间中的期望欧氏距离与 d 无关（恒 ≈ √2），但拼接后高维组在**总平方距离**中占的份额与 d 成正比；`1/√d` 恰好将每组的平方距离期望贡献拉齐。  
* **可调模态权重乘子**：在 `1/√d` 缩放之上，再暴露三个可调权重 `w_text`、`w_genre`、`w_lang`（默认均为 **1.0**），作为管线配置项。若实验中发现「文本过强、流派星团不明显」，可提升 `w_genre`；反之亦然。  
* **最终拼接伪代码**：

  ```python
  combined = np.concatenate([
      text_vec  * (1 / sqrt(d_text))  * w_text,
      genre_vec * (1 / sqrt(d_genre)) * w_genre,
      lang_vec  * (1 / sqrt(d_lang))  * w_lang,
  ], axis=1)  # → 送入 UMAP
  ```

* **版本化**：三个权重值须写入 `meta`（`feature_weights: { text: 1.0, genre: 1.0, lang: 1.0 }`）；修改任一权重须 bump 宇宙数据版本号。

### **2.2 Z 轴深度生成 (时间映射)**

* **绝对小数年份法 (Decimal Year)**：在前端或预处理中，将 release\_date 转换为小数格式以实现无断层映射。  
  * 公式：Z \= 年份 \+ (当前日期在当年天数 \- 1\) / 当年总天数。  
* **Z 轴不做归一化 / 缩放**：保留原始小数年份值（约 1900–2025，跨度 ~125），**不**将其压缩至 X/Y 同量级范围。这是有意为之——Z 轴远大于 X/Y 的跨度能营造"在时间长河中浏览"的纵深感，历史空白年代的空旷也应如实保留。前端相机的 near/far 平面与滚轮步进需适配此量级。  
* **时间偏移噪音 (Temporal Jittering)**：识别占位符数据（如 YYYY-01-01），在 \[.0000, .9999\] 范围内注入小数偏移量，打散重叠节点。**不剔除占位符日期**——采用 Jitter 而非删除，保证这些影片仍然出现在宇宙中。  
  * **可复现性要求**：Jitter 必须为**确定性**——以每部影片的 **TMDB `id`** 作为随机种子（例如 `rng = np.random.default_rng(seed=tmdb_id)`），保证同一影片在不同管线运行中获得相同的 Z 偏移。这是未来增量 `.transform()` 的前提——已有影片的 Z 坐标不可在重跑时漂移。

## **3\. 数据生命周期流水线 (Data Pipeline)**

后端算法模块需遵循三个阶段的运行机制：

### **3.1 创世大爆炸 (全量初始化)**

* 剔除缺失核心特征（简介、流派）的劣质数据。  
* 投入全量数据执行 UMAP .fit\_transform() 计算初始 (X, Y) 坐标。  
* **关键输出**：导出静态坐标库，并**深度序列化保存 UMAP 模型文件 (.pkl / .joblib)**。

### **3.2 新星降临 (每日增量更新) — 未来计划，当前不实现**

* 当前阶段使用 Kaggle 静态 CSV 做一次性全量处理，不涉及增量管线。  
* 未来规划：定时拉取 Kaggle TMDB Daily Updates → diff 新增 → 执行裁剪 + embedding → 加载序列化 UMAP 模型执行 `.transform()` → 追加坐标，保障历史拓扑不变。

### **3.3 宇宙重构 (周期性全量校准) — 未来计划，当前不实现**

* 未来每半年或触发概念漂移时执行。丢弃旧 UMAP 模型，合并历史与增量数据，重新执行 `.fit_transform()`，刷新整个宇宙的拓扑骨架。  
* **概念漂移触发条件（初步）**：TMDB genres 集合出现**新增流派**时，视为概念漂移的明确信号（原有 genres 编码维度不再匹配）。其他定量触发阈值暂未确定，留待积累增量数据后补充。

## **4\. 输出数据 Schema（Python → 前端契约）**

Python 管线的最终产物为**一个 JSON 文件**，前端一次性加载后拆分到 GPU Buffer 与 DOM HUD 两层。文件需 gzip 压缩后随静态资源部署。

### **4.1 顶层结构**

```jsonc
{
  "meta": { /* §4.2 元数据 */ },
  "movies": [ /* §4.3 每条电影对象的数组 */ ]
}
```

### **4.2 `meta` 元数据块**

| 字段 | 类型 | 说明 |
| :---- | :---- | :---- |
| `version` | string | 宇宙数据版本号，格式 `YYYY.MM.DD` 或语义版本 |
| `generated_at` | string (ISO 8601) | 本文件的生成时间 |
| `count` | int | `movies` 数组长度 |
| `embedding_model` | string | 所用 sentence-transformers 模型 HF ID |
| `umap_params` | object | `{ n_neighbors, min_dist, metric, random_state, densmap, ... }` 实际使用的 UMAP 超参；**`random_state` 固定为 `42`**（见 §2.1）；**`densmap`** 为 **bool**（`true`/`false`），与 Phase 2.4 `umap_projection.py` 及导出入口是否传入 **`--densmap`** 一致，表示是否启用 DensMAP |
| `genre_weight_ratio` | float | 流派权重公比（默认 ≈0.618） |
| `genre_palette` | object | **genre 名 → sRGB hex 色值** 映射表，例如 `{ "Drama": "#E74C3C", ... }`。源色彩空间为 **OKLCH**（规则见 Design Spec §1.1），管线中转为 sRGB hex 后写入此处。**HUD swatch** 与兼容用途 |
| `has_genre_hue` | bool \| undefined | **Phase 8.1**：为 **`true`** 时，每条 `movies[i]` **应**含 **`genre_hue`**（弧度 \([0, 2\pi)\)），GPU 宏观/focus 路径优先消费 hue + 均匀 L/C；与 `genre_color` **双字段共存**直至下一大版本移除旧字段（见《搜索与 select 态联合 spec 草案》末「待办」） |
| `feature_weights` | object | `{ text: 1.0, genre: 1.0, lang: 1.0 }` §2.1.3 多模态融合的权重乘子 |
| `z_range` | `[float, float]` | 数据集中 Z 轴（小数年份）的 `[min, max]`，供前端相机初始化与 clamp |
| `xy_range` | `{ x: [min, max], y: [min, max] }` | UMAP 坐标的实际值域，供前端归一化或相机边界设置 |

### **4.3 `movies[i]` 单条电影对象**

分为**三组**字段：GPU 渲染层直接消费、HUD DOM 层展示、逻辑/关联。

#### **A. GPU 渲染层（加载后写入 BufferAttribute）**

| 字段 | 类型 | 来源 / 计算方式 | 说明 |
| :---- | :---- | :---- | :---- |
| `x` | float | UMAP 输出坐标 | 语义平面 X |
| `y` | float | UMAP 输出坐标 | 语义平面 Y |
| `z` | float | `release_date` → 小数年份（含 Jitter） | 时间纵深 |
| `size` | float | `log10(vote_count + 1)`，再线性映射到 `[size_min, size_max]` | **InstancedMesh** 世界尺度链中的 **`aSize`** 来源（与 `uSizeScale`×`u*SizeMul` 相乘）；值域与管线映射同前（**可调**） |
| `emissive` | float | `vote_average` 线性映射到 `[emissive_min, emissive_max]` | 资产中可保留；**P8.4 宏观 mesh** 片元主路径用 **`voteNorm = vote_average/10`** 与 OKLab **L** 混色（见 `galaxyMeshes.ts`）。Bloom 仍受 §1.2 阈值约束 |
| `genre_hue` | float | Pipeline 按流派 index 分配等距色相，**弧度** \([0, 2\pi)\)（与导出 `build_genre_palette` 一致） | **P8.1+**：GPU `hue` attribute；缺省时前端 `hueFromGenreColor(genre_color)` |
| `genre_color` | `[float, float, float]` | `genres[0]` 查 `meta.genre_palette` → 转 RGB 归一化 `[0-1]` | **兼容 / HUD**；无 `genre_hue` 时前端可用 `hueFromGenreColor` 回推 hue（见 Vitest） |

#### **B. HUD / DOM 展示层**

| 字段 | 类型 | 说明 |
| :---- | :---- | :---- |
| `title` | string | 电影标题（Tooltip + 抽屉） |
| `original_title` | string | 原始语言标题 |
| `overview` | string | 剧情简介全文 |
| `tagline` | string \| null | 宣传标语（可空） |
| `release_date` | string (`YYYY-MM-DD`) | 精确日期文本展示 |
| `genres` | string[] | 全部流派名称（按顺位排列） |
| `original_language` | string | 原始语言代码 |
| `vote_count` | int | 评价人数 |
| `vote_average` | float | TMDB 评分 |
| `popularity` | float | TMDB 热度 |
| `imdb_rating` | float \| null | IMDb 评分 |
| `imdb_votes` | int \| null | IMDb 评价人数 |
| `runtime` | int \| null | 片长（分钟） |
| `revenue` | int | 票房（0 表示未收录） |
| `budget` | int | 预算（0 表示未收录） |
| `production_countries` | string[] | 出品国家 |
| `production_companies` | string[] | 出品公司 |
| `spoken_languages` | string[] | 对白语种 |
| `cast` | string[] | 演员（已按顺位截取，建议 ≤ 20 人精简体积） |
| `director` | string[] | 导演 |
| `writers` | string[] | 编剧 |
| `producers` | string[] | 制片人 |
| `director_of_photography` | string[] | 摄影指导 |
| `music_composer` | string[] | 配乐 |
| `poster_url` | string | 完整海报 URL（Python 侧拼装 `https://image.tmdb.org/t/p/w500` + `poster_path`） |

#### **C. 逻辑 / 关联层**

| 字段 | 类型 | 说明 |
| :---- | :---- | :---- |
| `id` | int | TMDB ID，作为 Raycaster 拾取与数据绑定的唯一键 |
| `imdb_id` | string \| null | 用于拼接 IMDb 外链 (`https://www.imdb.com/title/{imdb_id}/`) |

### **4.4 体积与加载说明**

以 ~60K 条为例：纯 JSON 原始常见量级为**数十 MB**；经 gzip 后的体积随字段丰富度、字符串长度与压缩级别变化。**不对 `galaxy_data.json.gz` 设体积硬性上限**；首包与托管成本以实际网络环境与 `meta.count` 为准。若需减轻传输或解析压力，可考虑：  
* **拆分**：GPU 字段抽为独立 binary buffer（Float32Array dump），HUD 字段按需懒加载。  
* **裁剪 cast**：截取前 10 人（而非 20）可减轻一部分文本体积。  
* **当前阶段不做此优化**，优先跑通。

## **5\. 部署架构**

### **5.1 当前阶段（产品验证期）**

纯静态前端部署，**无后端服务**：

```
[Python 本地管线]
    ↓ 产出
galaxy_data.json (gzip)    ← §4 定义的 Schema
    ↓ 放入
前端项目 public/data/
    ↓ 部署
Vercel / Netlify / GitHub Pages（静态托管）
```

* Python 管线在**本地手动执行**（清洗 → embedding → UMAP → 导出 JSON + gzip），大体积 **`galaxy_data.json.gz`** 可提交到 `frontend/public/data/` 或由 CDN 提供。  
* 前端默认 **`fetch(BASE_URL + 'data/galaxy_data.json.gz')`** 一次性加载；按 **gzip 魔数**与 **HTTP 透明 gzip** 分支处理后再 `JSON.parse`；Loading 完成后初始化 Three.js 场景（实现见 `frontend/src/data/loadGalaxyGzip.ts`、`frontend/src/utils/loadGalaxyData.ts`）。  
* **静态托管**：**GitHub Pages**（本仓库已配 Actions 构建部署）或 **Vercel / Netlify** 等；注意子路径部署时 Vite `base` 与资源 URL 一致。

### **5.2 未来阶段（自动化数据管线）**

```
[定时任务 / GitHub Actions Cron]
    ↓ 每日
拉取 Kaggle TMDB Daily Updates → diff 新增条目
    ↓
执行筛选 + embedding + UMAP .transform()
    ↓
追加至 galaxy_data.json → 推送至 CDN / 触发前端重新部署
```

* 优先用 **GitHub Actions** 的定时 Cron 触发（免费、无需自建服务器），在 Action 中拉 Kaggle 数据并跑 Python 管线。  
* 产物通过 `git push` 或上传至对象存储（如 R2 / S3），前端自动获取最新版本。  
* **当前阶段不实现**，仅预留此架构方向。

## **6\. 项目目录结构**

```
chronicle_v3_3d_galaxy/
│
├── data/                           # ⛔ 不进 npm 包，Python 侧管理
│   ├── raw/                        #   原始 CSV（gitignore 大文件，或 LFS）
│   └── subsample/                  #   随机子集，供快速调试
│
├── docs/
│   ├── project_docs/               #   PRD / Tech Spec / Design Spec 等
│   └── reports/                    #   数据集质量报告等
│
├── scripts/                        # Python 数据管线
│   ├── _archive/                   #   Phase 1.0：旧版独立过滤脚本归档（仅参考）
│   ├── feature_engineering/        #   embedding / genre 编码 / UMAP
│   └── export/                     #   导出 galaxy_data.json
│
├── frontend/                       # 前端项目根目录
│   ├── public/
│   │   └── data/                   #   galaxy_data.json（管线产物放这里）
│   ├── src/
│   │   ├── components/             #   React 组件（HUD、Tooltip、Drawer、Loading）；各组件旁或子目录内放 *.stories.tsx
│   │   ├── three/                  #   原生 Three.js 模块
│   │   │   ├── scene.ts            #     场景、renderer、postprocessing、WebGL2 断言
│   │   │   ├── galaxyMeshes.ts     #     P8.4 双 InstancedMesh（idle + active）
│   │   │   ├── planet.ts           #     focus Perlin 球 `Icosahedron(1,6)` + 阈值
│   │   │   ├── camera.ts           #     truck/pedestal、滚轮、`setFocusCameraPosition`
│   │   │   ├── interaction.ts      #     active mesh 拾取、hover/click
│   │   │   └── shaders/            #     GLSL
│   │   │       ├── galaxyIdle.vert/frag.glsl, galaxyActive.vert/frag.glsl
│   │   │       ├── perlin.vert/frag.glsl, oklab.glsl
│   │   │       └── point.vert/frag.glsl   # 基准 / 测试，非主场景
│   │   ├── store/                  #   Zustand store（React ↔ Three.js 桥）
│   │   ├── hooks/                  #   React hooks
│   │   ├── utils/                  #   数据解析、格式化等
│   │   ├── types/                  #   TypeScript 类型定义（含 §4 JSON Schema 的 TS 接口）
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .storybook/                 #   Storybook 配置（main.ts、preview.ts 等）
│   ├── index.html
│   ├── vite.config.ts              #   Vite 构建配置
│   ├── tsconfig.json
│   └── package.json                #   含 storybook / build-storybook 脚本
│
├── requirements.txt                # Python 依赖
└── README.md
```

### **6.1 开发规范（轻量级，个人项目适用）**

* **语言**：前端 **TypeScript**（严格模式）。Python 侧使用 type hints。  
* **构建工具**：**Vite**（快速 HMR、原生 ESM、GLSL 文件可通过 `vite-plugin-glsl` 导入）。  
* **Storybook**：与 Vite 栈对齐，使用 **`@storybook/react-vite`**；`npm run storybook` 用于本地开发 HUD，`npm run build-storybook` 可选用于静态部署组件目录页。  
* **代码风格**：ESLint + Prettier，采用默认推荐规则集即可，不必自定义过多规则。  
* **Git**：  
  * `data/raw/` 下的大文件加入 `.gitignore`（或 Git LFS）。  
  * `frontend/public/data/`：推荐 Git **仅跟踪** `galaxy_data.json.gz`；未压缩 `galaxy_data.json` 由管线本地生成并 **gitignore**（见仓库根 `.gitignore`）。  
  * Commit message 无强制格式，保持简洁可读即可。

## **7\. 浏览器兼容性**

| 要求 | 说明 |
| :---- | :---- |
| **最低要求** | **WebGL 2.0**（Three.js r163+ 默认 WebGL2 renderer）。覆盖 Chrome 56+、Firefox 51+、Safari 15+、Edge 79+（即 2022 年后的主流桌面浏览器均支持） |
| **移动端** | **不作为主要适配目标**。项目核心交互（滚轮穿梭、hover tooltip、拖拽平移）依赖鼠标，移动端体验天然受限。若移动端能打开且基本渲染正常即为 bonus，不投入专门的触控适配 |
| **降级策略** | 若浏览器不支持 WebGL 2.0，显示一个**静态提示页**（"请使用现代桌面浏览器访问"），不做 WebGL 1.0 降级（维护成本 >> 收益） |

## **8\. 无障碍 / 可访问性**

作为以 3D 视觉交互为核心的个人项目，完整的 WCAG 2.1 AA 达标**不作为当前目标**。但以下**低成本高收益**的措施应予保留：

* **语义 HTML**：HUD 层（React DOM）使用合理的 heading 层级、`<button>` / `<a>` 等语义标签，而非全部 `<div>`。  
* **键盘可达**：档案抽屉的关闭按钮、外链按钮等 DOM 交互元素确保可通过 Tab 键聚焦。  
* **色彩对比度**：HUD 文字（标题、评分等）与背景之间保持足够对比度（深色背景上使用浅色文字）。  
* **alt 属性**：海报 `<img>` 标签带 `alt="{movie title} poster"`。  
* **3D 场景**：WebGL Canvas 本身不具备无障碍语义，不做额外的 ARIA 标注（投入产出比极低）。

## **9\. 测试策略**

个人项目以**快速迭代**为主，不追求覆盖率指标。测试重心放在**数据正确性**、**DOM 层 UI 的隔离开发与回归**（Storybook）以及 **3D 场景的手动联调**上：

### **9.1 Python 管线**

* **数据校验断言**：管线脚本在关键步骤后加入 `assert` 检查——  
  * 过滤后行数在预期范围内（防止一次性丢弃 >50% 数据时无感知）  
  * 输出 JSON 中 `x`, `y`, `z`, `size`, `emissive` 无 NaN / Inf  
  * `meta.count` == `len(movies)`  
* **subsample 快速冒烟**：使用 `data/subsample/` 的小数据集跑通全管线，验证输出格式正确。  
* 不设单元测试框架；若未来脚本复杂度增长，可引入 `pytest`。

### **9.2 前端（3D 画布 + 全应用联调）**

* **手动交互测试为主**：每次改动后在浏览器中验证——Loading → 粒子渲染 → hover tooltip → click 选中 → 相机推进 → 材质溶解 → 抽屉信息 → 取消回退。  
* **数据加载冒烟**：在 `console` 中打印 `movies.length`、抽样几条检查字段完整性。  
* **TypeScript 类型守卫**：§4 的 JSON Schema 定义为 TS `interface`，加载时做基础运行时校验（例如 `if (!data.meta || !data.movies)` → 弹出错误提示而非白屏）。  
* **3D 部分**：不在 Storybook 中覆盖；依赖上述全应用手动联调。若未来需要回归测试，优先考虑 **Playwright**（可截图对比 3D 渲染结果）。

### **9.3 Storybook（DOM / HUD 层 UI）**

* **确定采用 [Storybook](https://storybook.js.org/)** 开发与验收**非 3D** 的 React UI：Loading 页、Tooltip、档案详情抽屉、错误提示、外链按钮等。  
* **目的**：在**不挂载 Three.js** 的前提下隔离调试布局、字体、动效与多状态（空 tagline、缺海报、长 overview、多流派列表等），并作为组件文档供日后迭代。  
* **约定**：每个可复用 HUD 组件配套 `*.stories.tsx`；Story 内用**固定 mock 数据**（可从 `data/subsample/` 抽一条或几条合成），避免依赖真实 `galaxy_data.json` 才能预览。  
* **与 Vite**：使用 `@storybook/react-vite`（与 §6 构建栈一致）。  
* **不设** Storybook 与 3D 的联合 E2E；全应用联调仍归 §9.2。