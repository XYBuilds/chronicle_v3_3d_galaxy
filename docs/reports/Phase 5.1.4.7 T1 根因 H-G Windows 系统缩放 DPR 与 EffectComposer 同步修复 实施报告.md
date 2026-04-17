# Phase 5.1.4.7 T1 根因 H-G（Windows 系统缩放 / DPR > 1）与 EffectComposer 同步修复 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.4.7**（frontmatter 项 **`p5-1-4-7-t1-hg`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — **Issue T1**；计划 **Rev 3** 将根因收敛为 **H-G**（经用户复测：100% 缩放不复现，125%/150% 下右下视窗裁切与「需旋转补偿」错觉）。  
> **报告日期**: 2026-04-17  
> **范围**: 在 `frontend/src/three/scene.ts` 中修正 **WebGLRenderer** 与 **EffectComposer** 对 **devicePixelRatio** 的处理顺序与一致性；增加运行时 **DPR 变化** 的兜底重布局。**不**修改 `GALAXY_CAMERA_EULER`、**不**将目测 yaw/pitch（如 -15° / -7.5°）写入代码常量。  
> **不在范围**: 5.1.4.5（H-A）与 5.1.4.6（H-C）已按计划取消；视距窗口（5.1.5）、三层着色器（5.1.6）、Raycaster（5.1.7）、Tech/Design Spec 正文同步（5.1.8）等后续项。

---

## 1. 摘要

在 Git 分支 **`phase-5-1-4-7-hg-dpr`** 上实施计划 **5.1.4.7**：针对 **Windows 显示缩放 125% / 150%**（`window.devicePixelRatio > 1`）下出现的 **画面右下被裁切**、以及用户主观上解读为「相机未与 Z 平行、需额外旋转」的现象，将根因定位为 **渲染管线内 DPR 处理不一致** —— 具体包括 **`setPixelRatio` 与 `setSize` 的调用顺序**、**`EffectComposer` 内部渲染目标默认 pixelRatio 与 WebGL 画布 drawing buffer 不一致**、以及 **`setSize(..., updateStyle=false)`** 在 DPR 过渡态下与 CSS 显示尺寸协同的风险。

修复后，**负责人肉眼复测**：在系统缩放 **100% / 125% / 150%** 三档下 **均已正常**（无裁切、无异常留白或拉伸主观报告），**T1 相关错觉消除**。

| 项 | 内容 |
| --- | --- |
| **假设（H-G）** | `devicePixelRatio > 1` 时，renderer 绘图缓冲、相机 aspect、EffectComposer 内部 RT 对 DPR 的处理不一致，导致视口与最终合成输出错位。 |
| **修复策略** | **`setPixelRatio` 先于 `setSize`**（renderer + composer 同步）；**`composer.setPixelRatio`** 显式与 renderer 对齐；**`renderer.setSize(w, h, true)`** 由 Three.js 统一维护 canvas CSS 尺寸；**每帧**比对 `renderer.getPixelRatio()` 与 `min(devicePixelRatio, 2)`，不一致则 **`resize()`**。 |
| **观测结论** | 用户确认 **100 / 125 / 150** 均正常 → **H-G 修复路径成立**，T1 在该环境下的表现可归因于 DPR/合成器管线而非几何或 UMAP 朝向。 |
| **代码终态** | 无临时 `[T1/H-G]` 控制台探针（避免常驻日志）；核心逻辑保留在 `scene.ts`。 |

**Git 提交（按时间顺序）**:

| SHA（短） | 说明 |
| --- | --- |
| **`415919f`** | `fix(scene): sync DPR for renderer and EffectComposer (Phase 5.1.4.7 H-G)` — 核心代码修改。 |
| **`b1ec9ef`** | `chore(plan): mark Phase 5.1.4.7 H-G completed` — follow-up 计划 frontmatter 项 **`p5-1-4-7-t1-hg`** 标记为 **`completed`**。 |

**计划同步**: follow-up 计划中 **Phase 5.1.4.7** 对应 todo 已标记为 **`completed`**（与本报告一致）。

---

## 2. 背景与目标

### 2.1 背景

- Phase 5.0 将「相机视线与 Z 轴不平行」记为 **T1**。早期排查（5.1.4.1–5.1.4.4）已依次考察 **H-E（rotation 漂移）**、**H-D（aspect / 投影矩阵）**、**H-F（vertex shader）**、**H-B（XY 密度中心）** 等路径，均未作为最终根因采纳。  
- **Rev 3** 根据用户复测：**仅在 Windows 系统缩放 > 100% 时** 出现典型「右下裁切」与主轴错觉；**100%（DPR=1）不复现**。计划将 **H-G** 锁定为 T1 在该环境下的主根因，并取消被其超越的 **5.1.4.5（H-A）**、**5.1.4.6（H-C）**。  
- 计划明确 **禁止** 将目测 **-15° / -7.5°** 等补偿写入 **`GALAXY_CAMERA_EULER`** 或任意魔法常量；本实施 **遵守** 该约束。

