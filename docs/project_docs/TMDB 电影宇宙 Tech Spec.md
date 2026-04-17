# **TMDB 电影宇宙 \- 技术实现方案 (Tech Spec)**

## **1\. 系统架构与技术栈**

项目采用严格的前后端计算分离架构：

* **后端/数据处理层 (Python)**：负责数据清洗、NLP 向量化及降维计算（UMAP），输出静态 JSON/Parquet 数据。  
* **前端/渲染层**：  
  * **3D 画布**：原生 **Three.js**（非 R3F / TresJS 等声明式封装），直接控制渲染循环、ShaderMaterial、BufferAttribute 与后处理管线。理由：项目涉及高度自定义的 Points ShaderMaterial、非标准相机控制和性能敏感的 60K 粒子管线，原生 Three.js 可避免中间层的抽象泄漏。  
  * **HUD / UI 层**：**React**（DOM 覆盖层），负责 Tooltip、档案详情抽屉、Loading 页面等。  
  * **状态桥接**：React ↔ Three.js 通过**轻量状态管理**（如 Zustand）通信——Three.js 写入选中/悬停状态，React 读取并渲染 UI；React 写入搜索/导航指令，Three.js 执行相机动画。  
* **数据加载策略**：前端启动时**一次性加载**全量坐标与属性数据（静态 JSON 或等价格式），配合 **Loading 页面**等待加载完成后再初始化 3D 场景。

### **1.1 前端渲染架构（混合 Points + Mesh）**

采用**双层混合渲染**，宏观层高效渲染全部粒子，选中层按需生成高细节球体：

* **宏观层（始终存在）**：一套 **`THREE.Points`** \+ 自定义 **`ShaderMaterial`**。  
  * 全部 ~60K 粒子在 **1 次 draw call** 内完成。每颗粒子通过 `BufferAttribute` 携带 position (x,y,z)、size (对数缩放后的 vote\_count)、color (genres\[0\] 映射色)、emissive (vote\_average 映射强度)。  
  * **vertex shader**：根据 attribute 设置 `gl_PointSize`（考虑 camera distance 衰减）。  
  * **fragment shader**：在 point 方形区域内绘制**圆形 + 径向辉光**，`discard` 四角像素；emissive 强度决定 fragment RGB 峰值（允许 >1.0 HDR），为后处理 Bloom 提供亮度源。  
* **选中层（按需生成）**：用户点击星球后，在该位置叠加一个 **`IcoSphereGeometry`**（detail ≈ 4，约 2.5K 三角形），材质挂 **Perlin Noise ShaderMaterial**。  
  * Perlin Noise 参数（均可调）：**Scale**、**Octaves**、**Persistence**、**edgeSoftness**（控制流派颜色分界的柔和度，增加星球间视觉差异）。  
  * 混合该电影所有 genres 的映射色，权重使用与 UMAP 相同的 \(w_k\) 等比衰减。  
  * 过渡效果：Points 层中对应粒子 alpha 渐出，球体 Mesh alpha 渐入——视觉上"光点凝聚成星球"。

### **1.2 后处理管线（Bloom）**

```
Render Scene (Points + 可选 Mesh)
    ↓
UnrealBloomPass（简单路线）
    ↓
(可选) FXAA / SMAA 抗锯齿
    ↓
Output
```

* **Bloom 方案**：Three.js 内置 **`UnrealBloomPass`**（`EffectComposer` 管线）。  
* **选择性泛光策略**：采用**简单路线**——不对 Layers 做分离渲染。Points fragment shader 中直接将 vote\_average 映射为 HDR 亮度（高分 >1.0、低分 <threshold），`UnrealBloomPass` 的 `threshold` 自然只拾取高亮 fragment。  
* **初始参数（均为可调配置，将随视觉调试迭代）**：  
  * `strength`：**0.8 – 1.2**  
  * `radius`：**0.4 – 0.6**  
  * `threshold`：**0.85**（须与 vote\_average → emissive 映射的值域对齐——以 §4.3A 默认 emissive 映射，P75 评分 ≈ 6.8 对应 emissive ≈ 1.0，threshold 0.85 使大致前 25% 高分影片触发泛光）

