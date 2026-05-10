# Phase 23 — The Movie Today · 自定义域名 · OG 卡片（P23.7 收口报告）

## 1. 背景与目标

Phase 23 将首屏从「长加载 + Start 门闩」升级为产品化入口：**每日一部 The Movie Today**（服务端 `today.json` + 客户端静默 fallback）、**无 Start 的 Cover**（shader 仅渲染今日实例 + Perlin 入口）、**社交分享 OG 图**（nightly Pillow 合成 `og-today.png`）、**生产自定义域名与 R2 CORS / Pages 301 备线**。

本文档为 **P23.7** 收口：汇总决策与变更面，并指向各子阶段实施报告与已更新的 **SSOT**（`TMDB 电影宇宙 Tech Spec.md`、`TMDB 电影宇宙 Data Pipeline.md`、`TMDB 电影宇宙 Design Spec.md`、`README.md`）。

## 2. 决策快照（归档）

| 主题 | 决策 |
| :--- | :--- |
| 今日片 ID | 独立 **`today.json`**；选取 **UTC 日期确定性 hash**；`min_vote_count` 默认 **0**（可脚本 flag 提高） |
| 失败策略 | `today.json` 失败 / 解析失败 / id 不在 `movies[]` / 日期陈旧 → **Top-1000 随机**，控制台 `warn`，**不**进 LoadFailurePage |
| Cover 渲染 | **`uCoverMode` + `uCoverTodayInstanceId`** 在 idle/active VS 早期 cull；拾取与 **`interaction.ts`** mask 对齐 |
| 入口 | **移除 Start**；**点击球 / Enter / Space**（透明 focus 按钮）→ focus + drawer；**空白 orbit** 与 focus 共用 **`?orbitDrag`** |
| OG | **1200×630** PNG；**短 Cache-Control**；`index.html` **绝对 URL** og/twitter 元数据 |
| 域名 | 生产 **themoviecosmos.com**；**`*.pages.dev` → 301 主域**（`_middleware.js`）；R2 CORS **含主域 + www + pages.dev** |

## 3. 变更清单（按子阶段）

| 子阶段 | 交付要点 | 详细报告 |
| :--- | :--- | :--- |
| P23.1 | `pick_movie_today.py`、`today.json`、manifest `today_url`、`loadToday.ts` / fallback | [`Phase 23.1 P23.1 The Movie Today 数据链路与验收闭环 实施报告.md`](Phase%2023.1%20P23.1%20The%20Movie%20Today%20数据链路与验收闭环%20实施报告.md) |
| P23.2 | Loading 双品牌、Butler、Figma 对齐 | [`Phase 23.2 P23.2 Loading Figma 对齐实施报告.md`](Phase%2023.2%20P23.2%20Loading%20Figma%20对齐实施报告.md) |
| P23.3 | 无 Start、CoverBackdrop、`coverModeStore`、shader cull、orbit | [`Phase 23.3 P23.3 Cover Perlin 封面阶段实施报告.md`](Phase%2023.3%20P23.3%20Cover%20Perlin%20封面阶段实施报告.md) |
| P23.4 | Tooltip 复用、click/键盘、相机沿用 | [`Phase 23.4 P23.4 Cover Perlin 交互与无障碍 实施报告.md`](Phase%2023.4%20P23.4%20Cover%20Perlin%20交互与无障碍%20实施报告.md) |
| P23.4b | `--cosmos-*` token、1s 入场、字色分轨、去渐变 | [`Phase 23 P23.4b Cover 首屏品牌与入场动效 实施报告.md`](Phase%2023%20P23.4b%20Cover%20首屏品牌与入场动效%20实施报告.md) |
| P23.5 | `render_og_today.py`、`_headers`、`index.html` meta | [`Phase 23.5 P23.5 OG image nightly 合成与社交分享元信息 实施报告.md`](Phase%2023.5%20P23.5%20OG%20image%20nightly%20合成与社交分享元信息%20实施报告.md) |
| P23.6 | DNS、Pages 绑定、TLS、R2 CORS、301、运维清单 | [`Phase 23.6 P23.6 自定义域名上线与运维验收实施报告.md`](Phase%2023.6%20P23.6%20自定义域名上线与运维验收实施报告.md) |

**P23.7（本文）**：上述四份 **project_docs** + **README** 已与实现对齐；出口验收条目见项目内 [`.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md`](../../.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md) **「验收清单（出口）」**。

## 4. SSOT 文档更新摘要（P23.7）

- **Tech Spec §1.1 / §1.4.7 / §5.2**：Phase 23 加载相位、`today.json`、Cover shader uniform、Browser→Pages/R2 拓扑与 CORS 注记。  
- **Data Pipeline §11.1 / §11.1a–b / §12**：nightly 增加 today + OG 步骤；`today.json` schema；`og-today.png` 规格；缓存表与 manifest `today_url`。  
- **Design Spec §3.5**：Loading + Cover 全文替换为 Phase 23 行为（token、无 Start、tooltip/orbit/键盘）。  
- **README**：The Movie Today 一句产品说明；§4 表格中 R2 上传行补充 today/og/manifest。

## 5. 风险与回滚（摘要）

| 风险 | 缓解 |
| :--- | :--- |
| today 与 galaxy 版本错配 | manifest 同学期发布；客户端校验 id ∈ `movies[]` |
| R2 CORS 漏主域 | P23.6 清单与 CF 控制台复核 |
| OG 缓存 | 短 TTL + 隔日 validator 复测 |

详细风险表仍以 plan 文档 **「风险与回滚」** 为准。

## 6. 验收记录（文档层）

- [x] Tech Spec / Data Pipeline / Design Spec / README 已反映 Phase 23 行为与部署拓扑  
- [x] 本子报告归档，并链接 P23.1–P23.6 子报告  

（运行时 smoke：以各子阶段报告与 plan 出口清单为准。）
