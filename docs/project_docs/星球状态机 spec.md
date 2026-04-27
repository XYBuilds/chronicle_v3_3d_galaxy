# 星球状态机 spec（Phase 8.0 草案）

> 与 [Phase 8 计划](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md) 对齐；后续 P8.1–P8.5 实现与回写以本文件为单一事实源（SSOT），与 [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md)、《视觉参数总表》、《Tech Spec》、《Design Spec》交叉引用。

## 1. 范围与命名

| 状态 | 含义（宏观 + 微观） | 本 Phase 是否实装 |
|------|---------------------|-------------------|
| **idle** | 时间轴当前条带外或弱可见；无 hover、无选中、无 focus | 生产：`galaxyIdle` `Icosahedron(1,0)`（`galaxyMeshes.ts`） |
| **active** | 片元在 `uZCurrent … uZCurrent+uZVisWindow` 清晰条带内，且非 focus；可参与拾取 | 生产：仅对 **`galaxyActive`** 拾取（`interaction.ts`） |
| **hover** | `hoveredMovieId` 命中；**不改变** mesh 尺度，仅 HUD（tooltip + HTML hover ring，**无 CSS transition**，即时显隐） | 已有 store 字段；P8.4 对齐 ring |
| **focus** | 选中飞入完成：相机对准目标片、Perlin 球独占；双 galaxy mesh 上该 `instanceId` **scale 归零** | 现有 planet + 相机动画；P8.3/P8.4 调整 |
| **select**（延后） | 多选 / 关联高亮等；本 Phase **仅占位**，见 P8.6 草案 | Phase 9 候选 |

## 2. 共享数学：Z 条带与 smoothstep 过渡

- 清晰条带（与现 `point.vert` 一致）：`zLo = uZCurrent`，`zHi = uZCurrent + uZVisWindow`。
- **过渡宽度**：`W = uZVisWindow × 0.2`（由 TS 写入 uniform `uTransitionWidth` 或等价名）。
- **inFocus**（标量 0…1，用于 idle/active **互补** scale）：

```text
inFocus = smoothstep(zLo - W, zLo, aZ) × (1 - smoothstep(zHi, zHi + W, aZ))
```

- **idle / active 尺度（P8.4 双 mesh，无 focus 时）**  
  - `sIdle = (1 - inFocus) × uIdleScale × aSize`  
  - `sActive = inFocus × uActiveScale × aSize`  
  - 具体 `uIdleScale` / `uActiveScale` 初值在《Phase 8 基线 P8.0 性能与 P8.4 准入》及《视觉参数总表》中维护。

- **focus 覆盖**：当 `uFocusedInstanceId >= 0` 且 `gl_InstanceID == uFocusedInstanceId` 时，**强制** `sIdle = 0`、`sActive = 0`；该电影仅由 Perlin `IcosahedronGeometry(1, 6)` 呈现。

## 3. 各态参数表（视觉与交互）

### 3.1 idle

| 维度 | 约定 |
|------|------|
| **z 范围** | 全 `aZ`；视觉上条带外更小更淡（由 `inFocus` 低驱动 `sIdle`） |
| **大小** | `sIdle` 见上；P8.4 mesh：`IcosahedronGeometry(1, 0)`，材质 `transparent: true`、`depthWrite: false` |
| **色彩** | P8.1 后 hue + uniform `uLMin/uLMax/uChroma`（OKLab→sRGB）；本 spec 不绑死 L/C 数值 |
| **可交互性** | 不作为主拾取层（P8.4：Raycaster **仅** active mesh） |
| **进入/退出** | 随 `uZCurrent` / `aZ` 连续变化；无独立时间轴动画 |

### 3.2 active

| 维度 | 约定 |
|------|------|
| **z 范围** | `inFocus > 0` 的条带及其 ±W 过渡区 |
| **大小** | `sActive` 见上；mesh：`IcosahedronGeometry(1, 1)`，`alphaTest: 0.01`、`depthWrite: true` |
| **色彩** | 与 idle 同源 hue/L/C；当前 `galaxyActive.frag` 为 **vColor 直通**；Lambert + rim 为计划内增强（原 P8.5 范围，已改轨以源码为准） |
| **可交互性** | 主拾取；可选 `inFocus > 0.5` 门控 + 第二近邻容差（由 P8.2 结论定） |
| **进入/退出** | 连续，与 idle 互补叠加；**不得**在过渡区出现「双实心球」过曝（P8.5 硬验收） |

### 3.3 hover

| 维度 | 约定 |
|------|------|
| **z 范围** | 不改变 `inFocus`；与 active 命中一致 |
| **大小** | **不**改 mesh scale；HTML ring 半径 = 屏幕空间星球半径 + padding（与 tooltip 同源 `screenRadius`） |
| **色彩** | ring 样式在 HUD/CSS；数据色仍以 mesh 为准 |
| **可交互性** | 展示 tooltip；点击逻辑沿用现工程 |
| **进入/退出** | **即时**（无 transition），与 tooltip 一致 |

### 3.4 focus

| 维度 | 约定 |
|------|------|
| **z 范围** | 相机与目标 world 位置对齐；宏观条带仍由 store 驱动 |
| **大小** | 双 mesh 上该 instance **零尺度**；Perlin 球 **detail = 6**（P8.3） |
| **色彩** | Perlin 四阈值分区 + hue/L/C；**vote_count 在 focus 态保留视觉权重**；**小 vote 片 focus 后视觉偏小为 intended**（产品接受） |
| **可交互性** | 抽屉/详情；ESC 或 UI 取消选中 |
| **进入/退出** | 相机动画时长沿用现 `SELECT_MS` / `DESELECT_MS`（数值以《视觉参数总表》为准）；P8.4 起 `flyToFocus` 使用**物理距离常数** `FOCUS_CAM_DIST` |

### 3.5 select（延后）

- 仅列需求占位：多选集合、bloom 分层、搜索联动；**不实装**到本 Phase。见 [`搜索与 select 态联合 spec 草案.md`](搜索与%20select%20态联合%20spec%20草案.md)（P8.6 已落盘，待 review）。

## 4. 渲染与能力约定

- **WebGL2**：启动时 `console.assert(renderer.capabilities.isWebGL2)`，失败抛错并提示升级浏览器（与 Phase 7.2 红线一致）；**不**维护 WebGL1 / 自定义 `aInstanceId` attribute fallback。
- **实例索引**：focus 判定使用 `gl_InstanceID == uFocusedInstanceId`；`uFocusedInstanceId === -1` 表示无 focus。
- **Draw 顺序（建议）**：`galaxyIdle` renderOrder 0 → `galaxyActive` renderOrder 1 → 后处理 Bloom → Perlin（focus 时 `visible=true`，renderOrder 2）。

## 5. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-04-27 | Phase 8.0 初稿：四态 + select 延后、W 公式、双 mesh 互补、WebGL2、focus 意图声明 |
| 2026-04-27 | 文档同步：idle/active 生产描述对齐 P8.4；P8.6 草案落盘；active 色彩行对齐当前片元 |
