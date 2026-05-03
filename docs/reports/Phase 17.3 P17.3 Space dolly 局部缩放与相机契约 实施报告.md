# Phase 17.3 — Space dolly（局部缩放）与相机契约 · 实施报告

> **日期**：2026-05-03（与仓库落地版本一致）  
> **代码主路径**：`frontend/src/three/camera.ts`，协同 `frontend/src/three/scene.ts`、`frontend/src/store/galaxyInteractionStore.ts`  
> **SSOT**：交互与相机契约以 **`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`** §1.4.1 / §1.4.3 / §1.4.4 及本报告发布后同步段落为准。

---

## 1. 背景与目标

在 Phase 17 中，`zCamDistance` 由固定常量变为**运行时 standoff**，用于局部「放大镜」式观察星系平面。**早期方案**曾约定 **Alt + 滚轮** dolly；实际落地中发现 **Alt 被浏览器 / OS 用于菜单与选中 UI**，导致 **keyup 不可靠**、局部缩放与系统快捷键冲突。

本阶段目标：

- 使用**不与浏览器 Alt 菜单冲突**的按键触发 dolly；
- **松开触发键**即恢复默认机位距离，滚轮恢复 **macro Z / Timeline** 语义；
- **Ctrl + 滚轮**继续交给**浏览器页面缩放**（不 `preventDefault`），避免与触摸板 pinch 的 `ctrlKey` 纠缠；
- dolly 路径下 **zCurrent / fov 不变**，仅改 **`zCamDistance`** 与相机 **XY**（光标锚定）；
- **focus 会话**（`getMacroZWheel === false`）滚轮仍为 **noop**（含本阶段局部缩放），与 P13.3 一致。

---

## 2. 最终交互契约（产品）

| 输入 | 宏观 idle（`getMacroZWheel === true`） | focus / 非 macro |
|------|----------------------------------------|------------------|
| **无修饰键 + 滚轮** | 推进 **`zCurrent`**（macro Z），`camera.z = zCurrent - zCamDistance` | 历史特写推拉：`camera.z += dz`（见 `camera.ts`） |
| **按住 Space + 滚轮** | **dolly-to-cursor**：只改 **`zCamDistance`**，并平移 **camera.x/y** 保持光标下 **`z = zCurrent`** 平面上的世界命中点 | **noop**（不进入 dolly） |
| **松开 Space**（且本轮曾「武装」dolly） | 将 **`zCamDistance` 复位为默认 `30`**，并写回 **`camera.position.z`** | 同上（若曾武装） |
| **Ctrl + 滚轮** | **不处理**：不 `preventDefault`，不改 store | 同左 |

**输入框 / 可编辑区域**：`INPUT` / `TEXTAREA` / `SELECT` / `contenteditable` / 常见 ARIA `textbox|searchbox|combobox` 上 **不武装 Space**（避免拦截搜索框空格）。

**失焦**：`window` **`blur`** 时若仍认为 Space 按住，**清除武装并复位** `zCamDistance`，避免 Alt-Tab 后状态卡住。

---

## 3. 最终参数与安全区（实现）

| 项 | 值 / 规则 | 说明 |
|----|------------|------|
| 默认 **`zCamDistance`** | **`30`** | 与 `GALAXY_ZCAM_DISTANCE_DEFAULT`、`galaxyInteractionStore` 初值一致 |
| **局部 dolly 对 `zCamDistance` 的 clamp** | **`[2, 30]`** | **下限 2**（避免穿过 `zCurrent` 平面 / near 壳层）；**上限 = 默认 standoff** → **仅允许相对默认机位「推近」**，不允许通过 dolly 把相机拉得比默认 **更远**（历史计划中的 **[2, 300]** 上界在 **dolly 路径已废止**） |
| **滚轮刻度 → ΔzCamDistance** | `dz = sign(deltaY) * zScrollSpeed * min(abs(deltaY)/100, 3)` | 与 macro Z 共用 `zScrollSpeed` 默认 **0.15** |
| **速度系数** | `baseSpeed = DOLLY_SPEED_MUL * max(prevR/30, 0.5)`，`DOLLY_SPEED_MUL = 5` | 远距略快、近距不慢于一半基准 |
| **强变焦缓和** | `nearEase = clamp(prevR / 14, 0.22, 1)`，`speed = baseSpeed * nearEase` | **小 `prevR`** 时减小单步 **ΔR**，减轻锚点 XY 补偿单帧过大造成的「跳变」体感 |

---

## 4. 几何实现要点（锚定光标）

