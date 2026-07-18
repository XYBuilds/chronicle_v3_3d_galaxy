# Phase 39.6 / P39.6 Reference 完整退役 实施报告

## 交付范围

本 TODO 删除 Focus 的两套旧视觉参照及其运行时状态、文案和测试契约，同时保留确定性星球姿态与自转行为。未执行 P39.7 的 3000×3000 导出矩阵，也未提前完成 P39.8 的视觉参数定稿与文档回写。

- 基线提交：`55092eb47f4058890d83035ce3a28b278570a3ed`
- 删除对象：`FocusLReference`、`FocusSizeReferenceRings`
- 保留对象：selection planet 的 seeded 姿态、自转轴、转速和运行时 quaternion 合成

## 运行时退役

Reference 数据流已从入口到销毁边界完整删除：

```text
App
  -X-> FocusLReference HUD

scene render loop
  -X-> create/update/dispose FocusSizeReferenceRings
  -X-> galaxy uniforms snapshot
  -X-> Store.focusLightnessSnap
```

具体变更：

- 删除 `frontend/src/hud/FocusLReference.tsx` 及 `App.tsx` 挂载；
- 删除 `frontend/src/three/FocusSizeReferenceRings.ts`、scene 创建/挂载、逐帧更新与 dispose；
- 删除 `FocusLightnessSnap` 类型、Store 字段和 scene 写入；
- 删除 `--hud-focus-ref-*` CSS tokens；
- `frontend/src/lib/galaxyVoteSize.ts` 仅服务于已退役的尺寸 rings，确认无其他消费者后连同专属测试删除；真实粒子尺寸、vote_count → size 和 focus 半径代码未改动；
- 清理 `FocusExitButton` 与 `galaxyUniformDefaults` 中指向旧模块的注释。

## Locale 与 strings 契约

从 `en.json` SSOT 及 `zh`、`zh-Hant`、`ja`、`es`、`fr`、`ar` 共七个 bundle 同步删除：

- `focusLReference.ariaLabel`
- `focusVoteReference.tierLabels`

`buildStrings()` 不再暴露这两组接口；locale schema 测试继续按 `en.json` 的叶子路径集合验证所有 bundle 同构。未修改其他 HUD 文案或数组。

## Rotation 术语与数值不变量

`selectionPlanetRotation.ts` 不再以已删除的 ring/reference 命名星球姿态：

- `REFERENCE_RING_PLANE_LOCAL_NORMAL` → `SELECTION_PLANET_LOCAL_SPIN_AXIS`
- `selectionPlanetRingPlaneQuaternion()` → `selectionPlanetBaseOrientationQuaternion()`

PRNG、seed、倾角/方位角计算、世界自转轴、`[-0.1, 0.1] rev/s` 速度范围、local +Z 后乘 quaternion 与 scene 运行时调用顺序均未改变。测试对 movie ID `424786` 锁定以下退役前数值：

- seeded world spin axis；
- base orientation quaternion；
- signed spin speed；
- 8 秒后的 spin angle 与 runtime orientation quaternion。

因此旧 rings 被删除后，星球自身仍按同一 movie ID 保持相同姿态和转速。

## 残留与文档边界

`frontend/src` 中以下旧运行时符号已零命中：

- `FocusLReference`
- `FocusSizeReferenceRings`
- `focusLightnessSnap`
- `focusLReference` / `focusVoteReference`
- `galaxyVoteSize`
- `selectionPlanetRingPlaneQuaternion`
- `REFERENCE_RING_PLANE_LOCAL_NORMAL`

历史 Phase Plan 与实施报告保留原始事实记录。`README.md`、`README.en.md`、Tech Spec、Design Spec 和视觉参数总表仍有旧视觉说明；这些文件与状态机/视觉映射文档统一列入 P39.8 人工 Go 后的回写范围，避免在 Gate 前宣称最终视觉参数和体验已经定稿。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm exec vitest run src/lib/routeControllerSync.spec.ts src/three/selectionPlanetRotation.spec.ts src/lib/locales/locales.schema.spec.ts`（`frontend`） | 3 files，23 tests passed |
| `npm test`（`frontend`） | 37 files，243 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过；TypeScript、Vite、文件检查与 SPA fallback 均成功 |
| `git diff --check` | 通过 |

`npm run build` 仍提示仓库既有的 `frontend/public/data` 大文件超过 Cloudflare Pages 25 MiB，以及主 JS chunk 超过 500 kB；构建退出码为 0，本 TODO 未修改这些大数据文件。