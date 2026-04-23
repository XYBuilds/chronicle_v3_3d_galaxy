# `galaxy_data.json` 对外 Schema（公开契约）

本文档提供面向外部读者的简明数据契约说明。实现权威定义仍以 `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` §4 与 `frontend/src/types/galaxy.ts` 为准。

## 1) 顶层结构

```json
{
  "meta": { "...": "元数据" },
  "movies": [{ "...": "电影记录" }]
}
```

## 2) `meta` 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | `string` | 数据版本（建议 `YYYY.MM.DD`） |
| `generated_at` | `string` | ISO 8601 时间（UTC） |
| `count` | `number` | 电影总条数，应等于 `movies.length` |
| `embedding_model` | `string` | sentence-transformers 模型 ID |
| `umap_params` | `object` | UMAP 参数块（见下表） |
| `genre_weight_ratio` | `number` | 流派顺位权重公比（默认约 `0.618`） |
| `genre_palette` | `Record<string, string>` | 流派名称到十六进制色值映射（如 `#AABBCC`） |
| `feature_weights` | `object` | 多模态特征权重（`text/genre/lang`） |
| `z_range` | `[number, number]` | Z 轴小数年份范围 `[min, max]` |
| `xy_range` | `{ x: [number, number], y: [number, number] }` | UMAP X/Y 值域 |

### `meta.umap_params`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `n_neighbors` | `number` | UMAP 邻居数 |
| `min_dist` | `number` | UMAP 最小距离 |
| `metric` | `string` | 距离度量（如 `cosine`） |
| `random_state` | `number` | 复现种子，项目约定固定 `42` |
| `densmap` | `boolean` (optional) | 是否启用 DensMAP |

### `meta.feature_weights`

| 字段 | 类型 |
| --- | --- |
| `text` | `number` |
| `genre` | `number` |
| `lang` | `number` |

## 3) `movies[i]` 字段

### A. 渲染层字段（GPU / Three.js）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `x` | `number` | UMAP X 坐标 |
| `y` | `number` | UMAP Y 坐标 |
| `z` | `number` | 小数年份 Z 坐标 |
| `size` | `number` | 粒子大小（由 `vote_count` 映射） |
| `emissive` | `number` | 发光强度（由 `vote_average` 映射） |
| `genre_color` | `number[]` | 归一化 RGB（建议 `[r, g, b]`） |

### B. HUD / 信息展示字段

| 字段 | 类型 |
| --- | --- |
| `title` | `string` |
| `original_title` | `string` |
| `overview` | `string` |
| `tagline` | `string \| null` |
| `release_date` | `string` |
| `genres` | `string[]` |
| `original_language` | `string` |
| `vote_count` | `number` |
| `vote_average` | `number` |
| `popularity` | `number` |
| `imdb_rating` | `number \| null` |
| `imdb_votes` | `number \| null` |
| `runtime` | `number \| null` |
| `revenue` | `number` |
| `budget` | `number` |
| `production_countries` | `string[]` |
| `production_companies` | `string[]` |
| `spoken_languages` | `string[]` |
| `cast` | `string[]` |
| `director` | `string[]` |
| `writers` | `string[]` |
| `producers` | `string[]` |
| `director_of_photography` | `string[]` |
| `music_composer` | `string[]` |
| `poster_url` | `string` |

### C. 关联键字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `number` | TMDB 电影 ID（主键） |
| `imdb_id` | `string \| null` | IMDb 外链 ID |

## 4) 最小示例

```json
{
  "meta": {
    "version": "2026.04.23",
    "generated_at": "2026-04-23T20:09:27.581035+00:00",
    "count": 59014,
    "embedding_model": "paraphrase-multilingual-mpnet-base-v2",
    "umap_params": {
      "n_neighbors": 100,
      "min_dist": 0.4,
      "metric": "cosine",
      "random_state": 42,
      "densmap": true
    },
    "genre_weight_ratio": 0.6180339887498948,
    "genre_palette": { "Drama": "#AEB742" },
    "feature_weights": { "text": 1.0, "genre": 1.0, "lang": 1.0 },
    "z_range": [1874.9369863013699, 2026.6472762982353],
    "xy_range": { "x": [-15.9366, 25.8966], "y": [-19.6804, 23.4257] }
  },
  "movies": [
    {
      "x": 4.1574,
      "y": 6.9914,
      "z": 2014.8438,
      "size": 25.0,
      "emissive": 1.2,
      "genre_color": [0.682, 0.718, 0.259],
      "title": "Example Movie",
      "original_title": "Example Movie",
      "overview": "Example overview",
      "tagline": null,
      "release_date": "2014-11-01",
      "genres": ["Drama"],
      "original_language": "en",
      "vote_count": 1000,
      "vote_average": 7.2,
      "popularity": 20.5,
      "imdb_rating": 7.1,
      "imdb_votes": 120000,
      "runtime": 110,
      "revenue": 100000000,
      "budget": 50000000,
      "production_countries": ["US"],
      "production_companies": ["Example Studio"],
      "spoken_languages": ["en"],
      "cast": ["Actor A", "Actor B"],
      "director": ["Director A"],
      "writers": ["Writer A"],
      "producers": ["Producer A"],
      "director_of_photography": ["DOP A"],
      "music_composer": ["Composer A"],
      "poster_url": "https://image.tmdb.org/t/p/w500/example.jpg",
      "id": 12345,
      "imdb_id": "tt1234567"
    }
  ]
}
```
