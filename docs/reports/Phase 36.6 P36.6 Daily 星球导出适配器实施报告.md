# Phase 36.6 · Daily 星球导出适配器实施报告

- **状态**：完成
- **范围**：`T:/themoviecosmos-daily-stargazing`
- **日期**：2026-07-14

## 交付

- 新增 `scripts/lib/planet_renderer.py`，以参数数组调用 Chronicle 的 `npm run planet:export`，不复制 Three.js 或 GLSL 逻辑。
- 通过 `MOVIE_COSMOS_GALAXY_ROOT` 定位 Chronicle，并在启动前校验仓库根目录、`package.json` 和 `planet:export` script。
- 成功后校验 CLI 的唯一 stdout JSON、PNG signature、`3000×3000` RGBA、非空 alpha 边界及 `.render.json` 中的 `tmdb_id`、分辨率、padding、Bloom 一致性。
- 新增 `.env.example` 配置项和 mock-subprocess / 小 PNG fixture 的单元测试；测试不会启动 Chromium。

## 验证

```text
python -m pytest tests/test_planet_renderer.py
7 passed
```

## 边界

本 TODO 只建立 Python→CLI 的稳定适配层。`main.py publish` 的默认双 Bloom 导出与 `--no-planet-image` 由 36.7 实现。