### **1.3 性能参考基线（非强制，仅作优化阶段对照）**

开发阶段**不设硬性性能约束**，优先跑通全链路。以下数值仅作为后期优化时的**参考锚点**：

| 指标 | 参考基线 | 备注 |
| :---- | :---- | :---- |
| 帧率 | 60 fps（中端独显） / 30 fps（最低可接受） | 低于 30fps 时 3D 漫游体感明显卡顿 |
| JS 堆内存 | ≤ 300 MB | 60K 条 JSON ≈ 30–50 MB；余量留给 Three.js 对象与海报纹理缓存 |
| GPU 显存 | ≤ 500 MB | Points buffer 极小；主要开销来自 Bloom 多 pass render target 与动态海报纹理 |
| 首屏（白屏→可交互） | ≤ 5 秒 | 已有 Loading 页，用户预期在"加载一个世界" |
| 坐标数据体积 | ≤ 15 MB（gzip 后） | 原始 JSON 约 40–60 MB；gzip 通常压至 8–15 MB |

### **1.4 相机初始配置与首屏加载**

#### **相机初始位置**

* **X, Y**：全部 `movies[]` 的 **UMAP 坐标中位数**（`median(movies.map(m => m.x))`、`median(movies.map(m => m.y))`）；若 `movies` 为空则回退为 `meta.xy_range` 的 AABB 中点（`(x_min + x_max) / 2`、`(y_min + y_max) / 2`）。目的：使相机对准**点云密度中心**，减轻非对称分布下 min/max 中点与视觉质心偏离导致的透视构图偏移（Phase 5.1.4.4 / 方案 3）。  
* **Z**：`meta.z_range[0]`（数据集最早年份）减去一个小偏移（初始建议 **-2**，即最早数据年份再往前约 2 年），确保最早的星球处于视野内可见的前方。  
* **朝向**：始终看向 **+Z 方向**（向未来），Rotation 恒定不变（与 Design Spec §2.1 一致）。

#### **滚轮步长与近远裁面**

以下均为**初始估值**，在开发阶段根据实际视觉效果调整：

* **滚轮步长**：每滚轮刻度移动 Z 轴 **0.5**（对应约半年的时间跨度）。  
* **near**：**0.1**  
* **far**：**300**（Z 轴跨度 ~125 + 足够余量）

#### **首屏加载体验**

* 显示**全屏居中 Spinner**（极简旋转动效），不做确定性进度条。  
* 前端必须**全量解析** `galaxy_data.json` 完毕后，才初始化 Three.js 场景并移除 Loading 覆盖层。  
* 当前阶段**不做**加载失败重试 / 错误提示页。

## **2\. 核心坐标生成算法 (Coordinate Generation)**

### **2.1 X/Y 平面生成 (UMAP 预计算)**

通过 Python 的 umap-learn 计算生成二维语义坐标。

* **输入特征 (Input Features)**：  
  1. **剧情文本**：overview \+ tagline，通过 NLP 模型生成 Embeddings（**规范见下节 2.1.1**）。  
  2. **流派分类 (genres)**：采用**顺位加权编码 (Rank-Weighted Encoding)**；顺位权重为**等比衰减**，**现行默认公比为黄金比例** \(q=1/\varphi\)（**见下节 2.1.2**）。  
  3. **文化锚点 (original\_language)**：执行 One-hot 编码。  
