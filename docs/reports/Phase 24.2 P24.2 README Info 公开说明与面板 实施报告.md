# Phase 24.2 / P24.2 README / Info 公开说明与面板 实施报告

## 1. 报告范围

本报告汇总 **P24.2**（Phase 24 子项）的**最终决策**与**仓库内已落地的最终操作**，对应计划：[`.cursor/plans/phase_24_launch_content_cleanup.plan.md`](../../.cursor/plans/phase_24_launch_content_cleanup.plan.md) 中「P24.2 README / Info 英文定稿」。  
计划外、同属本 phase **对外可见收口** 的 **favicon** 变更一并记入（§3.6、§4.4），便于与 README / Info 联合验收。

**不在本报告范围**：P24.1（发布链路 / R2 / dist 守卫，见 [Phase 24.1 实施报告](Phase%2024.1%20P24.1%20Cloudflare%20R2%20发布链路清理%20实施报告.md)）、P24.3（`docs/project_docs` 与运维清单的 SSOT 文档同步）。  
**不变更**：UMAP、embedding、genre/lang 权重、主交互与视觉参数（与 Phase 24 总目标一致）。

---

## 2. 计划目标与验收口径（摘录）

### 2.1 实施要点（来自计划）

- 更新 [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) 中 `info.*`，去除占位文案。
- 视需要更新 [`frontend/src/hud/InfoModal.tsx`](../../frontend/src/hud/InfoModal.tsx)，使 attribution / links 更易读。
- 更新根 [`README.md`](../../README.md)：产品介绍、数据来源与更新方式、Kaggle/TMDB attribution、TMDB 非官方声明、Inter/Butler 字体、技术栈（含 Cloudflare Pages/R2）、隐私/analytics 简述。
- 计划原文强调「英文定稿」；实施中采用 **中文主 README + 英文镜像 README** 的双文件策略（见 §3.1）。

### 2.2 验收（来自计划 + 执行解读）

| 验收项 | 结论 |
|--------|------|
| Info 无 placeholder | **已满足**：`info.sections` 为实质文案。 |
| README 与 Info 在数据来源、TMDB 非官方、字体 attribution 上表述一致 | **部分满足**：README / README.en 的「数据与致谢」与许可证表含 **TMDB 非官方** 与 **Inter / Butler**；Info 面板「数据与设备」小节为**面向用户**的短文案，明确 **TMDB 来源 + 非官方 + Kaggle 起点 + NOTICE**，**未**重复展开字体细表（字体仍在 README 许可证表中维护，避免信息面板过长）。 |
| 英文文案作为多语言 SSOT | **已满足**：HUD 仍以 `en.json` 为 SSOT；长文说明以 [`README.en.md`](../../README.en.md) 为英文镜像。 |

---

## 3. 最终决策（冻结版）

### 3.1 文档语言策略

1. **根目录 [`README.md`](../../README.md)**：保持 **中文**为主的产品与开发者说明（团队与仓库默认读者）。  
2. **新增 [`README.en.md`](../../README.en.md)**：与 `README.md` **结构对齐**的英文版，便于国际访客与 GitHub 浏览；两文件顶部互相指向，约定**同步维护**产品向段落。  
3. **[`frontend/README.md`](../../frontend/README.md)**：仅保留入口说明，指向根目录 **README.md** 与 **README.en.md**。

### 3.2 部署拓扑在 README 中的表述（与 P24.1 一致）

