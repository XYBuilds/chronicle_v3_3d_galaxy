# TMDB 电影宇宙 (Chronicle v3 3D Galaxy) - 项目理解与阶段性审查报告

**生成时间**: 2026-04-14
**基于文档与代码的状态审查**

---

## 1. 项目全局理解

### 1.1 产品愿景与定位
本项目是一个基于近 60,000 条 TMDB 电影数据的“2.5D 时空立方体”电影历史档案库可视化 Web 应用。通过将极其复杂的电影多维属性（剧本语义、题材、评价体系、商业表现、历史时期）映射为 3D 宇宙中的物理特征，打破传统 2D 图表，实现沉浸式的“宏观漫游 → 视觉寻宝 → 微观检视”三层体验。

### 1.2 核心算法与视觉映射规则
产品的生命力在于精确的降维算法和克制的视觉映射隔离原则：
- **XY 语义平面 (UMAP)**：融合了文本 Embedding（概述+宣传语提取）、顺位等比衰减的流派特征（黄金分割比 $1/\varphi$）、以及 One-hot 编码的语种特征。并在融合前通过 $1/\sqrt{d}$ 进行了严格的特征量级重权。
- **Z 维度 (时空轴)**：与语义解耦，单纯由上映时间的小数年份决定，并附加确定性 Jitter 解决同一天上线的重叠。
- **视觉映射**：
  - **体积 (Size)**：评价人数（对数缩放，体现共识的广度）。
  - **发光度 (Emissive)**：平分（线性映射，产生高于 1.0 的 HDR 提供泛光，体现口碑的高度）。
  - **色彩 (Color)**：第一流派映射到 OKLCH 空间生成的匀色色板并转换至 sRGB。

### 1.3 技术栈架构
- **后端 (数据管线)**: Python, Pandas, PyTorch (SentenceTransformer `paraphrase-multilingual-MiniLM-L12-v2`), UMAP-learn。
- **前端 (渲染与 UI)**: Vite, React 19, TailwindCSS v4, shadcn/ui, Zustand, 原生 Three.js (WebGL2, 极简 1 Draw Call 的 ShaderMaterial 粒子)。

---

## 2. 当前开发进程分析

根据 `.cursor/plans` 的最新记录与 `docs/reports`，项目正处于极具分水岭意义的阶段。
**当前进度位于：Phase 3 结束，即将进入 Phase 4 交互层开发。**

### 具体已完成事项
1. **Phase 0-1 (数据预处理与清洗)**：
   - 建立了统一管线编排 `run_pipeline.py`。
   - 完成去重、极值剔除、空值处理与多语言 fallback。
   - 实现了精妙的**自适应年度动态分数基线过滤**，排除时代的冗余数据。
2. **Phase 2 (特征工程与 3D 降维)**：
   - MiniLM 多语言文本特征提取，GPU 处理管线已就绪。
   - 完成 Genres (黄金比例加权) 与 Language (One-hot) 处理。
   - UMAP 多模态降维跑通，坐标与 `galaxy_data.json` 导出脚本已完备。
   - **完成 Subsample 冒烟测试（抽出 20 条执行全流程并成功）。**
3. **Phase 3 (前端 Three.js 与 React 骨架)**：
   - React + Tailwind + Zustand 骨架加载完毕。
   - 加载器、容错机制及 JSON 类型校验已完成。
   - Three.js WebGL2 场景搭建，完成**轴平行相机控制器 (Z轴平移、XY Truck/Pedestal，无旋转)**。
   - 粒子渲染宏观系统（ShaderMaterial, gl_PointSize 计算, `discard` 裁切和指数型 Glow）。
   - **Phase 3.6 完成了后处理链路 (`UnrealBloomPass`)。**

### 进行中/待启动事项
- **Phase 4 (HUD 与 三层交互)**: 暂未启动。包括 Raycaster 射线悬停捕捉 (Tooltip)、点击抽屉滑出展示 (Drawer)、时间轴组件 (Timeline)、微观选中的星球过渡动画 (Perlin Noise 材质映射)。
- **全量数据的真正生成**: (详见下文隐患分析)。

---

## 3. 已开发部分评估与潜在问题预警

