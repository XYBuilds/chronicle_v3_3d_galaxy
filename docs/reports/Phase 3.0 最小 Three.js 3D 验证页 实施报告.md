# Phase 3.0 最小 Three.js 3D 验证页 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 3.0（`p3-verify-3d`）  
> **规范依据**: 开发计划 §「3.0 最小 3D 脚手架」、Tech Spec §4（`movies[i]` 中 `x` / `y` / `z` / `genre_color` 等渲染字段）  
> **报告日期**: 2026-04-12  
> **范围**: 新建 Git 分支、新增可跟踪的纯静态验证页（HTML + Three.js CDN）、与现有管线默认 JSON 路径对齐、本地 HTTP 验收说明与提交记录

---

## 1. 摘要

本次工作落实了开发计划中 **Phase 3.0：最小 HTML + Three.js 脚手架**，用于在引入 Vite/React 完整前端之前，**快速目视确认** Phase 2 导出的 **`galaxy_data.json`** 中 **UMAP 平面（X/Y）** 与 **时间轴（Z）** 是否在三维空间中形成合理点云，且 **粒子颜色** 与 **`genre_color`** 一致。

在用户要求 **先新开 Git 分支再改代码** 的前提下，从 `main` 创建分支 **`phase-3.0-verify-galaxy-3d`**，唯一代码交付为：

- **`scripts/verify_galaxy_3d.html`**：单文件页面，通过 **`<script type="importmap">`** 自 **jsDelivr CDN** 引入 **Three.js r170**（ESM），使用 **`THREE.BufferGeometry` + `THREE.Points` + `THREE.PointsMaterial({ size: 5, vertexColors: true })`**；每条电影将 **`x, y, z`** 写入 **position** attribute、**`genre_color`**（0–1 RGB 三元组）写入 **color** attribute；使用 **`OrbitControls`** 便于绕场景观察。

该页面定位为 **一次性 / 可丢弃验证工具**，不进入后续 Vite 前端工程；与计划中「用完可归档或删除」的表述一致，但当前选择 **纳入版本库** 以便团队复用冒烟步骤。

实现已提交至分支 **`phase-3.0-verify-galaxy-3d`**，提交哈希为 **`8cd740e`**（提交说明：`Add Phase 3.0 disposable Three.js HTML verifier for galaxy JSON point cloud.`）。

---

## 2. 执行操作清单

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 创建 Git 分支 | 分支名：`phase-3.0-verify-galaxy-3d`（从 `main` 检出） |
| 2 | 新增验证页 | `scripts/verify_galaxy_3d.html`：ESM + importmap、多路径 `fetch`、点云渲染、控制台范围打印、加载失败时在页面中央展示错误文案 |
| 3 | Git 提交 | `8cd740e` |

---

## 3. 与开发计划的对照

| 计划项 | 结果说明 |
| --- | --- |
| `<script type="importmap">` 引入 Three.js ESM CDN | 已使用 **jsDelivr** 固定 **`three@0.170.0`**，并映射 **`three/addons/`** → **`examples/jsm/`** |
| `fetch` 加载 Phase 2.6 / 管线产出的 JSON | 支持多候选 URL（见 §4.1），包含计划中的 **`./galaxy_data_subsample.json`** 与当前仓库默认的 **`frontend/public/data/galaxy_data.json`** |
| `BufferGeometry` + `Points` + `PointsMaterial`（`size: 5`, `vertexColors: true`） | 已实现 |
| `x, y, z` → position；`genre_color` → color | 已实现；加载时对 **非有限** `x/y/z` 与缺失 **`genre_color`** 会 **抛错** 并提示 |
| `OrbitControls` | 已从 **`three/addons/controls/OrbitControls.js`** 导入并 **`enableDamping`** |
| Console：`Loaded {n} points \| X:[…] Y:[…] Z:[…]` | 已实现（数值保留三位小数） |
| 计划：`python -m http.server 8080 --directory data/output/` | **仍适用**：将本 HTML 与重命名后的 **`galaxy_data_subsample.json`** 一并放入 **`data/output/`**（该目录被 **`.gitignore`**，需本地自备文件）；页面内底部 **hint** 说明了该流程 |
| 计划：页面路径写 `scripts/verify_galaxy_3d.html` 或 `data/output/` | 仓库内 **可跟踪** 路径为 **`scripts/verify_galaxy_3d.html`**；`data/output/` 仅作本地拷贝目标 |

---

## 4. 实现要点（便于复核）

### 4.1 JSON 加载策略（多路径 `fetch`）

验证页按顺序尝试（**任一成功即停止**）：

1. **`./galaxy_data_subsample.json`**（相对当前 HTML 所在目录）  
2. **`./galaxy_data.json`**  
3. **`../frontend/public/data/galaxy_data.json`**（相对当前 HTML 所在目录）

