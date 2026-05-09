# Phase 23.2 P23.2 Loading Figma 对齐实施报告

## 1. 背景与目标

P23.2 目标是将加载阶段从旧版「条形进度 + 多段说明」重构为 Figma 对齐的产品化封面加载态，并与后续 P23.3 的 cover/perlin 入口衔接。

- 执行分支：`feat/p23-2-loading-figma`
- 设计参考：`https://www.figma.com/design/GH91lmI9odwWLWeH2dSwCI/Chronicle-V3-3D-Galaxy?node-id=187-44&m=dev`
- 本次范围：仅先做英文 UI（不做 i18n 扩展）

## 2. 最终决策（定稿）

### 2.1 视觉与布局

- Loading 全屏背景采用浅灰：`#f2f2f2`
- 左侧品牌三行文案固定为小写：`the / movie / cosmos`
- 右侧主文案：`today`
- Loading 信息行改为「百分比 + 简短阶段词」，不再显示其它描述性文字
- Loading 信息行位置：垂直居中、贴右侧
- `Start` 按钮位于屏幕正中，作为未来被 perlin 星球替代的占位入口

### 2.2 字体策略

- 标题字体使用 `Butler FREE VERSION`
- 不新引入 Roboto
- Butler 以全套（当前项目已有的 7 个权重）接入，供后续字重微调
- 下载信息行沿用系统/现有常规字体（未强制改为 Butler）

### 2.3 进度阶段与百分比分配

最终规则：

- `Download`：`0 ~ 70%`（按真实下载比例线性映射）
- `Decompress`：`75%`
- `Parse`：`85%`
- `Search Index`：`90%`（加载中）到 `100%`（ready/skipped/error）

> 注：该映射满足「70/10/10/10」的阶段分配意图，并保证阶段边界可读。

### 2.4 最终动画时序（用户定稿）

从 `loading -> await-start` 切换时严格按以下顺序：

1. loading 信息行立即消失（无动画）
2. `cosmos` opacity `100 -> 4`，`500ms`
3. `Start` 立即显示（无动画）
4. `today` opacity `0 -> 100`，`500ms`

该时序通过显式阶段机保证，避免并行动画造成观感冲突。

### 2.5 品牌字号与行距定稿

- 品牌字号统一：`120 / 180 / 240`（base / sm / lg）
- `the/movie/cosmos/today` 共用同一字号 token
- 行距改为固定 `leading` 控制（移除负 margin 压行距方案）

## 3. 最终操作清单（已落地）

## 3.1 文件变更

1. `frontend/src/components/Loading.tsx`
2. `frontend/src/index.css`

### 3.2 `Loading.tsx` 关键实现

- 删除旧条形进度条和四列步骤行
- 引入 `computeLoadingDisplay()` 输出 `{ percent, stageLabel }`
- 新增阶段机 `TransitionStage`：
  - `loading`
  - `cosmos-fade`
  - `start-shown`
  - `ready`
- 用 `setTimeout` 串行驱动阶段切换，确保「前一步结束再开始下一步」
- 统一品牌字号类与固定行距类，减少重复并便于后续调参
- `today` 与 `the/movie/cosmos` 使用同一套字号参数

### 3.3 `index.css` 关键实现

- 新增 `@font-face`：`Butler FREE VERSION`（7 个字重）
  - 200 / 300 / 400 / 500 / 700 / 800 / 900
- 新增主题 token：`--font-butler`
- 根字体栈去除 `Roboto`，符合本次要求

## 4. 与原计划差异说明

- 计划中提到「如有必要补充 prefers-reduced-motion 降级」，本次未额外加入（当前动画仅 opacity 且时长短，风险较低；可在 P23.2 补丁中追加）
- Storybook 更新未在本轮执行（本轮聚焦主路径功能定稿）

## 5. 验证与结果

已执行：

- `npx tsc -b`（frontend）通过

说明：

- 仓库存在与本任务无关的既有 ESLint 报错（其他模块），未在本次处理范围内

## 6. 交付结论

P23.2 本轮范围内的「最终决策 + 最终操作」已全部落地：

- Figma 对齐的 Loading 视觉结构已替换
- 进度表达改为「百分比 + 简短阶段词」
- Start 入口居中并预留 perlin 替换位
- 动画时序已按定稿实现（串行）
- Butler 字体体系已接入并可继续调权重