### 2.2 目标（对照 Phase 5.1.4.7）

| 目标 | 结果 |
| --- | --- |
| 修正 `scene.ts` 挂载与 **`resize()`** 的 DPR / 尺寸顺序 | **已完成** |
| **`EffectComposer.setPixelRatio`** 与 renderer 显式同步 | **已完成** |
| **`updateStyle=true`**（或等效 CSS 策略）降低 CSS 与 drawing buffer 比例错位风险 | **已完成**（采用 `setSize(..., true)`） |
| 监听或兜底 **设备像素比变化** | **已完成**（RAF **`tick`** 内比较并触发 **`resize()`**） |
| 不引入症状掩盖型旋转常量 | **已遵守** |
| 构建与 Lint 通过 | **`npm run build`**、**`npm run lint`** 均已通过（实施时） |
| 用户在 **100% / 125% / 150%** 下肉眼验收 | **已通过**（用户声明） |

---

## 3. 修复前行为与已知隐患（对照计划）

以下为修复前 **`resize()`** 中的典型反模式归纳（与计划 §5.1.4.7 表格一致，便于审计）：

| # | 问题 | DPR=1 时 | DPR>1 时 |
| --- | --- | --- | --- |
| 1 | **`setSize(w, h, false)`** — 不更新 canvas 内联样式 | 影响小（容器 CSS 常为 100%） | 若内部 `_width/_height` 与 CSS 在过渡态不一致，显示尺寸与物理缓冲比例可能错位 |
| 2 | **`setPixelRatio` 在 `setSize` 之后** | 影响小 | `setSize` 可能按**旧** `_pixelRatio` 分配缓冲，随后 `setPixelRatio` 再次重算，首帧或 resize 边界存在 **DPR 错位窗口** |
| 3 | **未调用 `composer.setPixelRatio(...)`** | 合成器默认内部 pixelRatio 与 DPR=1 一致 | EffectComposer 内部 RT 与 **已按 DPR 缩放** 的最终 canvas 缓冲 **viewport / 比例** 可能不一致 → **裁切或偏移** |

---

## 4. 实施说明

### 4.1 涉及文件

| 文件 | 变更摘要 |
| --- | --- |
| `frontend/src/three/scene.ts` | 挂载后 **`EffectComposer`** 创建完毕即 **`composer.setPixelRatio(renderer.getPixelRatio())`**；重写 **`resize()`** 顺序与参数；**`tick`** 内 DPR 兜底。 |
| `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` | 将 **5.1.4.7** 对应 frontmatter todo 标为 **`completed`**（与代码提交分离、便于追踪）。 |

**未修改**（本次无需）：`frontend/src/App.tsx`、`frontend/src/index.css` — 全屏宿主仍为 `fixed inset-0` + `h-dvh w-full`，与 **`updateStyle=true`** 无冲突报告。

### 4.2 `EffectComposer` 初始化

在 **`new EffectComposer(renderer)`** 之后、添加 pass 之前，增加：

- **`composer.setPixelRatio(renderer.getPixelRatio())`**  

确保合成器在**首次** `resize()` / 渲染前即与 renderer 的 pixel ratio 对齐，避免内部 render target 以默认比例分配。

### 4.3 `resize()` 最终逻辑

1. 读取容器 **`clientWidth` / `clientHeight`**，计算 **`pr = Math.min(window.devicePixelRatio, 2)`**（与既有 **`createGalaxyPoints(movies, pr)`** 及着色器 uniform 策略一致）。  
2. **`renderer.setPixelRatio(pr)`** → **`composer.setPixelRatio(pr)`**（先于尺寸）。  
3. **`renderer.setSize(w, h, true)`** → **`composer.setSize(w, h)`** → **`bloomPass.setSize(w, h)`**。  
4. **`camera.aspect = w / h`**，**`camera.updateProjectionMatrix()`**。  
5. **`galaxy.material.uniforms.uPixelRatio.value = pr`**。

### 4.4 运行时 DPR 变化

计划曾给出 **`matchMedia('(resolution: …dppx)')`** 等方案；若媒体查询字符串在注册时写死为**当前** DPR，OS 缩放变化后**不一定**可靠触发。