**典型用法：**

- **推荐（与当前 `run_pipeline.py` 默认输出一致）**：在仓库根目录执行 **`python -m http.server 8080`**，浏览器打开 **`http://localhost:8080/scripts/verify_galaxy_3d.html`**。此时第 3 个候选 URL 解析为 **`/frontend/public/data/galaxy_data.json`**，与 **`scripts/export/export_galaxy_json.py`** / **`run_pipeline.py`** 的默认 **`--output-json`** 一致。
- **与计划原文完全一致**：将管线产出的 JSON 复制为 **`data/output/galaxy_data_subsample.json`**，将 **`verify_galaxy_3d.html`** 复制到同目录，再执行 **`python -m http.server 8080 --directory data/output/`**，打开 **`http://localhost:8080/verify_galaxy_3d.html`**。

> **说明**：整个 **`data/output/`** 目录在 **`.gitignore`** 中（中间产物与大型文件），因此 **不把** HTML **仅**放在 `data/output/` 作为唯一来源，否则无法被 Git 跟踪；采用 **`scripts/`** 下主副本 + 文档/hint 说明拷贝方式，兼顾 **版本管理** 与 **计划中的目录服务方式**。

### 4.2 相机与场景

- 根据 **position** attribute 计算 **包围盒** 与 **包围球**，将 **`OrbitControls.target`** 设为 **中心**，**相机**置于中心斜上方，距离约为 **球半径 × 2.8**，避免 subsample 尺度过小导致「看不到点」。
- 背景色 **`#0a0a12`**，与后续 Design Spec 偏暗色宇宙基调不冲突（本阶段仅为验证）。

### 4.3 材质与性能

- 使用内置 **`PointsMaterial`**，**非** 自定义 Shader；Phase 3.0 目标仅为 **坐标与颜色语义** 验证，**不做** Bloom、粒子大小映射、HDR 等（留给 Phase 3.5–3.6）。
- **`depthWrite: false`** + 略 **`transparent`**，减轻多点叠在一起的 Z-fighting 观感（subsample 规模下足够）。

---

## 5. 交付文件

| 路径 | 作用 |
| --- | --- |
| `scripts/verify_galaxy_3d.html` | Phase 3.0 最小 Three.js 点云验证页（CDN ESM + OrbitControls） |

---

## 6. 验收步骤（Checkpoint 复现）

1. **准备数据**（若本地尚无 JSON）：  
   `python scripts/run_pipeline.py --input data/subsample/tmdb2025_random20.csv`  
   默认写入 **`frontend/public/data/galaxy_data.json`**（及同主文件名的 **`.gz`**）。
2. **启动静态服务**（仓库根目录）：  
   `python -m http.server 8080`
3. **浏览器打开**：  
   `http://localhost:8080/scripts/verify_galaxy_3d.html`
4. **预期**：  
   - 可见 **彩色点云**，点不全部塌缩在原点、不呈异常单线、非黑屏；  
   - **拖拽旋转** 视角，X/Y 方向有散布，Z 方向有纵深；  
   - **开发者工具 Console** 出现 **`Loaded {n} points | X:[…] Y:[…] Z:[…]`**；  
   - 相同 **`genres[0]`**（经导出映射到同一 **`genre_color`**）的点 **颜色一致**（在 subsample 上肉眼可辨）。

若 `fetch` 全部失败，页面中央 **红色背景错误区** 列出已尝试的 URL 与简要排错说明。

---

## 7. Git 与后续建议

| 项 | 内容 |
| --- | --- |
| 分支 | `phase-3.0-verify-galaxy-3d` |
| 提交 | `8cd740e` |
| 合并 | 验收通过后可将该分支 **merge** 回 `main`，或保留为长期 **冒烟工具**（与计划「可丢弃」不矛盾：删除文件即可移除） |

---

## 8. 已知限制（非本阶段缺陷）

- **依赖网络**：首次打开需能访问 **jsDelivr** 以加载 Three.js；离线环境需改为本地 vendor 或自建静态资源路径（未在本 Phase 实现）。
- **`file://` 打开**：浏览器常禁止 `fetch` 本地 JSON，**必须使用** 本地 HTTP 服务器。
- **全量 ~60K 点**：本页面未做 LOD/分块，全量 JSON 在低端机上可能 **内存与帧率** 压力较大；建议 subsample 或抽样验证 **Phase 3.0** 意图，全量性能留给 Phase 3.1 之后的正式前端与渲染路径。

---

*本报告描述的是 Phase 3.0 实施内容；若之后修改 `verify_galaxy_3d.html` 或默认 JSON 路径，请同步更新本节与 §4.1。*
