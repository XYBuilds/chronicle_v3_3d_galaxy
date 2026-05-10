# The Movie Cosmos（TMDB Movie Cosmos / Chronicle v3）

> The Movie Cosmos 把 ~60K TMDB 电影渲染为一个**可漫游的 2.5D 粒子星系**：
> 文本语义 + 流派 + 原始语言经 UMAP 降维到 X/Y，`release_date` 转小数年份作为 Z；
> `vote_count` 驱动尺寸、`vote_average` 驱动明暗、主 genre 决定色相。

线上站点（Phase 23 主域 + 备线）：

- **生产主域（Cloudflare Pages 自定义域）**：<https://themoviecosmos.com/>（`www.themoviecosmos.com` 同项目绑定）
- **Cloudflare Pages 默认域（备线）**：<https://the-movie-cosmos.pages.dev/>
- **GitHub Pages**（灰度备线）：见 `.github/workflows/deploy-pages.yml` 输出域名

---

## 1. 项目结构（速览）

```
chronicle_v3_3d_galaxy/
├── data/                   # raw / output / runs / subsample（多数 gitignored；见 data/README.md）
├── docs/
│   ├── project_docs/       # PRD / Tech Spec / Data Pipeline / 状态机 / 视觉参数等 SSOT
│   ├── reports/            # 每个 Phase 的实施报告
│   ├── guides/             # 运维操作指南（Supabase / P18.4 nightly / P18.5 monthly / P18.6 Pages / P18.6b R2）
│   └── benchmarks/         # 性能基线
├── scripts/
│   ├── pipeline/           # 数据清洗
│   ├── feature_engineering/# embedding / genre / language / UMAP / Procrustes
│   ├── export/             # galaxy_data.json + 搜索索引导出
│   ├── supabase/           # 一次性导入与守卫
│   ├── cron/               # P18.4 nightly / P18.5 monthly / R2 上传
│   ├── tools/              # 月度 zip 打包等
│   └── experiments/        # P18.1 canonical full rebuild + GHA core benchmark
├── supabase/migrations/    # P18.2 schema + P18.3 reference 锁定
├── frontend/               # Vite + React (HUD) + 原生 Three.js (3D canvas) + Zustand
└── .github/workflows/      # nightly / monthly / phase18 benchmark / GH Pages deploy
```

更详细的目录说明见 `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` §6。

---

## 2. 关键 SSOT 文档

按变更优先级阅读：

| 文档                                                                                                                 | 内容                                                            |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`](docs/project_docs/TMDB%20电影宇宙%20Tech%20Spec.md)                 | 系统架构、前端渲染、相机/拾取、JSON Schema、部署拓扑            |
| [`docs/project_docs/TMDB 电影宇宙 Data Pipeline.md`](docs/project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md)         | 数据流 SSOT：清洗、特征工程、UMAP、自动化 cron、Pages + R2 部署 |
| [`docs/project_docs/TMDB 电影宇宙 Design Spec.md`](docs/project_docs/TMDB%20电影宇宙%20Design%20Spec.md)             | 视觉与交互规则                                                  |
| [`docs/project_docs/星球状态机 spec.md`](docs/project_docs/星球状态机%20spec.md)                                     | 单星状态机（idle/selecting/selected/...）                       |
| [`docs/project_docs/视觉参数总表.md`](docs/project_docs/视觉参数总表.md)                                             | shader uniform 与 OKLab L 等参数表                              |
| [`docs/project_docs/TMDB 数据特征工程与 3D 映射总表.md`](docs/project_docs/TMDB%20数据特征工程与%203D%20映射总表.md) | feature → 渲染映射                                              |
| [`docs/project_docs/TMDB 电影宇宙 PRD.md`](docs/project_docs/TMDB%20电影宇宙%20PRD.md)                               | 产品需求                                                        |

---

## 3. 本地开发

### 3.1 前端（npm workspaces）

仓库根：

```bash
npm install                  # 安装 frontend workspace（lockfile 在仓库根）
npm run dev                  # = npm run dev -w frontend (Vite dev server)
npm run build -w frontend    # 产出 frontend/dist
npm run test -w frontend
npm run storybook -w frontend
```

前端默认 `vite.config.ts` 中 `base = process.env.VITE_BASE_PATH ?? '/'`：CF Pages 根路径直接生效；GitHub Pages 由 workflow 注入子路径。

### 3.2 Python 数据管线

依赖见仓库根 `requirements.txt`（GPU 路径）与 `requirements.cpu.txt`（CI / CPU 路径）。Windows 本地建议使用 `.venv`。

完整一次性管线（与月度 UMAP 语义一致，必须 `--densmap`）：

```powershell
.\.venv\Scripts\python.exe scripts\run_pipeline.py `
  --input data\raw\TMDB_all_movies.csv `
  --through-phase-2 --densmap --embedding-device cuda
