# Phase 14.7.1 — FocusLReference OKLab L 参考条布局与评分展示实施报告（定稿）

本文档归档 Phase 14 子项 **P14.7.1** 的**背景**、**最终锁定决策**、**迭代中的操作记录**与**验收口径**。在 **P14.7**（Timeline 横置为主、底部占高）视觉评审之后追加；**不**改 3D 渲染管线、**不**改 `voteNorm` / OKLab L 数学与 shader 数据契约，仅调整 **React HUD**（`FocusLReference`）及 **string table** 中与该组件相关的键。

关联计划：`.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md`（`p1471-focus-l-reference-vertical`：**completed**）。  
交叉引用：Phase **13.5**（FocusLReference 初版：横向光谱 + 星球下方）；Phase **14.1**（`STRINGS` / `en.json` SSOT）；Phase **14.7**（横置 Timeline 与 HUD 留白）；Drawer 中 **`Star`** 图标用法（`lucide-react`，`size-3 fill-current`）。

---

## 1. 背景与范围

### 1.1 问题与目标

- **问题**：P14.7 将 Timeline 横置在**底部**后，原先置于星球**下方**的**横向** OKLab L / `vote_average` 参考条与时间轴在垂直方向上「抢空间」，且与星球的空间关系不够清晰。
- **目标**：在 Film focus 态下，将 **OKLab L 十档色带**改为**竖条**，整体移到视口内**星球左侧**；评分展示改为 **`{rating}` + Lucide 实心星**（与 Drawer 投票星同款样式）；**指针横线**画在**色带宽度内**（与 P13.5 竖条方案语义一致）；文案与 **`aria-label`** 继续走 **`en.json` → `STRINGS`**。

### 1.2 范围边界

| 纳入 P14.7.1 | 不纳入 |
| ------------- | ------ |
| `frontend/src/hud/FocusLReference.tsx` 布局、指针、评分 UI | `colorMath` / 片元着色器中 `voteNorm`、L 映射公式 |
| `frontend/src/lib/locales/en.json` 中 `focusLReference` 键；`frontend/src/lib/strings.ts` 中 `STRINGS.focusLReference` | 新增 Storybook（计划未强制；可按 P14.8 补） |
| `.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md` 中 P14.7.1 节、mermaid 依赖、`p1471` todo | Design Spec / 视觉总表全文改版（建议 **P14.8** 同步摘要） |

---

## 2. 最终锁定决策

| 编号 | 决策项 | 最终方案 |
| ---- | ------ | -------- |
| **D1** | 色带方向与档位语义 | **垂直**色带；**`flex-col-reverse`** + DOM 顺序 `k=0…9`，使 **低 `voteNorm` 在底、高在上**，与横向时代「左低右高」一致；十档仍为 **`voteNorm = (k+0.5)/10`**，与 shader 一致。 |
| **D2** | 连续指针位置 | **`pointerAlongPct = clamp(vote_average/10,0,1)×100`**；与色带同高列内用 **`top: (100 - pointerAlongPct)%` + `-translate-y-1/2`** 对齐**几何高度**（加粗横线后仍对准同一分数高度）。 |
| **D3** | 横线绘制位置 | **横线仅叠在色带列内**：`absolute left-1/2`、`w-5`、`-translate-x-1/2`；**不**在右侧文案列再画一段「搭桥」横线（评审后退回色带上样式）。 |
| **D4** | 横线粗细 | **`h-1`（Tailwind 4px）** + `w-5`，白色实色；较原 `h-px` 明显加粗，便于在窄色带（`w-2.5`）上辨认。 |
| **D5** | 色带尺寸与圆角 | 高度 **`h-[min(70vh,28rem)]`**（拉长且随视口封顶）；宽度 **`w-2.5`**；**无圆角**（移除 `rounded-sm`）。 |
| **D6** | 整体位置 | 根容器 **`fixed`**：**`top-1/2 -translate-y-1/2`**（相对视口垂直居中）；**`left-[max(0.75rem,calc(50vw-22rem))]`**（随视口左限 + 相对「中心偏左」启发式，与星球左侧留白配合；具体像素可在 P14.8 微调）。 |
| **D7** | 色带与文案间距 | 色带列与右侧文案列 **`gap-4`**（约 1rem），使 **`6.5 + Star`** 与色带右缘 / 横线端拉开距离。 |
| **D8** | 评分可见文案 | **`vote_average.toFixed(1)`** 文本 + **`Star`**（`lucide-react`），**`className="size-3 fill-current"`**，与 **`Drawer.tsx`** 中投票星一致；**不再**使用「`Rating = {{rating}}`」英文模板。 |
| **D9** | 文案列与指针垂直对齐 | 右侧列与色带**同高**；内层 **`top` + `translateY(-50%)`** 与色带横线使用同一 **`pointerTopPct`**，保证 **分数 + 星** 与横线**同一高度**。 |
| **D10** | 无障碍 | 根节点保留 **`role="img"`**；**`aria-label`** 使用独立句子模板（见 §4），**不**依赖可见区是否含「star」字符。 |
| **D11** | 交互 | 整块 **`pointer-events-none`**（与 Phase 13 一致），不抢画布指针。 |
| **D12** | z-index | **`z-[35]`**，低于需点击的 HUD、高于画布；与既有 HUD 分层策略一致。 |

---

## 3. 布局与结构（实现摘要）