本次采用计划中的**简化兜底**：在 **`tick`** 中，若 **`renderer.getPixelRatio() !== Math.min(window.devicePixelRatio, 2)`** 则调用 **`resize()`**。  

- **优点**: 实现短、不增加额外事件监听与 dispose 分支；在 OS/浏览器更新 `devicePixelRatio` 但漏发 `resize` 时仍可收敛。  
- **成本**: 每帧一次数值比较，可忽略。

### 4.5 未纳入代码的项

- 计划「验证期」建议的 **`[T1/H-G]`** 详细 **`console.log` 探针** 未合入主线，避免生产与开发控制台噪音；若后续回归需要，可加 **`import.meta.env.DEV`** 门控后短期打开。

---

## 5. 验证与验收

### 5.1 自动化

| 命令 | 结果 |
| --- | --- |
| `npm run build`（`frontend/`） | 通过 |
| `npm run lint`（`frontend/`） | 通过 |

### 5.2 人工（用户声明）

| 环境 | 结果 |
| --- | --- |
| Windows 显示缩放 **100%** | 正常 |
| Windows 显示缩放 **125%** | 正常（此前典型复现档） |
| Windows 显示缩放 **150%** | 正常 |

验收口径与计划 **5.1.4.7** 一致：**画面边缘与容器贴合**、**无右下裁切**、**无需心理补偿「相机倾斜」**；且 **`GALAXY_CAMERA_EULER`** 仍为 **`(0, π, 0, 'YXZ')`**，无 **-15° / -7.5° / 0.26180 / 0.13090** 等硬编码补偿。

---

## 6. 与历史子任务的关系

| 子任务 | 结论（截至本报告） |
| --- | --- |
| 5.1.4.1 H-E | 已排除 rotation 漂移为主要根因 |
| 5.1.4.2 H-D | 已做 aspect / 投影侧排查；**H-G 为 Rev 3 锁定的用户环境根因** |
| 5.1.4.3 H-F | Vertex shader 标准 MVP，未作为根因 |
| 5.1.4.4 H-B | 方案 3 路径未采纳为 T1 主修复 |
| 5.1.4.5 H-A / 5.1.4.6 H-C | 已 **cancelled**；若 H-G 修复后仍有残留可再评估 |

---

## 7. 后续建议（非本次必做）

- **5.1.8 Spec 同步**: 在 Tech Spec **§1.4**（或渲染管线小节）增加 **「DPR：renderer 与 EffectComposer 必须同步 setPixelRatio；resize 顺序约束」**，便于后续同类 issue 排查。  
- **Storybook / 可视化回归**: 若有 CI 截图管线，可增加高 DPR 模拟或文档化「Windows 缩放」手工检查单。  
- **若残留问题**: 按计划考虑高 DPR clamp（`Math.min(..., 2)`）与 **Bloom / 其他 Pass** 的 pixel ratio 一致性，或复启已取消假设。

---

## 8. 参考代码位置（便于 Code Review）

以下片段摘自当前仓库 **`frontend/src/three/scene.ts`**（行号随文件演进可能略有偏移）：

```223:229:frontend/src/three/scene.ts
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(renderer.getPixelRatio())
  const renderPass = new RenderPass(scene, camera)
  // strength 0: disable bloom for readability / solid-entity inspection (restore e.g. 1.0 when tuning glow).
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.0, 0.5, 0.85)
  composer.addPass(renderPass)
  composer.addPass(bloomPass)
```

```276:294:frontend/src/three/scene.ts
  const resize = () => {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    const pr = Math.min(window.devicePixelRatio, 2)

    // H-G (Phase 5.1.4.7): set pixel ratio before setSize so drawing buffer uses the
    // intended DPR; keep EffectComposer in sync to avoid RT vs canvas viewport mismatch.
    renderer.setPixelRatio(pr)
    composer.setPixelRatio(pr)

    renderer.setSize(w, h, true)
    composer.setSize(w, h)
    bloomPass.setSize(w, h)

    camera.aspect = w / h
    camera.updateProjectionMatrix()

    galaxy.material.uniforms.uPixelRatio.value = pr
  }
```

```326:336:frontend/src/three/scene.ts
  let raf = 0
  const tick = () => {
    raf = requestAnimationFrame(tick)
    applySelectionFrame(performance.now())
    setGalaxyCameraZ(camera.position.z)
    const expectedPr = Math.min(window.devicePixelRatio, 2)
    if (renderer.getPixelRatio() !== expectedPr) {
      resize()
    }
    composer.render()
  }
```

---

## 9. 修订历史

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| 1.0 | 2026-04-17 | 初稿：记录 5.1.4.7 实施内容、提交 SHA、验收结论与后续建议。 |
