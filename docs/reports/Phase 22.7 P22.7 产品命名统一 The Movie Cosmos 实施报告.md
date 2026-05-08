# Phase 22.7（P22.7）— 产品命名统一 "The Movie Cosmos" — 实施报告

> **计划来源**：`.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md`（P22.7）  
> **目标**：在不改仓库目录名 / git remote / scripts 结构的前提下，统一品牌命名。  
> **本次最终口径**：  
> - **UI / 封面 / Logo** 用 `the movie cosmos`（全小写）  
> - **常规文本叙述** 用 `The Movie Cosmos`（标题式大小写）

---

## 1. 最终决策（定稿）

| 议题 | 最终决策 |
|------|----------|
| 品牌主名 | 统一为 **The Movie Cosmos**（叙述语境）。 |
| UI 标识写法 | `the movie cosmos`（全小写）。 |
| 正文写法 | `The Movie Cosmos`（提升阅读体验）。 |
| 历史别名 | `TMDB Movie Cosmos` / `TMDB 电影宇宙` 仅允许作为历史/别称语境，不再作为正式品牌主名。 |
| 文件名策略 | 文档文件名保持不动（避免外链与引用路径破坏），仅改内容与显示文案。 |
| 规则化落地 | 新增全局 Cursor 规则，固化上述命名约束，降低后续回退风险。 |

---

## 2. 最终操作（落地清单）

### 2.1 文档与页面元信息

1. `README.md`  
   - H1 改为 `The Movie Cosmos（TMDB Movie Cosmos / Chronicle v3）`  
   - 开篇描述品牌名改为 `The Movie Cosmos`
2. `docs/project_docs/TMDB 电影宇宙 Tech Spec.md`  
   - H1 改为 `The Movie Cosmos - 技术实现方案 (Tech Spec)`  
   - 首段品牌名改为 `The Movie Cosmos`
3. `docs/project_docs/TMDB 电影宇宙 Design Spec.md`  
   - H1 改为 `The Movie Cosmos - 视觉与交互设计规范 (Design Spec)`
4. `frontend/index.html`  
   - `<title>` 最终设为 `the movie cosmos`  
   - 保留/补充 description 元信息（叙述文本使用 `The Movie Cosmos`）

### 2.2 多语言文案（locales）

统一规则：
- `cover.title` -> `the movie cosmos`（UI 标识层）
- `info.introBody` -> `The Movie Cosmos ...`（正文叙述层）

涉及文件：
- `frontend/src/lib/locales/en.json`
- `frontend/src/lib/locales/zh.json`
- `frontend/src/lib/locales/zh-Hant.json`
- `frontend/src/lib/locales/es.json`
- `frontend/src/lib/locales/fr.json`
- `frontend/src/lib/locales/ja.json`
- `frontend/src/lib/locales/ar.json`

### 2.3 持久规则（防回退）

新增：
- `.cursor/rules/branding-name-convention.mdc`

规则核心：
- UI identity surfaces must use `the movie cosmos`
- Narrative text must use `The Movie Cosmos`
- 不再将 `TMDB Movie Cosmos` 作为正式品牌主名

---

## 3. 验证与结果

### 3.1 一致性验证

已对以下点位进行 grep 复核：
- `frontend/index.html`：`<title>the movie cosmos</title>` 生效
- 全部 locale：`cover.title` 为 `the movie cosmos`
- 全部 locale：`info.introBody` 使用 `The Movie Cosmos`
- `README.md`、Tech Spec、Design Spec 的主品牌文案已统一

### 3.2 质量检查

- 对 `frontend/index.html` 与 `frontend/src/lib/locales/*` 进行 lint 检查：**无新增报错**

---

## 4. 与 P22.7 计划对照

| 计划项 | 结果 |
|--------|------|
| README 品牌统一 | 已完成 |
| Tech Spec / Design Spec 品牌统一 | 已完成（文件名未改，内容已统一） |
| `index.html` title 与描述 | 已完成（title 最终按决策使用小写） |
| locales 品牌统一 | 已完成，并扩展到多语言一致口径 |
| 不改 repo/目录/git remote | 已遵守 |

---

## 5. 产出结论（SSOT）

P22.7 最终品牌规范以本报告 + `.cursor/rules/branding-name-convention.mdc` 为准：

- **品牌标识（UI/封面/Logo）**：`the movie cosmos`
- **叙述文案（README/Docs/Intro 等）**：`The Movie Cosmos`

后续若新增页面/文案，按该双写法规则执行。
