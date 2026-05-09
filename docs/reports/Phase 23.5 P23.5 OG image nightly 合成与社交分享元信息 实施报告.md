# Phase 23.5 · P23.5 OG image nightly 合成与社交分享元信息 — 实施报告

> 对应 [Phase 23 计划](../../.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md) 中 **P23.5**：  
> nightly cron 用 Pillow 合成 1200×630 `og-today.png`，写入 R2 与 Pages bundle，`frontend/index.html` 新增 `og:*` / `twitter:*` meta，社交分享卡片由当日 `today.json` 驱动。  
> 本报告汇总本次交付的**最终决策**与**最终操作**，并记录验收状态与边界条件。  
> **会话证据**： [P23.5 OG image 合成与 Butler 品牌字](00b65bb6-c7ca-431e-96de-49d728c38f3f)  
> **分支**：`p23.5-og-image-pipeline`  
> **报告日期**：2026-05-09。

---

## 1. 目标与最终决策

### 1.1 渲染产物与契约

| 议题             | 最终决策                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 输出文件         | `frontend/public/data/og-today.png`（也同步上传 R2，**不**走 prune；Pages bundle 保留以便 `og:image` 直连）                               |
| 尺寸 / 模式      | 固定 1200×630 / RGB / PNG / `optimize=True`；命中尺寸断言 `assert out_size > 0`                                                            |
| 写入语义         | 临时文件 `*.tmp` + `os.replace` 原子改名；poster 拉取失败时不执行 `replace`，前一日 PNG 保留（命中 Phase 23 风险表"复用上一日"条款）       |
| 数据来源         | 同一目录下的 `today.json`（`movie_id` + `date`）+ `galaxy_data.json`（取 movie 全字段）                                                   |
| 入口函数         | `render_og_today_after_galaxy_export(repo_root)`：失败返回 `None`，由 nightly/monthly 调用方决定是否仅打 WARN（不阻断主链路）             |

### 1.2 视觉与品牌（最终）

| 议题             | 最终决策                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 背景             | `COSMOS_BLACK = (10, 10, 12)` 全幕；左缘 6 px `genres[0]` 调色板色竖条作 accent                                                            |
| 海报             | 380×570，`_resize_cover` 覆盖式裁剪 + 14 px 圆角；左 60 px、垂直居中                                                                       |
| 文本主色 / 次色  | `TEXT_PRIMARY = #f2f2f2`（标题、品牌字）；`TEXT_SECONDARY ≈ (170,170,175)`（年份、URL）                                                   |
| 标题             | Inter Bold 60 px，`_wrap_title` 贪心换行 ≤ 2 行，超长 `_ellipsize_to_width` 末行加 `…`                                                     |
| 强调小字         | `today's pick · YYYY-MM-DD`，与左竖条同色（`genres[0]`）                                                                                  |
| 类型胶囊         | 最多 3 个；底色取自冻结调色板（19 个 genre 与首页 idle 星色一致）；文字为 `COSMOS_BLACK`                                                  |
| 品牌字（**最终**）| **Butler Medium 30 px**，文本固定为 **`the movie cosmos`**（小写）；UI 身份面规则的 SSOT 落实到 OG 卡片                                   |
| URL 行           | Inter Regular 20 px，次要灰；默认 `the-movie-cosmos.pages.dev`（P23.6 上线后替换为自定义域名）                                            |
| 字体回落         | Butler 缺失 → 回落 `_load_inter(weight=500)`；Inter 缺失 → 回落 `ImageFont.load_default(size=...)`；只 WARN 不报错                          |

> 中途品牌字典型化经过一次迭代：**先用 Inter Bold → 用户预览后定稿 Butler Medium 小写**。预览阶段使用了一次性脚本 `scripts/cron/_preview_og_butler.py`（monkey-patch `_load_inter`），定稿后该脚本与 `.tmp_butler/` 临时目录一并清理。

### 1.3 字体与许可

| 议题             | 最终决策                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inter            | 入仓 `assets/fonts/Inter.ttf`（变量字体，opsz/wght 双轴），Pillow 通过 `set_variation_by_axes` 切换 weight；许可文件 `assets/fonts/Inter-OFL.txt`（SIL OFL v1.1）       |
| Butler           | 入仓 `assets/fonts/Butler-Medium.ttf` + `Butler-Bold.ttf`（静态 TTF，~52 KB/each）；Fabian De Smet 官方授权"个人与商业使用免费"                                            |
| 字体目录文档     | 新增 `assets/fonts/README.md`，列出每个字体文件的用途、来源、许可                                                                                                          |
| 依赖             | `requirements.cpu.txt` 新增 `Pillow>=11.0,<13`（FreeType 变量字体支持）                                                                                                    |