```

子样本冒烟：

```powershell
.\.venv\Scripts\python.exe scripts\run_pipeline.py --input data\subsample\TMDB_all_movies_random20.csv
```

更多细节见 [`data/README.md`](data/README.md)。

---

## 4. 自动化任务（Phase 18 出口）

| 任务                                 | Workflow                                                                                         | 入口脚本                                                                                                     | 频率                        | 作用                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **每日票数刷新**                     | [`.github/workflows/nightly_vote_refresh.yml`](.github/workflows/nightly_vote_refresh.yml)       | [`scripts/cron/nightly_vote_refresh.py`](scripts/cron/nightly_vote_refresh.py)                               | `0 20 * * *` UTC + dispatch | 沿用 frozen `threshold_versions`，UPDATE `vote_count/avg/popularity`，新过线片入 `movies_pending`；**含维度漂移探测（默认 fail CI）**；导出 + R2 + Pages |
| **月度 refit**                       | [`.github/workflows/monthly_refit.yml`](.github/workflows/monthly_refit.yml)                     | [`scripts/cron/monthly_refit.py`](scripts/cron/monthly_refit.py)                                             | `0 20 1 * *` UTC + dispatch | 重算 dynamic threshold + 全量 DensMAP + Procrustes 对齐 v1 reference + 合并 pending；P18.5b 软闸；**含维度漂移探测（默认 fail CI）**；导出 + R2 + Pages  |
| **R2 上传（被 cron 调用）**          | —                                                                                                | [`scripts/cron/upload_galaxy_r2.py`](scripts/cron/upload_galaxy_r2.py)                                       | 每次 cron 末端              | 上传 `galaxy_data.json.gz` / `galaxy_search_index.json.gz` 到 R2，写 `galaxy_assets_manifest.json`                                                       |
| **从 Supabase 导出**（被 cron 调用） | —                                                                                                | [`scripts/cron/export_from_supabase.py`](scripts/cron/export_from_supabase.py)                               | 每次 cron                   | 分页 + 并行拉 `movies` → `build_galaxy_payload` → 写 `frontend/public/data/*`                                                                            |
| **Phase 18.1b 基准**                 | [`.github/workflows/phase18_refit_benchmark.yml`](.github/workflows/phase18_refit_benchmark.yml) | [`scripts/experiments/phase18_core_refit_benchmark.py`](scripts/experiments/phase18_core_refit_benchmark.py) | 仅 dispatch                 | 在 `ubuntu-24.04` 上跑 fusion → DensMAP → Procrustes → export，得墙钟与峰值 RSS                                                                          |
| **GitHub Pages（灰度备线）**         | [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)                       | —                                                                                                            | push 到 `main`              | 兼作回滚备线，1–2 周双轨期                                                                                                                               |

操作指南：

- [`docs/guides/Supabase 操作教程.md`](docs/guides/Supabase%20操作教程.md)
- [`docs/guides/P18.4 每日投票刷新与导出入口指南.md`](docs/guides/P18.4%20每日投票刷新与导出入口指南.md)
- [`docs/guides/P18.5 月度星系 refit 操作指南.md`](docs/guides/P18.5%20月度星系%20refit%20操作指南.md)
- [`docs/guides/P18.6 Cloudflare Pages 切换操作指南.md`](docs/guides/P18.6%20Cloudflare%20Pages%20切换操作指南.md)
- [`docs/guides/P18.6b Cloudflare R2 上线操作手册.md`](docs/guides/P18.6b%20Cloudflare%20R2%20上线操作手册.md)

---

## 5. Secrets / `.env`

复制 [`.env.example`](.env.example) 为 `.env`（已被 gitignore），按需填入。仓库 **Settings → Secrets and variables → Actions** 同样需要这些值用于 GHA：

| 类别             | 变量                                                                                               | 备注                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Supabase         | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`                                                       | nightly + monthly 共用；`service_role` 切勿入仓   |
| Kaggle           | `KAGGLE_USERNAME` / `KAGGLE_KEY`                                                                   | 用于 daily update 拉取                            |
| 月度 bundle      | `GALAXY_EMBED_BUNDLE_URL`                                                                          | 单行 http(s) zip 直链；workflow 已 trim/CRLF 兼容 |
| Cloudflare Pages | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_PAGES_PROJECT_NAME`                 | API Token 仅需 **Account → Pages → Edit**         |
| Cloudflare R2    | `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | 5 个变量缺一即 R2 step 安全 skip                  |
| CF Web Analytics | `CF_WEB_ANALYTICS_BEACON_TOKEN`（CI Secret） / `VITE_CF_BEACON_TOKEN`（构建注入名）                | 用于注入 Cloudflare beacon；未配置时构建仍成功    |

---

## 6. 部署拓扑（Phase 18 出口）

```
Browser
  ├── 前端 bundle  ←  Cloudflare Pages（Direct Upload via cloudflare/wrangler-action@v3）
  └── galaxy_*.json.gz
                ←  Cloudflare R2（公开读 + CORS；优先级见 frontend/src/lib/galaxyAssetUrls.ts）

GitHub Pages（灰度备线）：仍由 deploy-pages.yml 在 push 到 main 时部署
```

**P23.6（自定义域名）**：R2 bucket **CORS policy** 的 `AllowedOrigins` 须包含 `https://themoviecosmos.com`、`https://www.themoviecosmos.com`（若已绑定 www）以及备线 `https://the-movie-cosmos.pages.dev`；配置入口见 `docs/guides/P18.6b Cloudflare R2 上线操作手册.md`。可选：在 Cloudflare **Bulk Redirects** 或 Pages **Redirect rules** 将 `the-movie-cosmos.pages.dev` **301** 到 `https://themoviecosmos.com`，避免与主域重复收录；备线仍可保留不重定向。

更多见 `docs/project_docs/TMDB 电影宇宙 Data Pipeline.md` §3.2 / §11 / §12。

---

## 7. 浏览器与平台

- **WebGL 2.0** 硬前置；不做 WebGL 1.0 降级（见 Tech Spec §7）。
- 桌面浏览器（Chrome / Edge / Firefox / Safari 现代版）为主目标；移动端非主要适配对象。
- **国内访问优化** 不在 Phase 18 范围。

---

## 8. HUD 多语言与搜索（Phase 21）

- **HUD i18n**：UI 文案支持 **EN / 简体中文 / 繁體中文 / 日本語 / Español / Français / العربية**，仅覆盖 HUD/DOM 文案；TMDB 数据库字段（标题、人名、genre 名等）保持原文。
  - 切换：HUD 右上 **Info → Lang → Fullscreen** 中间的语言按钮，或 URL **`?lang=zh|zh-Hant|ja|es|fr|ar|en`**；选择会写入 `localStorage['tmc.locale']` 与 `?lang=` 同步。
  - 实现：`frontend/src/lib/locales/*.json` + `useLocaleStore` + `useStrings()` / `getStrings()`，**不**引入 `react-i18next`。详见 Tech Spec §1.4.8。
- **CJK / Unicode 搜索（Phase 21.1）**：搜索归一化升级到 **v2**（NFKC + 去 `Mn` 组合标记 + casefold），保留中日韩、西里尔、阿拉伯、谚文等非拉丁脚本；表意文字（汉字 / 假名 / 谚文）**单字即可触发联想**。`meta.search_normalize_version` 写为 `"v2"`，旧 v1 包仍可加载但前端 `console.warn`。
- **流派 AND 多选（Phase 21.3）**：Genres 分段不再是输入联想，改为 **19 个 badge 网格 + AND 交集**；继续点击的 badge 若交集为 0 则即时灰显（死路预测）。详见 Design Spec §4.5。
- **电影联想全量（Phase 21.6）**：取消硬编码 12 条上限；在滚动列表中可见全部命中（如 query `batman` 也能滚动到 `The Batman`）。

---

## 9. License

本项目当前未声明开源 License；如需复用请与维护者协商。
