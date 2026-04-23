# DATA — 数据来源与许可说明

本文档作为项目对外数据声明的单一来源，供 README 与后续 HUD INFO 面板复用。

## 1) 数据来源

- 主要数据集：`TMDB Movies Daily Updates (Kaggle)`
  - https://www.kaggle.com/datasets/alanvourch/tmdb-movies-daily-updates
- 数据提供方：`The Movie Database (TMDB)`
  - https://www.themoviedb.org/

## 2) 当前仓库数据快照时间

- 前端默认加载文件：`frontend/public/data/galaxy_data.json`
- 该文件 `meta.version`：`2026.04.23`
- 该文件 `meta.generated_at`：`2026-04-23T20:09:27.581035+00:00`

说明：`meta.generated_at` 为本仓库当前 JSON 导出时间（UTC）。若后续重跑管线或切换数据版本，应同步更新本节时间与版本信息。

## 3) 字段与结构说明

- 对外 schema 文档：`docs/project_docs/galaxy_data_schema.md`
- 权威实现约束：`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`（§4 输出数据 Schema）

## 4) Attribution（CC-BY 文案）

推荐在对外展示中保留以下归属文本（README / HUD INFO 可直接复用）：

> This product uses the TMDB API/data but is not endorsed or certified by TMDB.  
> Movie metadata is sourced from The Movie Database (TMDB).  
> Data attribution: TMDB, distributed under CC-BY terms as required by the project policy.

## 5) 许可与合规备注

- 本项目仅在本仓库上下文中声明 TMDB 数据归属与署名要求。
- TMDB 的最新品牌与使用条款以官方页面为准：
  - https://www.themoviedb.org/terms-of-use
  - https://www.themoviedb.org/documentation/api/terms-of-use
