# Phase 40.2 / P40.2 Home idle 与 Cover/WebGL 退役实施报告

## 交付范围

本 TODO 将主站首页从 Today cover 状态机收敛为 galaxy idle，并删除前端所有 Today 数据、路由、HUD 与 WebGL 特例。pipeline、OG Worker 和生产远端对象不在本 TODO 修改。

## 启动与路由状态

启动门闩现在只有两个条件：

1. galaxy 数据已就绪。
2. search index 已进入 `ready`、`skipped` 或 `error` 终态。

满足后，路由控制器将 `/` 应用为无选择 idle；有效 `/movie/:id` 直接应用 focus；无效 movie id 与 unknown path 规范化到 `/` 并清空 selection。场景挂载不再等待或请求 Today 数据。

`RouteKind` 只保留 `home | movie | unknown`，`/today` 被解析为 unknown。`frontend/public/_redirects` 只注册 `/movie/*` SPA fallback，不再注册 `/today`。

## 删除边界

完整删除：

- `frontend/src/data/loadToday.ts` 及测试。
- `frontend/src/store/coverModeStore.ts`。
- `frontend/src/hud/CoverBackdrop.tsx`。
- `resolveTodayJsonUrl`、manifest `today_url` 前端消费及对应 base-path 测试。
- Today/cover locale keys 与 `STRINGS` 投影。
- Cover CSS、Vite env、scene 订阅、camera/orbit/constellation 分支。
- `uCoverMode`、`uCoverTodayInstanceId`、`uCoverActiveSizeBoost` 及 GLSL/CPU picking 分支。

全部七个 locale bundle 与 `en.json` 保持同构。

## WebGL 不变量

- active shader 与 CPU ray-sphere picking 均使用 `inFocus * uSizeScale * uActiveSizeMul * size`，保持 1:1 半径契约。
- idle/focus 的 selection mask、near/Z fade、macro fade、focus planet、neighbor picking 和 constellation 语义保留。
- focused movie 仍是 idle fade exemption；Cover Today exemption 已删除。
- 普通 focus 的选择与取消继续由现有 transition driver 驱动，没有新增兼容 store 或永远为 false 的 uniform。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm test`（`frontend`） | 37 files，259 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过；SPA fallback 仅 1 条 movie redirect |
| `npx vitest run frontend/src/lib/locales/locales.schema.spec.ts`（仓库根） | 1 file，6 tests passed |
| 最近编辑文件诊断 | 无错误 |
| `git diff --check` | 通过 |

构建仍提示既有的 `frontend/public/data/galaxy_data.json`、`.gz` 超过 Cloudflare Pages 25 MiB，以及主 JS chunk 超过 500 kB；构建退出码为 `0`，本 TODO 未修改这些数据文件。

本 TODO 未部署、未触发 workflow、未修改 R2/KV/cache，也未读取原始大 CSV。