```
fixed 根容器 (top-1/2, flex row, gap-4)
├── 列 A：色带 (relative, h-[min(70vh,28rem)], w-2.5, flex-col-reverse)
│     ├── 10 × flex-1 色块
│     └── 横线指针 (absolute, left-1/2, w-5, h-1, top+translateY 居中)
└── 列 B：文案轨 (relative, 同高, min-w)
      └── 绝对定位行 (同 top / translateY)
            └── span: ratingStr + <Star />
```

---

## 4. 文案与 `STRINGS`

### 4.1 `en.json`（定稿）

- **删除**：`focusLReference.ratingLine`（原 `"Rating = {{rating}}"`）。
- **保留并重写**：`focusLReference.ariaLabel`  
  **`"{{rating}} out of 10 on OKLab L spectrum for {{filmTitle}}; ten bands at half-step ratings"`**

### 4.2 `strings.ts`

- **`STRINGS.focusLReference.ariaLabel(rating, filmTitle)`**：对上述模板做 **`interpolate`**。
- **移除**：`ratingLine` 辅助函数（无其它引用）。

---

## 5. 实施操作清单（源码文件）

| 路径 | 操作摘要 |
| ---- | -------- |
| `frontend/src/hud/FocusLReference.tsx` | 竖直色带 + 色带内加粗横线指针；右侧同高 **`rating + Star`**；`fixed` 定位与 `gap-4`；`console.assert` 十档色带数量保留。 |
| `frontend/src/lib/locales/en.json` | `focusLReference` 仅保留 **`ariaLabel`** 模板。 |
| `frontend/src/lib/strings.ts` | **`focusLReference`** 仅导出 **`ariaLabel(rating, filmTitle)`**。 |
| `.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md` | 增加 **§P14.7.1**、overview、todos（`p1471`）、mermaid **P147 → P1471 → P148**、P14.8 回归项中 FocusLReference 同框验收。 |

### 5.1 Git 交付（参考）

实施阶段使用分支名：**`phase-14-7-1-focus-rating-vertical-left`**（与计划子项对应；合并后主分支以仓库 **`git log`** 为准）。

---

## 6. 迭代记录（按讨论顺序，供审计）

以下为对话与提交过程中**显式要求**的演进（与 §2 定稿一致处不再重复细节）：

1. **立项**：在 P14.7 横置时间线视觉评审后新增 **P14.7.1**；Focus 态 Rating 参考改为**垂直**，并移至**星球左侧**；**新开分支**再改。
2. **首版落地**：横向光谱改为纵向；`left` 相对视口中心偏左；指针由 **`bottom`%** 控制沿色带位置。
3. **视觉抛光**：色带**加长**（`min(70vh,28rem)`）；根容器 **视口垂直居中**（`top-1/2`）；**去掉圆角**。
4. **评分展示**：可见区由 **`Rating = x.x`** 改为 **`x.x` + Lucide `Star`**（与 Drawer 同款 class）；**`aria-label`** 改为含 **「out of 10」** 的完整英文句；文案列与指针**同高**、位于色带**右侧**。
5. **指针**：短横线从「右侧搭桥」**退回仅画在色带上**（`left-1/2` / `w-5`）。
6. **间距与线宽**：横线 **加粗**（演进至定稿 **`h-1`**）；色带列与文案列 **`gap-4`** 增大间隔。

---

## 7. 验收口径

- Film focus 且存在 **`focusLightnessSnap`** 时：竖条、色带内白横线、右侧 **`{toFixed(1)}` + Star** 同时可见；垂直位置与 **`vote_average/10`** 一致。
- **横置 Timeline** 打开时：底部时间轴与左侧参考条**无严重重叠**、可读性可接受。
- **`?timeline=vertical`**：左侧纵轨与 Focus 参考条可能较近；接受度以产品为准，必要时在 P14.8 **仅调 `left` / gap**（不改数据路径）。
- **`aria-label`**：屏幕阅读器读出 **分数 + out of 10 + 片名 + spectrum 说明**；**无**对已删除 `ratingLine` 键的依赖。
- **回归**：`npm run build`（`tsc -b && vite build`）通过；生产 UI 路径 **`rg` 中文** 仍符合 P14.1 约定（本变更仅英文模板）。

---

## 8. 风险与后续（简短）

| 风险 | 缓解 |
| ---- | ---- |
| 窄屏下 `left` 启发式与 SearchBar / Timeline 纵轨重叠 | 以实机断点微调 **`max(..., calc(50vw - …))`** 或增加 **orientation 感知**（若产品要求，另开子任务）。 |
| 色带 **`overflow-hidden`** 裁切 **`w-5`** 横线超出 **`w-2.5`** 的翼展 | 与旧版一致：横线在条内居中，翼展可被裁切为「条宽内可见段」；若需横线完整伸出条外，需 **`overflow-visible`** 并单独评估与邻 HUD 的叠层。 |

---

## 9. 文档与计划同步建议（P14.8）

- 在《TMDB 电影宇宙 Design Spec》**Focus / HUD** 相关小节增加一句：**Film focus 时 OKLab L 参考为竖条 + 色带内指针 + 右侧 `rating`+星；`aria-label` 见 `en.json` `focusLReference.ariaLabel`。**
- 计划文件 **`p1471`** 已与本文档对齐为 **completed**；合并前确认 **P14.7** 主 todo 状态与分支策略一致。

---

*文档版本：与仓库中 `FocusLReference.tsx`、`en.json`（`focusLReference`）、`strings.ts` 定稿一致。*
