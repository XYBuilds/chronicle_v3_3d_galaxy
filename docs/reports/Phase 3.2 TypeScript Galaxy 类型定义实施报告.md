# Phase 3.2 TypeScript 类型定义（`galaxy.ts` + JSON 契约校验）实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 3.2「TypeScript 类型定义」  
> **规范依据**: 《TMDB 电影宇宙 Tech Spec.md》§4（输出数据 Schema：`meta` / `movies` 字段与语义）  
> **报告日期**: 2026-04-14  
> **范围**: 在 **`frontend/src/types/`** 定义 **`GalaxyData` / `Meta` / `Movie`** 等接口；启用 JSON 模块解析并完成与 **`frontend/public/data/galaxy_data.json`** 的编译期兼容性验证；**不包含** Phase 3.3 的数据加载器、Loading 页与 Zustand 加载状态

---

## 1. 摘要

本次工作落实开发计划中 **Phase 3.2：TypeScript 类型定义**，目标是将 Python 管线导出的 **`galaxy_data.json`** 结构固化为前端可复用的 **TypeScript 接口**，并与仓库内已有的 **subsample 规模** 产物做一次 **`tsc` 级** 契约校验，避免后续 Three.js / HUD 开发时在「字段名或嵌套形状」上出现静默偏差。

在用户要求 **新开 Git 分支再做** 的前提下，从 **`main`** 创建分支 **`phase/3.2-galaxy-types`**，新增类型文件与编译期校验模块，并最小化修改 **`frontend/tsconfig.app.json`**（仅增加 **`resolveJsonModule`**）。

---

## 2. Git 与分支

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 工作分支 | **`phase/3.2-galaxy-types`** |
| 提交说明 | `feat(frontend): add GalaxyData TypeScript types (Phase 3.2)`（若本地历史不同，以 `git log` 为准） |

---

## 3. 执行操作清单（按时间顺序）

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | `git checkout -b phase/3.2-galaxy-types` | 满足「新开分支再做」 |
| 2 | 新增 `frontend/src/types/galaxy.ts` | 定义 **`GalaxyData`**、**`Meta`**、**`Movie`**，并补充 **`UmapParams`**、**`FeatureWeights`**、**`XyRange`**、**`GenreColorRgb`** 等辅助类型；字段与 Tech Spec §4 及 `scripts/export/export_galaxy_json.py` 输出对齐 |
| 3 | `frontend/tsconfig.app.json` 增加 **`"resolveJsonModule": true`** | 允许对 JSON 使用 `import`，以便编译期校验 |
| 4 | 新增 `frontend/src/types/galaxyPublicJson.typecheck.ts` | **`import`** `../../public/data/galaxy_data.json`，以 **`satisfies GalaxyData`** 做 **仅类型检查** 的断言；该文件 **不被应用入口引用**，不参与 Vite 运行时打包图 |
| 5 | 验收命令 | **`npx tsc -b --noEmit`**、**`npm run build`**（`frontend/` 目录下） |

**数据文件说明**：`frontend/public/data/galaxy_data.json` 在 Phase 3.1 阶段已存在（subsample 管线产物，条数少于 20 为过滤后正常结果）。Phase 3.2 **未强制**再复制一份 `galaxy_data_subsample.json`；校验直接绑定当前 `galaxy_data.json`。

---

## 4. 与开发计划 Phase 3.2 的对照

| 计划项 | 结果 |
| --- | --- |
| 文件路径 `frontend/src/types/galaxy.ts` | ✅ |
| 定义 **`GalaxyData` / `Meta` / `Movie`**，对齐 Tech Spec §4 | ✅ |
| 将 subsample 产物置于 `frontend/public/data/` 并用 TS 验证兼容性 | ✅（使用已有 **`galaxy_data.json`**；校验见 **`galaxyPublicJson.typecheck.ts`**） |
| **`npx tsc --noEmit`** 无错误 | ✅（项目使用 **`tsc -b`**，等价于对 solution 做无发射检查） |

**明确未在本 Phase 完成的计划条目**（属 **Phase 3.3 及以后**）：

- **`loadGalaxyData.ts`**（fetch、parse、运行时校验）
- **Loading 全屏组件**与 **Zustand** 加载状态
- Three.js 场景、粒子、Bloom 等

---

## 5. 交付文件与要点

### 5.1 新增 / 修改文件

| 路径 | 作用 |
| --- | --- |
| `frontend/src/types/galaxy.ts` | §4 Schema 的 TS 表达：`Meta`（含 `umap_params`、`genre_palette`、`feature_weights`、`z_range`、`xy_range` 等）、`Movie`（GPU 字段 + HUD 字段 + `id` / `imdb_id`）、顶层 `GalaxyData` |
| `frontend/src/types/galaxyPublicJson.typecheck.ts` | 编译期：`import` + **`satisfies GalaxyData`**，证明当前 JSON 与类型一致 |
| `frontend/tsconfig.app.json` | **`resolveJsonModule: true`** |

### 5.2 类型设计说明（与 JSON `import` 推断的折中）

TypeScript 在 **`resolveJsonModule`** 下对 JSON 中的 **同质数字数组** 往往推断为 **`number[]`**，而不是 **`[number, number]`** 或 **长度为 3 的元组**。为让 **`satisfies GalaxyData`** 在 **零断言** 的前提下通过检查，下列字段在接口中使用 **`number[]`**，并在注释中标明 **Tech Spec 中的语义长度**（如 **`z_range` 为 `[min, max]`**，**`genre_color` 为 RGB 三元组**）：

- **`Meta.z_range`**
- **`XyRange.x` / `XyRange.y`**
- **`GenreColorRgb`（即 `Movie.genre_color`）**

若后续希望在类型层面强制 **二元组 / 三元组**，适合在 **Phase 3.3 加载器** 中在运行时 **`assert`** 长度后再 **收窄类型**，而不是仅依赖 JSON 静态导入推断。

### 5.3 `UmapParams.random_state`

规范要求 **`random_state` 固定为 42**。类型上声明为 **`number`**，并在 **`galaxy.ts`** 内以注释约束；编译期无法从 JSON 区分「字面量 42」与「任意 number」，**强约束仍以管线与导出脚本为准**。

---

## 6. 验收与复现

在 **`frontend/`** 目录执行：

```bash
npx tsc -b --noEmit
npm run build
```

预期：**无 TypeScript 错误**，**Vite 生产构建成功**。  
说明：由于 **`galaxyPublicJson.typecheck.ts`** 未被 `main.tsx` 引用，**生产 bundle 体积不应因本 Phase 明显增加**；类型校验由 **`tsc -b`** 覆盖。

---

## 7. 后续建议（非本 Phase 范围）

- 在 **Phase 3.3** 的 **`loadGalaxyData`** 中实现计划要求的 **`console.log`**（条数、`meta.version`、前若干条 `id` / `title`）及对 **`meta.count === movies.length`**、**有限数值** 等的 **运行时断言**。
- 若需 CI 中单测 JSON 契约，可将 **`galaxyPublicJson.typecheck.ts`** 保留为「编译即测试」，或改为 Vitest + 显式 `expect`（按需再议）。

---

## 8. 小结

Phase 3.2 在独立分支 **`phase/3.2-galaxy-types`** 上完成：**§4 契约的类型化**、**`resolveJsonModule` 配置**，以及针对 **`public/data/galaxy_data.json`** 的 **`satisfies` 编译期校验**，为后续数据加载与 3D 渲染提供稳定的类型基础。
