# Phase 7.1 · P7.1 I2 视觉参数总表 — 实施报告

> 对应 [Phase 7 plan（I2 + I5 + I6）](../../.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md) 中的 **P7.1（I2 参数清单化）**：扫代码并产出对外可验收的「视觉参数总表」，为 P7.3 人工扫参与是否引入 dev-only GUI 提供依据。

## 1. 做了什么事

| 项目 | 说明 |
|------|------|
| **Git** | 在 `main` 上新建分支 `phase7/p7-1-visual-param-sheet`，在该分支上提交文档变更。 |
| **产出** | 新增 [`docs/project_docs/视觉参数总表.md`](../project_docs/视觉参数总表.md)：汇总相机与渲染器、宏观 `Points`（`galaxy.ts` + `point.{vert,frag}.glsl`）、屏幕圆盘拾取（`interaction.ts` 与 shader 同构约束）、选中飞入与微观球（`scene.ts` + `planet.ts` + `perlin.{vert,frag}.glsl`）、`UnrealBloomPass`（`scene.ts`）、相机控件（`camera.ts`）、`galaxyInteractionStore`、Storybook `GalaxyThreeLayerLab`、HUD（`Timeline` / `Drawer` / `MovieTooltip`）及 `window.__bloom` / `__galaxyPointScale` / `__galaxyColor` 调试桥。 |
| **表格字段** | 各小节以表格列出：**当前值、文件与行号、作用、建议取值范围、依赖关系**（与计划要求一致）。 |
| **§11 统计与结论** | 给出 **uniform 槽位**口径（宏观 9 + 微观 14 = **23**）与 **P7.3 常调外观项**口径（**14**，若含 `uZCurrent` 为 **15**）；按 plan 阈值 **≥10** 给出 **建议引入 dev-only GUI（leva / lil-gui，`import.meta.env.DEV`）**，并注明可用 Storybook Controls + 控制台 `window.__*` 作为替代选型。 |
| **防回归** | 文档末尾附「同步修改清单」：强调 `gl_PointSize` 与 `computePointScreenRadiusCss` 必须联动等。 |

## 2. 未包含的范围（按 plan 边界）

- **未改业务代码**：P7.1 仅文档化现有实现，未回写 shader 常量、未加 leva/lil-gui。  
- **P7.2 / P7.4 / P7.5**：DATA.md、INFO 按键、阶段收尾不在本次。  
- **P7.3**：人工扫参与定稿回写依赖本总表与用户审美结论，单独执行。

## 3. 验收对照（计划 P7.1 条目）

- [x] 扫描源覆盖 `frontend/src/three/`、`*.{vert,frag}.glsl`、`galaxy.ts`、`galaxyInteractionStore.ts`、Bloom、`GalaxyThreeLayerLab`、HUD 相关。  
- [x] 产出路径为 `docs/project_docs/视觉参数总表.md`。  
- [x] 每项具备当前值 / 文件:行号 / 作用 / 取值范围 / 依赖（表格化）。  
- [x] 文末含 uniform 级条目统计与 dev-only GUI 判断。  

## 4. 相关链接

- Plan：[`.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md`](../../.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md)  
- 总表：`docs/project_docs/视觉参数总表.md`  
- 后续：P7.3（I2 人工扫参）、P7.2（I6 GitHub Pages + gzip 数据）可与本报告并行查阅 plan 依赖图。
