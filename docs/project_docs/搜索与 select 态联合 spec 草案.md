# 搜索与 select 态联合 spec 草案（P8.6）

> **状态**：草案，**无代码实装**；与 [Phase 8 计划](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md) P8.6 及 [Phase 5.0 评估报告](../reports/Phase%205.0%20项目全面评估与测试报告.md) **H6（搜索入口）** 对齐。定稿后适合拆入 **Phase 9** 或独立迭代。  
> **SSOT 交叉引用**：[星球状态机 spec.md](星球状态机%20spec.md)（`select` 为延后态）、[TMDB 电影宇宙 Tech Spec.md](TMDB%20电影宇宙%20Tech%20Spec.md) §1.1、§1.2（Bloom 选择性）。

---

## 1. 目标

- 在**不破坏** P8.4 双 `InstancedMesh` + `gl_InstanceID` + 现有 `hover` / `focus` 链的前提下，定义 **search（检索）** 与 **select（多选/关联高亮）** 的产品与技术边界。  
- 为 **selective bloom**、**HUD 布局**、**多选模型** 预留决策点，供 review 后一次性或少次数拍板。

## 2. 待用户拍板的决策点

### 2.1 单选 / 多选 / 图关联

| 方向 | 说明 | 影响 |
|------|------|------|
| **A — 单选** | 在现有 `selectedMovieId` 上扩展，无集合 | 实现面最小；与 P8.4 一致 |
| **B — 多选** | 集合/ID 列表 + 列表 UI（chip？侧栏？） | Store、Escape 清空、与 timeline 的优先级 |
| **C — 关联高亮** | 导演/演员/制片厂等「同一图谱」边 | 需连线 mesh 或同 hue 多实例高亮、性能与可读性评估 |

**草案建议**：先 **B 或 C 二选一** 为 MVP；若 C，需明确**仅高亮、不连线的浅色描边**是否可接受为 Phase 9.0。

### 2.2 搜索框入口位置

| 方向 | 说明 |
|------|------|
| **HUD 顶栏** | 固定关键词输入，与 TMDB 类站心智一致 |
| **命令面板** | `Cmd/Ctrl+K` 全屏/半屏，偏 power user |
| **侧抽屉内** | 不挡画布，与详情抽屉分栏或 Tab |

**草案建议**：与 **H6** 一致，优先验证 **顶栏** 小入口 + 无结果空态，避免首屏强占 3D。

### 2.3 Selective Bloom 实装路径

| 方向 | 说明 | 风险 |
|------|------|------|
| **双 Layer** | 选中集合走独立 `Layer`，composer 多 pass 或后合成 | 与当前「简单 Bloom + threshold」分叉，要测性能 |
| **后处理 mask** | `Selection` / ID buffer → Bloom 前乘 mask | 多一张 RT、shader 联调 |
| **无 selective** | 仅用 emissive/颜色脉冲表示选中，**不**改 Bloom 管线 | 最省时，与 PRD「高分刺眼」不冲突时可行 |

**草案建议**：Phase 9 先 **emissive/描边/实例 color** 验证可读性，再开「双 Layer Bloom」子项。

## 3. 与评估报告 5.3.3 的关系

- 全项目表格中 **「搜索与筛选 | 未实现 | 低」**（见《Phase 5.0 报告》）本草案将 **H6 搜索入口** 与 **select 高亮** 合谈，避免两条需求重复定接口。  
- **验收**：本页 review 通过即 P8.6 文档项 closure；**代码** 独立里程碑。

## 4. 待办（下阶段清理）

- **P8.1 双字段过渡**：`genre_color` + `genre_hue` 长期共存策略；移除旧字段时须 bump 主版本并全量回归（见 [Tech Spec §4.2 `has_genre_hue`](TMDB%20电影宇宙%20Tech%20Spec.md)）。  
- **P8.5 降级**（若启用）：idle → `Points` 时，搜索命中集与 `Raycaster` 路径须在 Tech Spec 再写一节。  

---

| 版本 | 日期 | 说明 |
|------|------|------|
| 0.1 | 2026-04-27 | P8.6 首次落盘，三决策点 + 待办 |