基于对仓库代码（脚本、Shader、前端机制）及硬盘生成文件的探查，目前已实现代码逻辑非常严密，几乎完全吻合 Tech Spec，但在当前工程切片下，发现以下几个**核心问题与风险点**（需在进入 Phase 4 或之后进行修复与确认）：

### 3.1 [严重] 前后端目前仍处于“ Subsample 冒烟”状态，未跑全量数据
当前 `data/output/cleaned.csv` 大小约为 18KB（仅 16 行被保留的有效数据），生成的 `umap_xy.npy` 等特征数据也是极少量。
- **现状**：Three.js 场景渲染与 Bloom Pass 其实一直是在看十几颗粒子的效果，并没有进行 60,000 级真·海量粒子的全量渲染测试。
- **风险**：
  1. Phase 3.5 中标注了 “1 draw call 完成所有渲染”，但 `gl_PointSize` 与衰减参数配合数万点密集渲染时可能导致 Overdraw 过高拖垮帧数，未曾验证。
  2. Phase 3.6 的 Bloom pass 设置为 `threshold 0.85`, `strength 1.0`。在全量数据聚集堆叠的星云中，可能会导致画面大面积过曝发白并损失星云纹理。
- **建议**：在启动 Phase 4 之前，应在本地环境执行一遍 `--through-phase-2` 对全量数据集 `TMDB_all_movies.csv` 跑一次生成输出，然后开启前端确认真实的宏观渲染表现。

### 3.2 根目录 `package.json` 的模块解析与 DX 问题
- 在 Phase 3.4 期间为了能够在根目录运行 `npm run dev` 强行添加了一个简单的根 `package.json` 代理指令到 `frontend/`。
- **隐患**：对于 Vite 项目和 ESLint 可能产生多根目录解析混淆（例如 VSCode / IDE 的语言服务器在没有根目录 workspace 配置时，可能无法正确检测 types 和 eslint hook）。
- **建议**：这在单仓库个人项目中是小问题，但正确的做法应该是使用 npm workspace (例如在根目录 `package.json` 指定 `"workspaces": ["frontend"]`)，而不是纯手写 bash proxy。

### 3.3 交互逻辑中的边界问题 (相机穿越防护缺失)
- Phase 3.4 控制器实现了相机 Z 轴游走，但**并未对相机漫游边界做出严格夹紧（Clamp）**。
- **结果**：如果通过鼠标滚轮猛烈操作，用户视角可以无限飞退穿出宇宙边界，或者无限进入空白历史之前。
- **备忘**：需要在后续 Phase 4 或者打磨期，关联 `meta.z_range` 实施摄像机的软边界限制 (Spring damping clamping)。

### 3.4 `genre_palette` OKLCH 索引在极少量数据下的缺陷
- 在目前的子集（仅产生了 4-5 个 Genres）中，OKLCH 生成的跨度会被分配。但是根据代码，它根据数据集中实际拥有的 Genre 构建字典进行空间取色。
- 一旦执行全流程，遇到 20 种以上的 Genres，人眼分辨度急剧下降。由于暂未实施“聚类中心按占比排布色彩”的优化算法（受限于阶段简化），全量数据可能会产生非常杂乱的花色星球。

### 3.5 Linter 检查遗漏
- 在 Phase 3.4 报告中提及前端仍存在历史 ESLint 告警（如 `react-refresh/only-export-components`），因为着急推进 Phase 而被无视了。长此以往容易积压产生雪崩，建议找合适的时间清理掉。

---

## 4. 结论与下一步推荐措施

项目的策划与基建极其优秀，严密的规约（如 1 draw call 设计，多模态特征尺度重校准等）是同类开源项目中少见的，Python 侧管线极其成熟。

**建议接下来的首要动作：**
> 在我的授权下，进入终端直接运行真正的全量数据跑通 UMAP 与渲染数据生成。**不要带 `--subset`。**
> 
> ```bash
> python scripts/run_pipeline.py --input data/raw/TMDB_all_movies.csv --through-phase-2
> ```
> 
> 在生成了数十 M 的 gzip 后，在前端目测 Three.js 承载力、性能与 Bloom 过曝情况，进行一次参数调优。确认视觉通过后，再毫无顾虑地切入 Phase 4 的 HUD 数据联动之中。