### 1.4 分发与缓存

| 议题             | 最终决策                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages bundle     | `og-today.png` 保留在 `frontend/public/data/` 下（与 `today.json` 同策略；`upload_galaxy_r2.py` 的 `_maybe_prune` 显式不动该文件）                                                                                  |
| R2               | `upload_galaxy_r2.py` 上传 `og-today.png` 到 `<R2_KEY_PREFIX>/og-today.png`，`Content-Type: image/png`，`Cache-Control: public, max-age=300, must-revalidate`                                                       |
| manifest         | 新增 `og_today_url`（`<base>/<prefix>/og-today.png?v=<utc-date>` cache-buster）+ `r2_object_keys.og_today`                                                                                                          |
| Pages 头         | `frontend/public/_headers` 新增 `/data/og-today.png` ⇒ `Cache-Control: public, max-age=300, must-revalidate`（让社交平台 re-scrape 跟得上隔日换图节奏）                                                              |
| 仓库管理         | `.gitignore` 新增 `frontend/public/data/og-today.png{,.tmp}`（每日由 cron 生成，不入仓）                                                                                                                          |
| CI artifact      | `nightly_vote_refresh.yml` / `monthly_refit.yml` 的 `upload-artifact` paths 增加 `frontend/public/data/og-today.png`                                                                                              |

### 1.5 社交分享元信息

| 议题             | 最终决策                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| og:title         | `The Movie Cosmos`（叙述性面，标题字）— 与 README / 描述文案一致；**注意与图内品牌字小写不同**（叙述 vs UI 身份面）                                  |
| og:description   | "A 2.5D galaxy of ~60,000 films from TMDB. Today's pick refreshes every UTC midnight."                                                                |
| og:image         | 绝对 URL；当前 `https://the-movie-cosmos.pages.dev/data/og-today.png`，P23.6 替换 hostname                                                            |
| og:image:width / height / type / alt | `1200` / `630` / `image/png` / `Today's pick from The Movie Cosmos`                                                                |
| twitter:card     | `summary_large_image`（匹配 1.91:1 尺寸）                                                                                                              |
| twitter:image    | 与 `og:image` 同 URL                                                                                                                                  |

### 1.6 失败兜底与降级路径

| 触发条件                          | 行为                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `today.json` 缺失                 | `render_og_today_after_galaxy_export` WARN + 返回 `None`，主链路继续                                                |
| `galaxy_data.json` 缺失           | 同上                                                                                                                |
| `today.movie_id` 不在 `movies[]`  | 抛 `KeyError` → 入口捕获 `Exception` 打 ERROR + 返回 `None`，前一日 PNG 因 atomic 未替换而保留                       |
| TMDB poster 网络失败 / 解码失败   | `download_poster` 抛 `URLError` / `OSError` 透传出 `render_og_card`；同上不替换前一日 PNG                            |
| 电影本身 `poster_url` 为空        | 用 `_placeholder_poster(accent_rgb=...)`（accent 色块）填充，仍正常渲染当日卡片                                     |
| Butler 字体缺失                   | 品牌字回落 Inter Medium，仅 WARN（视觉降级，但不影响 CI 通过）                                                       |
| Inter 字体缺失                    | 全部文本回落 Pillow 默认 DejaVu Sans，仅 WARN                                                                        |

---

## 2. 最终操作清单（代码与流程）

### 2.1 代码改动（实现）

