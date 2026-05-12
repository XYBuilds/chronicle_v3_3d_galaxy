# Phase 26.1 — 最终决策与实施报告

**范围**：`.cursor/plans/phase_26_device_spatial_optimization.plan.md` 中的 **P26.1（HDR / 色彩相关）**  
**状态**：本阶段 **已收口**；原计划中的 **设备矩阵式验收** 本阶段 **不执行**；**临时验证工具已全部移除**。

---

## 1. 最终结论摘要

| 主题 | 决策 / 结果 |
| --- | --- |
| **Mac 偏色（idle / active 星点 genre 色相）** | **已修复**。根因与「系统 HDR 内容管线」无关，见 §3。 |
| **HDR 内容管线** | 当前产品 **无** Web 端 HDR 交换链（仍为 **WebGL2 + `SRGBColorSpace` + 常规 8-bit 合成**，属 **SDR 语义**）。若未来要让画布在系统 HDR 开启时 **主动覆盖 HDR 亮度域**，需单独立项（能力探测、浮点缓冲、色调映射、WebGPU 等），**不在本 phase 交付**。 |
| **P26.1 验证矩阵（多机 / HDR on-off 表格验收）** | **本阶段不做**：问题已通过工程诊断与着色器修复闭环，无需保留 `?p26ColorAudit` 等 QA 入口。 |
| **临时工具与文档** | **已删除**：浮层、`todayMovieId`/`p26Today` 查询覆盖、相关单测、`data-galaxy-webgl` 标记、测试指南与旧版「矩阵」实施报告。 |

---

## 2. 本阶段实施的操作清单

### 2.1 已删除（验证工具与附属文档）

- `frontend/src/hud/P26ColorAuditPanel.tsx` — 左下角 QA 浮层（CSS 色块、sRGB 参考、WebGL `readPixels` 等）。
- `frontend/src/hooks/useP26ColorAuditFromQuery.ts` — `?p26ColorAudit=` 开关。
- `frontend/src/lib/p26TodayMovieOverride.ts` 与 `p26TodayMovieOverride.spec.ts` — `todayMovieId` / `p26Today` 覆盖 `today.json` 的逻辑与测试。
- `frontend/src/App.tsx` 中上述能力的引用与 **Cover 前 today 的 URL 覆盖分支**。
- `frontend/src/three/scene.ts` 中 **`canvas.dataset.galaxyWebgl`**（仅为浮层采样服务）。
- `docs/guides/P26.1 HDR 与色彩验证测试指南.md`
- `docs/reports/Phase 26.1 P26.1 HDR 色彩验证矩阵 实施报告.md`（由本文件替代为 **最终** 记录）。

### 2.2 保留（产品代码中的真实修复）

以下改动解决 **仅 Mac（ANGLE-Metal）** 上 idle / active 星点 genre 色相错乱、而 **Perlin 球与 Focus rating 参考在 Mac 上正常** 的现象。

1. **`oklab_to_linear_srgb` → `linear_to_srgb` 前增加 gamut clamp**  
   - 文件：`frontend/src/three/shaders/galaxyIdle.vert.glsl`、`frontend/src/three/shaders/galaxyActive.vert.glsl`  
   - 做法：`vec3 lin = clamp(oklab_to_linear_srgb(vec3(...)), 0.0, 1.0);` 再 `vColor = linear_to_srgb(lin);`  
   - **原因**：部分 hue 在 OKLab 映射下会得到 **sRGB 色域外** 的 **负线性通道**；`linear_to_srgb` 内对负值做 `pow(..., 1/2.4)` 在 GLSL ES 3.0 中为 **undefined behavior**。macOS / ANGLE-Metal 上易得到 **NaN** 并经 `mix()` 污染最终颜色；Windows / ANGLE-D3D11 常表现为静默退化，故 Windows 不易察觉。  
   - **对齐**：与既有 `frontend/src/three/shaders/perlin.frag.glsl` 中 `hueToOkSrgb` 在 gamma 前 **clamp** 的策略一致。

