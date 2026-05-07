# Phase 21.1 · P21.1 CJK / Unicode 搜索规范化 v2 — 实施报告

> 对应 [Phase 21 计划](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) 中 **P21.1**（`p211-cjk-normalize-v2`）：将管线与前端的搜索归一化从 **v1（NFKD + ASCII 剥离）** 升级为 **v2（NFKC + 去组合音符 + casefold / 前端镜像）**；写入 **`meta.search_normalize_version`**；补全 SearchBar 依赖的防抖与最小查询长度 API；**表意文字（Han / 假名 / 谚文）单字即可触发搜索**。  
> **SSOT 文档**（若后续 P21.7 同步）：[`TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §4.3 / §4.5；[`TMDB 电影宇宙 Data Pipeline.md`](../project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md)。  
> **Git 分支建议**：`feat/p21-1-search-normalize-v2`（实现时于该分支开发与提交）。  
> **报告日期**：2026-05-08。

---

## 1. 目标与最终决策

| 议题 | 最终决策 |
|------|----------|
| v2 归一化算法（Python） | **`normalize_for_search_v2`**：`unicodedata.normalize("NFKC", strip)` → 去掉 **`unicodedata.category(c) == "Mn"`** 的码点 → **`casefold()`**。保留中日韩、西里尔、阿拉伯、谚文等非拉丁脚本；拉丁仍 casefold；**`ß` → `ss`**（Unicode casefold）。 |
| v1 是否保留 | **保留** `normalize_for_search`（NFKD + ASCII ignore + casefold），标注为 legacy，供对比或过渡期引用；**生产路径全部切到 v2**。 |
| 前端 `normalizeForSearch` | **`NFKC` + `/\p{M}/gu`（Unicode 所有 Mark 类）+ `toLowerCase()`** 作为 Python v2 的镜像。与 Python 的差异见 §3.2。 |
| 计划文档中的部分单测期望 | 原计划示例中 **`Café Amélie` → `cafe amelie`**、**`e\u0301` → `e`** 与 **NFKC** 实际行为不一致（NFKC 会将 `e`+组合音标预组合为 `é`，且 `toLowerCase`/`casefold` 对预组合拉丁重音不剥成纯 ASCII）。**最终验收以实际算法为准**；单测改为 **`Straße` → `strasse`（仅 Python）**、**`q\u0307` → `q`**（NFKC 未合并时去 Mn）及 CJK 保留类断言。 |
| `title_normalized` | 由 **`export_galaxy_json._title_normalized_field`** 使用 **v2** 生成，与搜索索引人名 key 同源语义。 |
| 人名索引 key | **`export_search_index._merge_person`** 使用 **`normalize_for_search_v2(raw_name)`** 作为 `people` 的归并 key。 |
| Supabase / 夜间任务 | **`scripts/supabase/initial_import.py`**、**`scripts/cron/nightly_vote_refresh.py`** 中 `title_normalized` 计算改为 **v2**，与主包一致。 |
| `meta` 新字段 | **`"search_normalize_version": "v2"`**，由 **`build_galaxy_payload`** 写入；缺省或非 `v2` 的旧包不阻断加载。 |
| 旧包兼容（前端） | **`loadGalaxyData.parseAndValidate`**：若 **`meta.search_normalize_version !== "v2"`**，**`console.warn`** 提示 CJK/非拉丁标题搜索可能不完整；**不抛错**。 |
| `Meta` / fixture | **`frontend/src/types/galaxy.ts`** 增加可选 **`search_normalize_version?: string`**；**`galaxyMinimalFixture`** 写入 **`v2`** 以便单测无告警噪声。 |
| 搜索最小长度（表意文字） | 拉丁等仍 **`SEARCH_MIN_QUERY_LEN = 3`**（Design §4.2）；若 trimmed 串匹配 **`Han | Hiragana | Katakana | Hangul`**（`\p{Script=…}`，`u` 标志），则 **`searchMinQueryLengthForTrim` 返回 1**。与 **SearchBar** 共用同一函数，保证 UI 门槛与 `score*` 一致。 |
| 防抖常量 | **`SEARCH_QUERY_DEBOUNCE_MS = 200`** 置于 **`searchScore.ts`**，与 Design Spec §4.2 一致，供 SearchBar 引用（修复此前缺失导出导致的 `tsc` 失败）。 |
| 全量重导出 | **已执行**：在具备 **`data/output/cleaned.csv`** + **`umap_xy.npy`** 的环境下运行 **`python scripts/export/export_galaxy_json.py --gzip-only`**，更新 **`frontend/public/data/galaxy_data.json.gz`** 与 **`galaxy_search_index.json.gz`** 并纳入版本库（若团队策略要求跟踪该二进制）。 |
| UMAP / 嵌入 | **未改**；本步仅换规范化与 meta，不重算坐标。 |

---

## 2. 交付物清单（路径）

| 类型 | 路径 | 说明 |
|------|------|------|
| Python v2 + v1 | [`scripts/export/export_search_index.py`](../../scripts/export/export_search_index.py) | `normalize_for_search_v2`；`_merge_person` 用 v2 |
| 主导出 + meta | [`scripts/export/export_galaxy_json.py`](../../scripts/export/export_galaxy_json.py) | 导入 v2；`_title_normalized_field`；`meta.search_normalize_version` |
| Supabase 导入 | [`scripts/supabase/initial_import.py`](../../scripts/supabase/initial_import.py) | `_title_normalized` 用 v2 |
| Nightly | [`scripts/cron/nightly_vote_refresh.py`](../../scripts/cron/nightly_vote_refresh.py) | `title_normalized` 用 v2 |
| Python 单测 | [`scripts/tests/test_normalize_for_search_v2.py`](../../scripts/tests/test_normalize_for_search_v2.py) | **`unittest`**，6 用例（与前端语义对齐的边界） |
| 前端归一化 + 门槛 + 防抖 | [`frontend/src/utils/searchScore.ts`](../../frontend/src/utils/searchScore.ts) | `normalizeForSearch`、`searchMinQueryLengthForTrim`、`SEARCH_QUERY_DEBOUNCE_MS`；`scoreMoviesForQuery` / `scorePeopleForQuery` / `scoreGenresForQuery` 使用动态最小长度 |
| 前端单测 | [`frontend/src/utils/searchScore.spec.ts`](../../frontend/src/utils/searchScore.spec.ts) | v2 Unicode、`searchMinQueryLengthForTrim`、CJK 单字电影搜索、回归排序与 cap |
| Galaxy 加载 | [`frontend/src/utils/loadGalaxyData.ts`](../../frontend/src/utils/loadGalaxyData.ts) | `validateMeta` 校验 `search_normalize_version` 类型；非 v2 时 `console.warn` |
| 类型与 fixture | [`frontend/src/types/galaxy.ts`](../../frontend/src/types/galaxy.ts)、[`frontend/src/types/galaxyMinimalFixture.ts`](../../frontend/src/types/galaxyMinimalFixture.ts) | `Meta.search_normalize_version`；`Movie.title_normalized` 注释更新；fixture `v2` |
| 数据产物 | `frontend/public/data/galaxy_data.json.gz`、`frontend/public/data/galaxy_search_index.json.gz` | 重导后主包 + 索引（若已提交） |

---

## 3. 算法与跨端差异

### 3.1 Python `normalize_for_search_v2`

1. `NFKC` + `strip()`  
2. 过滤 **`category == "Mn"`**（非间距组合标记）  
3. **`casefold()`**

### 3.2 TypeScript `normalizeForSearch`

1. **`String.prototype.normalize('NFKC')`**  
2. **`replace(/\p{M}/gu, '')`** — 去掉所有 Unicode **Mark**（`Mn` / `Mc` / `Me`），略宽于 Python 仅去 `Mn`；标题场景可接受。  
3. **`toLowerCase()`** — 与 Python **`casefold()`** 在多数拉丁场景一致；**已知差异**：例如 **`Straße`** 在 JS 中为 **`straße`**，在 Python casefold 中为 **`strasse`**。电影标题检索若依赖「无重音 ASCII 命中预组合重音」能力，v2 **弱于**旧 v1 的 ASCII 剥离；**德文 `ß`/`ss` 仍以 Python 侧 `title_normalized` 与索引为准**，前端 query 侧对 `ß` 的折叠与 Python 不完全一致时，以数据层规范化结果为主。

### 3.3 `movieHaystack`

仍优先使用 **`title_normalized.toLowerCase()`**（管线已 v2 casefold）；无字段时退回 title / original_title 的 **`normalizeForSearch`**。

---

## 4. `meta.search_normalize_version`

| 值 | 含义 |
|----|------|
| **`"v2"`** | 当前管线：`title_normalized` 与人名 key 使用 v2；前端应无代际告警。 |
| 缺失或非 `v2` | 可能为 P12.1 旧包；加载继续，**控制台 warning**，建议重导或换 R2 产物。 |

---

## 5. 搜索触发长度（CJK 1 字）

- **判定**：`/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(trimmed)`  
- **结果**：满足则最小长度为 **1**；否则为 **`SEARCH_MIN_QUERY_LEN`（3）**。  
- **未纳入**：西里尔、阿拉伯、注音（Bopomofo）等仍为 **≥3**；若产品要求扩展，需另开决策与单测。  
- **调用方**：**`scoreMoviesForQuery` / `scorePeopleForQuery` / `scoreGenresForQuery`** 与 **`SearchBar`**（`searchMinQueryLengthForTrim`）保持一致。

---

## 6. 已执行验证命令（建议回归）

```bash
# 前端
cd frontend && npm run test -- --run src/utils/searchScore.spec.ts src/utils/loadGalaxyData.test.ts src/data/loadSearchIndex.test.ts
npm run build

# Python（unittest，无需 pytest）
python -m unittest scripts.tests.test_normalize_for_search_v2 -v
```

**重导出（本地有 cleaned + UMAP）**：

```bash
python scripts/export/export_galaxy_json.py --gzip-only
```

**抽检 meta**：

```bash
python -c "import gzip,json; d=json.load(gzip.open('frontend/public/data/galaxy_data.json.gz','rt',encoding='utf-8')); print(d['meta'].get('search_normalize_version'))"
# 期望: v2
```

---

## 7. 人工烟测建议（与 P21.1 验收对齐）

| 检查项 | 标准 |
|--------|------|
| 控制台 | 使用新 gzip 时 **无** `search_normalize_version is not "v2"` 类告警。 |
| `meta` | 解压或运行时读取 **`search_normalize_version === "v2"`**。 |
| CJK | 单字 **汉字 / 假名 / 谚文** 可出联想（与 `searchMinQueryLengthForTrim` 一致）。 |
| 子串 | 如 **「五等分」「霸王」** 等能命中含对应原文的条目（依赖 `title_normalized` 含该脚本）。 |
| 西里尔 | 仍建议 **≥3** 字符检索；验证大写/小写混输仍合理。 |
| 拉丁重音 | **不强制**「`cafe` 命中 `Café`」——v2 不做旧版 ASCII 剥离；若需该能力需单独设计（NFD+去 Mn 或兼容映射表）。 |

---

## 8. 已知边界与后续

- **Tech Spec / Data Pipeline / Design Spec** 若仍写「NFKD + ASCII」旧语义，应在 **P21.7 文档同步** 中改为 v2 + `meta.search_normalize_version` + 前端 `\p{M}` 与 CJK 1 字门槛说明。  
- **P21.6**（电影联想条数上限取消）等与本报告无强绑定，可独立排期。  
- **人名索引 key 随 v2 变化**：全量重导后 `people` 的 key 与旧 ASCII-only 包不二进制兼容；部署需 **主包 + 搜索索引 + 前端** 同版本发布，避免混用。

---

## 9. 小结

P21.1 **完成**：管线与前端的 Unicode 友好搜索归一化 **v2**、**`meta.search_normalize_version`**、加载器告警、Python/JavaScript 单测、（可选）全量 gzip 重导；并在同一阶段收口 **CJK 单字触发** 与 **SearchBar 防抖/最小长度 API**，消除 `SearchBar` 对 `searchScore` 缺失导出导致的构建问题。