* **UMAP 超参数**：`n_neighbors`、`min_dist`、`metric` 等**不在此文档锁死数值**；由实验阶段**手动调参**，并将最终取值写入运行配置与产物元数据（与宇宙数据版本号一并记录）。  
* **UMAP 随机种子（可复现）**：`umap-learn` 调用中必须传入 **`random_state=42`**（固定整数，**不可省略**）。同一套输入特征与超参下，重跑管线应得到一致的 (X, Y) 拓扑（在相同 `torch` / `numpy` / `umap-learn` 版本前提下）。若因升级库导致 bitwise 漂移，须在变更日志中注明；**故意**更换 `random_state` 视为新宇宙版本，须 bump 版本号并重新 `fit_transform`。该值须写入 `meta.umap_params.random_state`。  
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
| `umap_params` | object | `{ n_neighbors, min_dist, metric, random_state, ... }` 实际使用的 UMAP 超参；其中 **`random_state` 固定为 `42`**（见 §2.1） |
| `genre_weight_ratio` | float | 流派权重公比（默认 ≈0.618） |
| `genre_palette` | object | **genre 名 → sRGB hex 色值** 映射表，例如 `{ "Drama": "#E74C3C", ... }`。源色彩空间为 **OKLCH**（规则见 Design Spec §1.1），管线中转为 sRGB hex 后写入此处。前端渲染与 Shader 共用此色板 |
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
| `size` | float | `log10(vote_count + 1)`，再线性映射到 `[size_min, size_max]` | 粒子半径。初始值 **`size_min = 2.0`**、**`size_max = 25.0`**（`gl_PointSize` 基准值，camera distance 衰减前）。数据经对数变换后的值域由管线从实际 `vote_count` 的 min/max 算出（**不写死**），再线性映射到此区间。**均为可调配置**，须随视觉效果迭代 |
| `emissive` | float | `vote_average` 线性映射到 `[emissive_min, emissive_max]` | Bloom 源亮度。初始值 **`emissive_min = 0.1`**、**`emissive_max = 1.5`**。vote\_average 的输入值域由管线从实际数据的 min/max 算出（**不写死**）。以当前数据集为参考：P75 ≈ 6.8 时 emissive ≈ 1.0，恰好触及 Bloom threshold（§1.2 中 threshold 建议 **0.85**）。**均为可调配置** |
| `genre_color` | `[float, float, float]` | `genres[0]` 查 `meta.genre_palette` → 转 RGB 归一化 `[0-1]` | 宏观层粒子颜色 |

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

### **4.4 体积估算**

以 ~60K 条为例：纯 JSON 原始 ≈ 50–70 MB；gzip 后 ≈ **8–15 MB**。若未来体积膨胀超过参考基线 (15 MB gzip)，可考虑：  
* **拆分**：GPU 字段抽为独立 binary buffer（Float32Array dump），HUD 字段按需懒加载。  
* **裁剪 cast**：截取前 10 人（而非 20）可省 ~15% 体积。  
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

* Python 管线在**本地手动执行**（清洗 → embedding → UMAP → 导出 JSON），产物提交到仓库或上传至 CDN。  
* 前端 `fetch('/data/galaxy_data.json')` 一次性加载，Loading 页等待完成后初始化 Three.js 场景。  
* **推荐托管**：**Vercel**（零配置、自动 gzip/brotli、全球 CDN、免费额度足够个人项目）。

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
│   │   │   ├── scene.ts            #     场景初始化、renderer、postprocessing
│   │   │   ├── galaxy.ts           #     Points 粒子系统 + BufferAttribute
│   │   │   ├── planet.ts           #     选中态 IcoSphere + Perlin Noise Shader
│   │   │   ├── camera.ts           #     自定义相机控制（truck/pedestal/z-scroll/fly-to）
│   │   │   ├── interaction.ts      #     Raycaster + hover/click 事件
│   │   │   └── shaders/            #     GLSL 文件
│   │   │       ├── point.vert.glsl
│   │   │       ├── point.frag.glsl
│   │   │       ├── perlin.vert.glsl
│   │   │       └── perlin.frag.glsl
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
  * `frontend/public/data/galaxy_data.json` 可选：若 <50 MB 可直接提交；若过大则 gitignore 并通过管线产出。  
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