# Phase 3.3 数据加载（`loadGalaxyData`）+ Loading 页 + Zustand 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 3.3「数据加载 + Loading 页 + Zustand store」  
> **规范依据**: 《TMDB 电影宇宙 Tech Spec.md》§4（JSON Schema）、§5.1（`fetch('/data/galaxy_data.json')` 与 Loading 后再初始化 Three.js 的约定）  
> **报告日期**: 2026-04-14  
> **范围**: 运行时 **`fetch` + 解析 + 校验**、全屏 **Loading（shadcn Spinner）**、**Zustand** 管理加载状态；**App** 接入上述流程并给出错误态与加载成功后的占位 UI。**不包含** Phase 3.4 及以后的 Three.js 场景、相机、粒子与 Bloom。

---

## 1. 摘要

本次工作落实开发计划中 **Phase 3.3：数据加载 + Loading 页 + Zustand store**。在用户要求 **新开 Git 分支再做** 的前提下，从 **`main`** 创建分支 **`phase-3.3-data-loading`**，完成：

- 新增 **`frontend/src/utils/loadGalaxyData.ts`**：默认请求 **`/data/galaxy_data.json`**（对应静态资源 **`frontend/public/data/galaxy_data.json`**），对根对象、`meta` 关键字段、**`meta.count` 与 `movies.length` 一致性**、每条影片的 **GPU 相关数值与 `genre_color`** 做运行时校验；校验通过后按验收要求 **`console.log`** 条数、`meta.version` 与前 **5** 条 **`id` / `title`**；失败时抛出带 **`[GalaxyData]`** 前缀的 **`Error`**，并在 store 中转为可展示的 **`errorMessage`**。
- 通过 **`npx shadcn@latest add spinner`** 增加 **`frontend/src/components/ui/spinner.tsx`**（Lucide **`Loader2`** + **`animate-spin`**，与现有 **base-nova / shadcn** 栈一致）。
- 新增 **`frontend/src/components/Loading.tsx`**：全屏居中遮罩 + **Spinner** + 简短文案，具备 **`role="status"`**、**`aria-busy`** 等可访问性属性。
- 新增 **`frontend/src/store/galaxyDataStore.ts`**（Zustand）：**`status`**（`idle` → `loading` → `ready` | `error`）、**`data`**、**`errorMessage`**、异步 **`fetchGalaxyData(url?)`**。
- 重写 **`frontend/src/App.tsx`**：挂载时触发加载；**loading / idle** 显示 **Loading**；**error** 显示错误说明与管线产物路径提示（避免白屏）；**ready** 显示条数与版本占位文案，为 **Phase 3.4** 接入 Three.js 预留入口。

提交哈希（当前分支顶端）：**`ad3e6fe`** — `feat(frontend): Phase 3.3 galaxy JSON loader, Loading overlay, Zustand store`。

---

## 2. Git 与分支

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 工作分支 | **`phase-3.3-data-loading`** |
| 提交 | **`ad3e6fe`** — `feat(frontend): Phase 3.3 galaxy JSON loader, Loading overlay, Zustand store` |

---

## 3. 执行操作清单（按时间顺序）

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | `git checkout -b phase-3.3-data-loading` | 满足「新开分支再做」 |
| 2 | `cd frontend && npx shadcn@latest add spinner --yes` | 生成 **`src/components/ui/spinner.tsx`** |
| 3 | 新增 **`frontend/src/utils/loadGalaxyData.ts`** | 默认 URL **`/data/galaxy_data.json`**；导出 **`loadGalaxyData`** 与 **`GALAXY_DATA_DEFAULT_URL`** |
| 4 | 新增 **`frontend/src/store/galaxyDataStore.ts`** | Zustand：**`useGalaxyDataStore`** |
| 5 | 新增 **`frontend/src/components/Loading.tsx`** | 全屏 Loading，复用 **`Spinner`** |
| 6 | 修改 **`frontend/src/App.tsx`** | 接入 store：加载 / 错误 / 就绪三态 UI |
| 7 | `npm run build`（`frontend/`） | **`tsc -b` + Vite 生产构建** 通过 |

---

## 4. 与开发计划 Phase 3.3 的对照

| 计划项 | 结果 |
| --- | --- |
| **`frontend/src/utils/loadGalaxyData.ts`** — fetch + parse + 运行时校验 | ✅ |
| **`frontend/src/components/Loading.tsx`** — 全屏居中 spinner（shadcn 风格） | ✅ |
| **Zustand store** 管理加载状态 | ✅ **`frontend/src/store/galaxyDataStore.ts`** |
| 浏览器先全屏 Loading，完成后 spinner 消失 | ✅（**`App.tsx`** 按 **`status`** 分支） |
| Console：**`[GalaxyData] Loaded {n} movies, meta.version={v}`** + 前 5 条 **`{id}: {title}`** | ✅（样本日志标签为 **`sample i/5:`** 以标明预览条数） |
| JSON 缺失或格式错误：Console 明确错误，非白屏 | ✅ **错误页** + **`console.error`**（store 捕获 loader 异常） |

**本 Phase 明确未实现的内容**（属后续 Phase）：

- **Phase 3.4**：Three.js 场景、相机控制器、Console 中的 **`[Scene]`** / **`[Camera]`** 等。
- **Phase 3.5 / 3.6**：粒子、`BufferAttribute`、自定义 shader、Bloom。
- **Storybook**：计划汇总在 Phase 4.6；本 Phase **未新增** `Loading.stories.tsx`（可按需补全）。

---

## 5. 交付文件与实现要点

### 5.1 新增 / 修改文件