1. **生产主路径**：GitHub Actions（如 [`nightly_vote_refresh.yml`](../../.github/workflows/nightly_vote_refresh.yml)、[`monthly_refit.yml`](../../.github/workflows/monthly_refit.yml)）→ **R2 上传大 gzip** → **`npm run build -w frontend`** → **`cloudflare/wrangler-action@v3`** 在 `frontend` 下执行 **`pages deploy dist`**（Cloudflare Pages **Direct Upload**）。  
2. **勿**将 Cloudflare Pages「连接 Git 自动构建」作为生产入口（避免未按 monorepo 构建及 25 MiB 校验问题）。  
3. **GitHub Pages**：[`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml) 为 **P18.6 切 Cloudflare 后的短期灰度备用**，**计划在验证完成后撤下或停用**；不作为长期生产入口。  
4. **技术栈与数据流**章节中的 **mermaid** 图：拆出 **Cloudflare_hosting**（Pages 壳 + R2 大对象）与 **Browser_runtime**；图下 **文字说明**标明真实顺序为「先 R2 → 再 Vite 构建 manifest → 再 wrangler deploy」，避免读者误读为 Export 不经 CI 直连 Pages。

### 3.3 隐私 / Analytics 的公开表述策略

1. **README（中/英）**：各增加 **「隐私与统计（简述）」** / **Privacy and analytics (brief)**，与实现一致：无登录画像库；**可选** Cloudflare Web Analytics（构建期 `VITE_CF_BEACON_TOKEN` / CI Secret `CF_WEB_ANALYTICS_BEACON_TOKEN`，见 [`frontend/vite.config.ts`](../../frontend/vite.config.ts) 与 [P20.5 操作指南](../guides/P20.5%20Cloudflare%20Web%20Analytics%20%E6%8E%A5%E5%85%A5%E6%93%8D%E4%BD%9C%E6%8C%87%E5%8D%97.md)）；未配置则不注入；拦截器不影响站点功能。  
2. **Info 面板**：在 `info.sections` 中增加独立小节，文案 **尽量短、面向用户**（不展开 Secret 名、CI 步骤、外链运维手册），与 README 事实层一致。

### 3.4 Info 面板文案策略

1. **结构**：统一使用 `info.sections[]`（`heading` + `body`），由 [`InfoModal.tsx`](../../frontend/src/hud/InfoModal.tsx) 映射渲染。  
2. **「数据与设备」类小节**：从开发向（Python/UMAP/Vite/WebGL2 等）改为 **用户向**（TMDB 来源、非官方、公开数据/Kaggle、NOTICE、浏览器与首次大包）。  
3. **链接**：TMDB 署名、Kaggle 数据集等仍集中在 **Links** 小节或仓库文档；避免在短正文中堆叠 URL。  
4. **Markdown**：正文不使用 `**` 加粗（InfoModal 仅处理换段、`[label](url)` 与裸 `https://`，不渲染通用 Markdown 加粗）。

### 3.5 InfoModal 壳体高度

1. **DialogContent** 最大高度定为 **`max-h-[min(60dvh,32rem)]`**（宽度仍为 `w-[min(100vw-1.5rem,36rem)]`），相对原先更高的上限 **下调可视高度**，正文区依赖 **`min-h-0` + `flex-1` + `overflow-y-auto`** 滚动（与 Drawer 同类问题同源修复思路）。

### 3.6 Favicon（站点图标）

1. **决策**：用 **带环行星** emoji（**🪐**，U+1FA90 *RINGED PLANET*）替代原先自定义矢量星标，作为浏览器标签页 / 书签的识别锚点，与产品「星系」意象一致。  
2. **实现**：[`frontend/public/favicon.svg`](../../frontend/public/favicon.svg) 使用 SVG `<text>` 渲染该字符，并指定 **Segoe UI Emoji / Apple Color Emoji / Noto Color Emoji / Twemoji Mozilla** 等彩色字体栈；[`frontend/index.html`](../../frontend/index.html) 仍通过 `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` 引用，无需改 HTML。  
3. **版式参数（冻结）**：`viewBox="0 0 32 32"`，`font-size="30"`；水平居中 `x="16"`、`text-anchor="middle"`；垂直方向经目视微调为 **`y="20"`** + `dominant-baseline="middle"`，以抵消 emoji 在方框内 **视觉重心偏上** 的常见现象。

---

## 4. 仓库内最终操作清单（按类别）

### 4.1 根目录与前端入口文档

| 文件 | 操作摘要 |
|------|----------|
| [`README.md`](../../README.md) | Cloudflare Pages + R2 生产拓扑与 GHA 灰度说明；mermaid 与图注；隐私/analytics 简述；**English readme** 交叉链接；目录树增加 `README.en.md`。 |
| [`README.en.md`](../../README.en.md) | **新建**：与 `README.md` 结构对齐的英文镜像（含隐私、部署、致谢、许可证表等）。 |
| [`frontend/README.md`](../../frontend/README.md) | 指向根目录 **README.md** 与 **README.en.md**。 |

### 4.2 Info 多语言文案（`info.sections`）

| 文件 | 操作摘要 |
|------|----------|
| [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) | SSOT：sections 含 Overview / Usage / **Data & device** / **Privacy** / Links；数据与隐私为用户短文案。 |
| `zh.json`、`zh-Hant.json`、`ja.json`、`es.json`、`fr.json`、`ar.json` | 与 `en` **同结构**、同小节数；各语言本地化标题与正文（隐私与数据小节均为用户向短句）。 |

### 4.3 Info 面板组件

| 文件 | 操作摘要 |
|------|----------|
| [`frontend/src/hud/InfoModal.tsx`](../../frontend/src/hud/InfoModal.tsx) | `sections` 渲染；正文区原生纵向滚动（避免 ScrollArea 在 flex+max-h 下无法滚动）；`[label](url)` 与 `https://` 链接化；**DialogContent** `max-h-[min(60dvh,32rem)]`、`min-h-0`。 |

### 4.4 品牌与静态资源（Favicon）

| 文件 | 操作摘要 |
|------|----------|
| [`frontend/public/favicon.svg`](../../frontend/public/favicon.svg) | 以 **🪐**（U+1FA90）为内容的 SVG favicon；`font-size="30"`，`y="20"` 等版式见 §3.6。 |

---

## 5. 与计划条目的逐条对照（简表）

| 计划实施要点 | 落地位置 |
|--------------|----------|
| `en.json` `info.*` 无占位 | `en.json` → `info.sections` |
| InfoModal 结构利于 attribution / links | `InfoModal.tsx` + locales 内 Markdown 式链接 |
| README：产品、数据、Kaggle/TMDB、非官方、字体、技术栈、Pages/R2、隐私 | `README.md` + `README.en.md` |
| 「英文 README」定稿 | **`README.en.md`**（与中文主 README 同步维护） |

---

## 6. 已知余项（不阻塞 P24.2 收口）

1. **`.cursor/plans/phase_24_launch_content_cleanup.plan.md`** 中 todo `p242-public-english-copy` 的 YAML **status** 可能仍为 `pending`：若团队认定 P24.2 已达标，应在计划中 **手动改为 `completed`**，避免与仓库事实不一致。  
2. **P24.3**：`TMDB 电影宇宙 Data Pipeline.md`、`P23.6 运维清单.md` 等与 README 部署拓扑的**文档级**对齐，留在 P24.3 执行（本报告不展开）。  
3. **Info 是否补充 Inter/Butler 一句**：当前选择为 **不在短「数据与设备」中展开**，与 README 许可证表分工；若未来产品要求「面板与 README 逐字对齐字体」，可在 `en.json` 增一句并同步其它语言。

---

## 7. 建议验证步骤（发布前 smoke）

1. 本地切换语言，打开 **Info**，确认各小节无裸 `**`、链接可点、**正文可滚动**、弹层高度符合预期。  
2. 通读根 **README.md** 与 **README.en.md** 的部署与隐私段落，确认与 **P24.1**、**P20.5** 行为一致。  
3. 运行前端 **`npx tsc -b --noEmit`** 与 **`vitest run src/lib/locales/locales.schema.spec.ts`**（实施期用于保证各 locale `info` 结构一致）。  
4. **Favicon**：硬刷新或无痕窗口查看 **`/favicon.svg`**；若浏览器缓存旧图标，可清空站点数据或暂时改名 query（一般重新部署后时间会更新缓存）。

---

## 8. 参考索引

- Phase 24 总计划：[`.cursor/plans/phase_24_launch_content_cleanup.plan.md`](../../.cursor/plans/phase_24_launch_content_cleanup.plan.md)  
- P24.1 实施报告：[Phase 24.1 P24.1 Cloudflare R2 发布链路清理 实施报告.md](Phase%2024.1%20P24.1%20Cloudflare%20R2%20发布链路清理%20实施报告.md)  
- P20.5 Web Analytics：[P20.5 Cloudflare Web Analytics 接入操作指南.md](../guides/P20.5%20Cloudflare%20Web%20Analytics%20%E6%8E%A5%E5%85%A5%E6%93%8D%E4%BD%9C%E6%8C%87%E5%8D%97.md)  
- P18.6 / R2 运维：[P18.6 Cloudflare Pages 切换操作指南.md](../guides/P18.6%20Cloudflare%20Pages%20%E5%88%87%E6%8D%A2%E6%93%8D%E4%BD%9C%E6%8C%87%E5%8D%97.md)、[P18.6b Cloudflare R2 上线操作手册.md](../guides/P18.6b%20Cloudflare%20R2%20%E4%B8%8A%E7%BA%BF%E6%93%8D%E4%BD%9C%E6%89%8B%E5%86%8C.md)

---

## 9. 修订记录

| 日期 | 摘要 |
|------|------|
| 2026-05-11 | 增补 **§3.6 / §4.4**：Favicon 改为 **🪐** SVG（`font-size=30`，`y=20`）；**§7** 增加 favicon 缓存与验收说明。 |