| 类型           | 路径                                                       | 最终操作                                                                                                                  |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 新增渲染脚本   | `scripts/cron/render_og_today.py`                          | Pillow 合成、`_load_inter` / `_load_butler_medium`、`_wrap_title` / `_ellipsize_to_width`、`download_poster`、原子写入、CLI + entry |
| 新增字体       | `assets/fonts/Inter.ttf`、`Inter-OFL.txt`                  | Inter variable + SIL OFL 许可文本                                                                                         |
| 新增字体       | `assets/fonts/Butler-Medium.ttf`、`Butler-Bold.ttf`        | Butler 静态 TTF（品牌字使用 Medium；Bold 入仓为后续可能的更重品牌变体预留）                                                |
| 字体目录文档   | `assets/fonts/README.md`                                   | 来源、用途、许可三栏表 + Inter / Butler attribution                                                                       |
| 依赖           | `requirements.cpu.txt`                                     | 新增 `Pillow>=11.0,<13`                                                                                                   |
| nightly 集成   | `scripts/cron/nightly_vote_refresh.py`                     | `import render_og_today_after_galaxy_export`，在 `write_today_json_after_galaxy_export` 之后调用，失败仅打 WARN          |
| monthly 集成   | `scripts/cron/monthly_refit.py`                            | 与 nightly 相同的 hook 点                                                                                                  |
| R2 上传        | `scripts/cron/upload_galaxy_r2.py`                         | 上传 `og-today.png`、新增 `og_today_url` / `r2_object_keys.og_today`、`R2_OG_TODAY_PNG_CACHE_CONTROL` 常量、`_maybe_prune` 不动 |
| meta tags      | `frontend/index.html`                                      | `og:*`（title/description/type/url/image + 尺寸/类型/alt）+ `twitter:*`（card/title/description/image）                    |
| Pages 缓存头   | `frontend/public/_headers`                                 | `/data/og-today.png` ⇒ `public, max-age=300, must-revalidate`                                                              |
| 仓库管理       | `.gitignore`                                               | 新增 `frontend/public/data/og-today.png{,.tmp}`                                                                            |
| CI artifact    | `.github/workflows/nightly_vote_refresh.yml`、`monthly_refit.yml` | `upload-artifact` paths 增加 `og-today.png`                                                                          |
| 单元测试       | `scripts/tests/test_render_og_today.py`                    | 12 个用例：hex→RGB / palette 完整性 / release_year / wrap+ellipsize / atomic 成功覆盖 / poster fetch 失败保留前一日 / 入口缺输入跳过 |
| 验收指南       | `docs/guides/P23.5 OG image 验收指南.md`                   | DoD 9 项 + 本地/CI/视觉/社交 validator/失败兜底/留档/一页式清单                                                            |
| 计划同步       | `.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md` | `p235-og-image-pipeline.status: pending → completed`                                                                  |

### 2.2 关键代码常量（节选）

```text
CANVAS_W=1200, CANVAS_H=630
POSTER_W=380, POSTER_H=570, POSTER_X=60, POSTER_RADIUS=14
RIGHT_X = POSTER_X + POSTER_W + 56
TITLE_FONT_SIZE=60, TITLE_LINE_GAP=8
OVERLINE_FONT_SIZE=22, META_FONT_SIZE=28, PILL_FONT_SIZE=22
BRAND_FONT_SIZE=30  (Butler Medium; bumped from 24 因为衬线视觉更轻)
URL_FONT_SIZE=20
COSMOS_BLACK=(10,10,12), TEXT_PRIMARY=(242,242,242), ACCENT_BAR_W=6
POSTER_FETCH_TIMEOUT_S=10
DEFAULT_BRAND="the movie cosmos"   (lowercase, UI identity surface)
DEFAULT_FOOTER_URL="the-movie-cosmos.pages.dev"   (P23.6 替换)
R2_OG_TODAY_PNG_CACHE_CONTROL="public, max-age=300, must-revalidate"
```

### 2.3 操作执行（开发期 / 验收期）

| 步骤                          | 最终操作                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 单元测试                      | `cd scripts; python -m unittest tests.test_render_og_today -v` ⇒ `Ran 12 tests ... OK`；全套 `discover tests` ⇒ `Ran 32 tests ... OK`（11 旧 + 12 新；含一例 mock 验证 poster 失败保留 PNG）                                                                            |
| 本地命令行直跑                | `python scripts/cron/render_og_today.py` ⇒ 178~179 KB / 1200×630 / RGB；终端打印 `today_date / movie_id / title / genres`、poster bytes、`finalized` 路径                                                                                                                |
| 视觉 review (Inter 版)        | 用户首轮 review，确认信息分布合理；提出"下方 The Movie Cosmos 改 Butler 且小写"                                                                                                                                                                                          |
| 字体来源补齐                  | `frontend/public/fonts/butler/` 在当前 checkout 不存在（IDE Glob 索引为旧缓存），从 `https://www.3drmodels.com/assets/fonts/butler/Butler-{Bold,Medium}.ttf` 拉到 `.tmp_butler/`                                                                                          |
| Butler 预览                   | `scripts/cron/_preview_og_butler.py` monkey-patch `_load_inter` 仅在 `BRAND_FONT_SIZE` 命中时返回 Butler Medium；用户 review ⇒ "我喜欢这版"                                                                                                                              |
| 定稿与清理                    | 把 `.tmp_butler/Butler-*.ttf` 移入 `assets/fonts/`；删除 `.tmp_butler/`、`scripts/cron/_preview_og_butler.py`；把品牌切换烘焙进 `render_og_today.py`（新 `_load_butler_medium`、`BRAND_FONT_SIZE 24→30`、`DEFAULT_BRAND` 改小写）                                          |
| 烘焙后回归                    | 重新执行单测（12 全绿）+ 命令行 smoke ⇒ 视觉与预览一致                                                                                                                                                                                                                  |
| upload_r2 副作用确认          | `python scripts/cron/upload_galaxy_r2.py` 在无 R2 env 时输出 `[R2] skip:` 并 exit 0（保持原有 fail-safe 行为）                                                                                                                                                          |
| 文档与计划                    | 写出 `docs/guides/P23.5 OG image 验收指南.md`；plan 文件标记 `p235-og-image-pipeline = completed`                                                                                                                                                                       |

