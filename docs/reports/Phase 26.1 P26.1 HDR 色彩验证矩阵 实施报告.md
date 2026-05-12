# Phase 26.1 — HDR / 色彩验证矩阵（实施记录）

## 目标

按 `.cursor/plans/phase_26_device_spatial_optimization.plan.md` 中 **P26.1** 要求：在 Mac / Windows、HDR 开/关、多浏览器下，对 idle/active 星点、focus Perlin、rating reference、cover 字、HUD 白边等建立**可复现的同一颜色源**对比流程，并区分偏色来自 CSS token、WebGL `SRGBColorSpace`、系统 HDR 或截图链路。

## 代码侧已落地的工具（本分支）

1. **查询参数 `?p26ColorAudit=1`（或 `true` / `yes`）**  
   在主场景阶段显示左下角 **P26.1 color audit** 浮层（英文 QA 文案，不进产品 locale）：
   - 一组与 HUD 一致的 **CSS 变量色块**（`--foreground`、`--border`、`--muted-foreground`、`--background`、`--ring`、`--cosmos-brand-muted`、`--cosmos-universe-bg`、`--ui-edge-canvas-color`）。
   - 三个 **纯 sRGB** 平面参考（`#FFFFFF`、`#808080`、`#000000`）。
   - **Sample WebGL center RGBA**：对标记为 `data-galaxy-webgl="1"` 的 WebGL2 canvas 执行 `readPixels`（视口中心，GL 左下角坐标系）；用于对比「GPU 输出数值」与肉眼 / 截图差异。
   - 展示 `navigator.userAgent` 与 `matchMedia('(dynamic-range: high)')` 是否匹配（HDR 能力提示，非权威系统开关）。

2. **固定「今日」电影（同一 TMDB 行）**  
   - `?todayMovieId=<TMDB 整数>` 或别名 `?p26Today=<id>`：若该 id **存在于当前主包 `galaxy_data` 影片列表**中，则**覆盖** `today.json` 解析结果，用于 cover / 首屏轨道与跨设备对齐。  
   - 非法或不在包内：打 `console.warn`，回退为原有 `resolveTodayMovieId` 行为。

3. **渲染管线备注（代码事实）**  
   - `frontend/src/three/scene.ts`：`renderer.outputColorSpace = THREE.SRGBColorSpace`。

## 推荐验证 URL 形态

```text
/?p26ColorAudit=1&todayMovieId=<你的包内 TMDB id>
```

可按计划叠加 `theme=light|dark`、`lang=…` 等现有参数。

## 人工矩阵（请在各设备填写）

| 环境 | 浏览器 | 系统 HDR | 显示器 / 色域简述 | idle 星 | active 星 | Perlin | rating ref | cover 字 | HUD 白/边 | CSS 色块 vs sRGB 参考 | WebGL center 读数 | 截图文件 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| macOS | Chrome | off | | | | | | | | | | |
| macOS | Chrome | on | | | | | | | | | | |
| macOS | Safari | off | | | | | | | | | | |
| macOS | Safari | on | | | | | | | | | | |
| Windows | Chrome | off | | | | | | | | | | |
| Windows | Chrome | on | | | | | | | | | | |
| Windows | Edge | off | | | | | | | | | | |
| Windows | Edge | on | | | | | | | | | | |

说明列可使用简写：例如「偏绿」「与 sRGB 块一致」「仅 HDR on 时发灰」等。

## 初步结论槽位（填完后更新）

- **是否稳定复现 idle/active 色差**：  
- **更可疑来源**（可多选）：CSS OKLCH token / WebGL SRGB / 浏览器或系统 HDR 色彩管理 / 显示器或截图链路  
- **是否需要改全局 token 或 shader**：  

## 相关文件

- `frontend/src/hud/P26ColorAuditPanel.tsx`
- `frontend/src/hooks/useP26ColorAuditFromQuery.ts`
- `frontend/src/lib/p26TodayMovieOverride.ts` + `p26TodayMovieOverride.spec.ts`
- `frontend/src/App.tsx`（today 覆盖 + 条件挂载面板）
- `frontend/src/three/scene.ts`（`data-galaxy-webgl`）