2. **实例属性 `aHueVoteSize` 使用 vec4 打包（第 4 分量填 0）**  
   - 文件：`frontend/src/three/galaxyMeshes.ts`、`上述 vert`、`frontend/src/three/interaction.ts`（`itemSize === 4` 断言）  
   - **定位**：Apple Metal / ANGLE 下 **16 字节对齐** 的 instanced 属性更稳妥；**注释已标明**：此为防御性布局，**并非**本次色相 bug 的根因（根因是 §2.2.1 的 clamp）。

3. **GLSL 注释中的反引号**  
   - 曾触发 `vite-plugin-glsl` / oxc 预处理将 `` ` `` 误判为 JS 模板字符串起点；已改为无反引号注释（见当前 shader 文件）。

### 2.3 诊断过程（事实记录，便于日后审计）

- 通过临时将 `vColor` 改为编码 raw hue / 在 `scene.ts` 暴露 buffer dump（**均已移除**）验证：**CPU 写入的 `hueOnBuffer` 与期望一致**，问题不在实例 buffer 上传。  
- 对比 **Perlin**（frag 内 clamp）与 **galaxy vert**（原先无 clamp）路径差异，收敛到 **gamma 前 gamut clamp** 修复。

---

## 3. 与「HDR」一词的关系（避免概念混用）

- **系统 / 显示器「HDR 模式」**：仍可影响 **SDR 网页** 在屏上的 **观感**（OS 做 SDR→HDR 映射等），但 **不改变** 当前仓库内 **画布内容的编码语义**（仍为 SDR / sRGB 路径）。  
- **`matchMedia('(dynamic-range: high)')`**：仅表示浏览器报告的 **高动态范围能力倾向**，**不等于** 本应用已实现 **HDR 画布输出**；原 P26.1 浮层中的该提示属 QA 文案，随工具已删。  
- **未来若要做「真 HDR 出屏」**：需单独需求与架构评估（见历史讨论：WebGPU 扩展动态范围、回退策略、与 HUD/DOM 分层等），**不在 P26.1 本报告范围内展开实现**。

---

## 4. 验收与计划表

- **本报告替代** 原「HDR 色彩验证矩阵」类验收表：本阶段 **不对** Mac/Windows × HDR on/off × 多浏览器矩阵做正式签字验收。  
- **Phase 26 计划文件**（`.cursor/plans/phase_26_device_spatial_optimization.plan.md`）中 P26.1 todo 的语义：以 **工程结论 + Mac 问题修复** 收口；矩阵化验收若仍需要，建议并入 **后续专门回归** 或 **P26.4 SSOT** 再定义口径。

---

## 5. 相关源码路径（修复保留处）

| 路径 | 说明 |
| --- | --- |
| `frontend/src/three/shaders/galaxyIdle.vert.glsl` | idle 星点：OKLab → linear sRGB **clamp** → sRGB。 |
| `frontend/src/three/shaders/galaxyActive.vert.glsl` | active 星点：同上。 |
| `frontend/src/three/galaxyMeshes.ts` | `aHueVoteSize` **vec4** 实例缓冲与注释。 |
| `frontend/src/three/interaction.ts` | `aHueVoteSize` **itemSize === 4** 断言。 |
| `frontend/src/three/shaders/perlin.frag.glsl` | 参考实现（gamma 前 clamp）。 |
| `frontend/src/three/scene.ts` | `renderer.outputColorSpace = THREE.SRGBColorSpace`（仍为 SDR 语义出口）。 |

---

## 6. 变更提交建议（Git）

建议单次提交信息示例：

```text
chore(p26.1): remove HDR color QA tools; finalize P26.1 report

- Drop P26ColorAuditPanel, URL today override, galaxyWebgl marker, guide, matrix report
- Keep Mac OKLab→sRGB clamp fix + vec4 aHueVoteSize (defensive)
```

---

*报告日期：以仓库当前 Phase 26.1 收口为准。*