| 路径 | 作用 |
| --- | --- |
| `frontend/src/utils/loadGalaxyData.ts` | **`loadGalaxyData(url?)`**：`fetch` → **`res.json()`** → **`parseAndValidate`**；校验 **`meta.version`**、**`meta.count`**、**`meta.z_range`**（长度 2、元素有限）；对 **`movies[i]`** 校验 **`id`**（整数）、**`title`**（字符串）、**`x/y/z/size/emissive`**（有限数）、**`genre_color`**（长度 3、分量有限且在 **[0,1]**）；**`meta.count === movies.length`**；通过后 **`console.assert`** 计数不变量；计划要求的 **`console.log`** |
| `frontend/src/store/galaxyDataStore.ts` | **`useGalaxyDataStore`**：**`fetchGalaxyData`** 内 **`set({ status: 'loading' })`** → 调用 **`loadGalaxyData`** → **`ready`** 或 **`error`** |
| `frontend/src/components/ui/spinner.tsx` | shadcn 生成的 **Spinner**（**`Loader2Icon`**） |
| `frontend/src/components/Loading.tsx` | 全屏 **`fixed inset-0`** + **`backdrop-blur`** + **`Spinner`** |
| `frontend/src/App.tsx` | **`useEffect`** 调用 **`fetchGalaxyData()`**；三态渲染 |

### 5.2 运行时校验策略说明

- **目标**：在 **不替代** Phase 3.2 **编译期 `satisfies`** 的前提下，为 **运行时 fetch 结果** 提供 **快速失败**，避免 Three.js 使用 **NaN / 长度不一致** 的数据时静默坏屏。
- **覆盖**：对 **`meta`** 与每条 **`Movie`** 校验了 **渲染与调试最关键** 的子集（版本、计数、Z 范围、位姿与颜色相关数值）。**未**在 loader 内逐项断言 Tech Spec §4.3B 全部 HUD 字段（如 **`cast`**、**`overview`**），以免 **~60K 行** 时无谓开销；若后续 HUD 出现字段缺失，可在 **导出脚本** 或 **按需校验** 中加强。
- **性能**：对 **`movies`** 做一次 **O(n)** 循环；全量数据下主要成本仍在 **JSON 下载与解析**，与计划阶段一致。

### 5.3 数据文件与仓库策略

- 默认加载路径：**`GET /data/galaxy_data.json`**（Vite dev / 静态托管下对应 **`public/data/galaxy_data.json`**）。
- **`.gitignore`** 已忽略 **`frontend/public/data/galaxy_data.json`** 与同主文件名 **`.gz`**：克隆空仓库后需本地执行 **`scripts/run_pipeline.py`**（或复制产物）生成该文件，否则进入 **`error`** 态属预期。
- Phase 3.2 的 **`galaxyPublicJson.typecheck.ts`** 仍依赖 **本地存在** 该 JSON 才能通过 **`tsc`** 编译期校验；与 Phase 3.3 **运行时 fetch** 互补。

### 5.4 目录与 Tech Spec §6 的对应关系

Tech Spec 项目结构表中 **`store/`** 用于 Zustand。本实现使用 **`frontend/src/store/galaxyDataStore.ts`**（与 §6 一致）。后续可增加 **`hooks/`** 或对 store 拆分模块，仍建议保持 **`store`** 作为桥接 Three.js 的单一入口之一。

---

## 6. 验收与复现

### 6.1 准备数据

确保存在 **`frontend/public/data/galaxy_data.json`**（例如仓库根目录执行管线，默认导出路径即此）。

### 6.2 构建

在 **`frontend/`** 目录：

```bash
npx tsc -b --noEmit
npm run build
```

预期：**TypeScript 与 Vite 生产构建成功**。

### 6.3 本地运行与肉眼验收

```bash
npm run dev
```

浏览器访问 Vite 提示的本地 URL：

1. **初始**：全屏 **Loading**（spinner + 文案）。
2. **成功后**：spinner 消失，出现 **TMDB Galaxy** 占位页，文案中含 **条数** 与 **`meta.version`**。
3. **DevTools Console**：应看到 **`[GalaxyData] Loaded …`** 与最多 **5** 条样本日志。
4. **删除或重命名** `galaxy_data.json` 后刷新：应出现 **错误页**（含 **`errorMessage`**），Console 有 **`[GalaxyData]`** 或 **`Failed to load or validate`** 类输出，**非白屏**。

### 6.4 Lint 说明

执行 **`npm run lint`** 时，**`frontend/src/components/ui/button.tsx`** 可能仍报 **`react-refresh/only-export-components`**（与 **Phase 3.1** 起 **`buttonVariants` 与 `Button` 同文件导出** 有关），**非 Phase 3.3 引入**。若需全绿 lint，可将 **`buttonVariants`** 抽到独立模块（属独立清理任务）。

---

## 7. 后续建议（非本 Phase 范围）

- **Phase 3.4**：在 **`status === 'ready'`** 分支挂载 Three.js canvas；从 **`useGalaxyDataStore.getState().data`**（或 selector）读取 **`movies`** / **`meta.z_range`** 等初始化场景。
- **StrictMode 双挂载**：开发环境下 **`useEffect` 可能触发两次 fetch**；若需避免重复请求，可后续加入 **AbortController** 或 **「已发起则跳过」** 的 ref 逻辑。
- **Storybook**：为 **`Loading`** 与错误态增加 **story**，便于 HUD 文档与 Phase 4.6 汇总。

---

## 8. 小结

Phase 3.3 在分支 **`phase-3.3-data-loading`**（提交 **`ad3e6fe`**）完成：**运行时 galaxy JSON 加载与校验**、**shadcn Spinner 全屏 Loading**、**Zustand 加载状态**，以及 **App 三态 UI** 与 **计划约定的 Console 可观测性**，为 **Phase 3.4 Three.js 场景初始化** 提供已解析的 **`GalaxyData`** 与稳定 **`status`** 信号。