---

## 3. 验收结果与最终状态

### 3.1 已通过（本地与分支级）

- 12 个单测全部通过（含 poster fetch 失败保留前一日 PNG 的 mock 用例）。
- 命令行直跑两次（Inter 版与最终 Butler 版），均生成 1200×630 / RGB / 178–179 KB PNG。
- 视觉/品牌人眼 review：用户已批准 Butler Medium 小写品牌 + Inter 正文的最终版。
- `upload_galaxy_r2.py` 在无 R2 env 时仍 fail-safe 退出。
- `frontend/index.html`、`_headers`、`.gitignore`、两份 workflow 的 artifact paths 改动已就位。
- 验收指南 `docs/guides/P23.5 OG image 验收指南.md` 已落档（10 项一页式清单）。

### 3.2 未闭环（按环境）

- **Production 域名上的 `og:image` 与社交 validator**：本次未触达 nightly `main` run，社交平台尚未抓到当日卡片。  
  按 P23.1 同等口径处理：分支验收已通过；production 验收以 `main` workflow run + 社交 validator 渲染为准（P23.7 收口前完成即可）。
- **`og_today_url` 在 production manifest 出现**：依赖上一条同次 nightly `main` run 后核验。
- **隔日 md5 变化**：需要至少跨一个 UTC 日 + 一次 nightly run 才能验证。

---

## 4. 风险与回滚口径

| 风险                                              | 影响                              | 缓解 / 回滚                                                                                                       |
| ------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TMDB poster 拉取失败                              | OG 卡空白 / 当日不更新            | 原子写 + entry 返回 `None` ⇒ 前一日 PNG 自动保留；下一日 nightly 自然恢复                                          |
| 字体缺失（Inter 或 Butler）                       | 视觉降级（fallback 字体）         | 仅 WARN 不阻断；`assets/fonts/` 已入仓且 `requirements.cpu.txt` 锁 Pillow 版本，CI 上几乎不会触发                   |
| 社交平台缓存陈旧                                  | 隔日仍显示旧卡                    | 短 TTL（300 s）+ R2 / Pages 双源 + manifest `?v=<utc-date>` cache-buster；必要时手动 Twitter / FB validator re-scrape |
| Pillow 在 GHA Linux Python 3.11 上行为差异       | CI 出图与本地不一致               | Pin `Pillow>=11.0,<13`；FreeType 变量字体在 11.x 稳定；`load_default(size=...)` 自 10.1 起即可                    |
| `og:image` hostname 滞后于自定义域名             | 社交分享显示旧域名                | P23.6 上线时同步替换 `frontend/index.html` + `DEFAULT_FOOTER_URL` + `_og_today_url` base                          |
| 历史合并冲突重新引入旧 `Start` 按钮 / cover 路径  | 与 P23.5 无直接耦合               | P23.5 不动 P23.3/P23.4 路径，纯增量；回滚仅需 revert 本分支 commit                                                |

---

## 5. 最终结论

P23.5 的实现与分支验收已完成闭环：  
渲染脚本、字体与许可、nightly/monthly 集成、R2 上传 + manifest 扩展、Pages bundle 与短 TTL 头、`og:*` / `twitter:*` meta、12 个单元测试、验收指南均按计划落地。中途按用户视觉反馈把品牌字典型化为 **Butler Medium 小写**，与首页 Loading / Cover 的 wordmark SSOT 对齐。

剩余待勾项：

1. `main` workflow run 后核验线上 manifest 出现 `og_today_url`、Pages `/data/og-today.png` 短 TTL 命中；
2. 至少一家社交 validator（opengraph.xyz / X / FB）渲染出当日卡片；
3. 跨一个 UTC 日复核 PNG md5 已变化（证实 nightly 真换图）。

三项落实后即可判定 **P23.5 全量验收通过**，进入 P23.6 / P23.7。

---

*文档结束。*