- **平面**：宏观观测深度 **`z = zCurrent`**（与 Timeline / `bridgeZ` 读数同一轴）。
- **求交**：使用 **`Raycaster.setFromCamera(ndc, camera)`** + **`Plane(normal=(0,0,1), constant=-zCurrent)`** 求射线与水平面交点；替代早期手写 **`unproject` + 标量 t**，与 **`GALAXY_CAMERA_EULER`** 及 Three 矩阵栈一致，减少锚点误差。
- **流程**：取 **dolly 前**交点 **`H_before`** → 更新 **`zCamDistance` 与 `camera.z`** → **`updateMatrixWorld(true)`** → 取 **dolly 后**交点 **`H_after`** → **`camera.x/y += H_before - H_after`** → **`clampGalaxyCameraXY`**。
- **每步开始**：补 **`camera.updateMatrixWorld(true)`** 再算第一次射线，避免矩阵落后一帧。

---

## 5. Dev 调试开关（仅排错）

在控制台设置（布尔）：

| 全局变量 | 作用 |
|----------|------|
| **`window.__galaxyCameraSpaceDollyDebug`** | Space **keydown/keyup** 与武装 / 复位分支 |
| **`window.__galaxyCameraDollyPosDebug`** | **dollyToCursor** 完整锚点字段（ndc、prevR/nextR、world 命中、`anchorPanDelta`、clamp 前后 XY）；**`clampCameraXY`** 在任意路径裁剪 XY 时打印 |

开发环境挂载时会打印一行提示上述开关（见 `camera.ts`）。

**说明**：源码中**未**实现计划草案里的 **`__galaxyInteraction.dollyZoomSpeed`** 独立桥；灵敏度以 **`DOLLY_SPEED_MUL`、`nearEase`、`zScrollSpeed`** 为准。

---

## 6. 与 Phase 17 计划草案的差异（决策记录）

| 草案 / 旧版 SSOT | 最终实现 | 原因 |
|------------------|----------|------|
| **Alt + 滚轮** dolly | **按住 Space + 滚轮** | Alt 与浏览器选中 / 菜单 UI 强冲突；keyup 不可靠 |
| **Alt 松开复位** | **Space 松开复位**（仅当本轮武装过 dolly） | 与触发键一致；输入框空格不误复位 |
| **Ctrl + pinch 可走 dolly** | **Ctrl + 滚轮完全不处理相机** | 与页面缩放抢手势；pinch 常带 `ctrlKey` |
| **dolly clamp `[2, 300]`** | **dolly 仅 `[2, 30]`**（上限 = 默认） | 产品要求：局部缩放**只允许放大**，不允许相对默认再拉远 |
| 手写 **unproject** 锚点 | **Raycaster + Plane** | 与 Three 射线定义一致，减轻强变焦下锚点跳跃 |

---

## 7. 验收要点（手测）

- 宏观 idle：**按住 Space + 滚轮** → 仅 **`zCamDistance` / XY** 变，`zCurrent` 不变；Timeline 指针不因该滚轮前进。
- **松开 Space** → **`zCamDistance` 回到 30**，无修饰键滚轮恢复推进 **`zCurrent`**。
- **Ctrl + 滚轮** → 浏览器缩放页面，画布不劫持。
- **focus 态**：滚轮 **noop**（含按住 Space）。
- 搜索框内输入空格 → **不**触发 dolly 武装。

---

## 8. 文档同步清单（SSOT）

以下文档已随本报告一并更新至与代码一致：

- `docs/project_docs/TMDB 电影宇宙 Tech Spec.md`（§1.4.1 / §1.4.3 / §1.4.4）
- `docs/project_docs/TMDB 电影宇宙 Design Spec.md`（§2.1）
- `docs/project_docs/视觉参数总表.md`（§1、Wheel 双模式、§8）
- `docs/project_docs/星球状态机 spec.md`（§3.4.6 滚轮说明）

---

## 9. 变更文件索引（实现）

| 文件 | 变更摘要 |
|------|----------|
| `frontend/src/three/camera.ts` | Space 武装 / 复位 / blur；dolly **Raycaster**；**[2,30]** clamp；**nearEase**；Ctrl 放行；调试开关 |
| `frontend/src/three/scene.ts` | （既有）idle RAF 同步 `zCamDistance` → uniform / `camera.z`，无需为 P17.3 再改契约 |

---

*本报告替代早期「Alt + 滚轮」草案叙述；若其他归档仍出现 Alt/Ctrl dolly 或 `[2,300]` 上界，以本报告与已更新 SSOT 为准。*
