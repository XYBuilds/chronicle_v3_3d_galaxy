# Phase 42.2 · Monthly Rating Emission Profile Generator 实施报告

## 结论

p42.2 已完成并通过技术验收。monthly refit 在最终 galaxy export 校验成功后生成不可变的 rating-emission candidate profile；本 TODO 不写 active pointer，不上传 R2，也不改变 nightly 行为。

## 实现范围

- 新增 `scripts/cron/monthly_profile_generator.py`
  - 只读取最终 `galaxy_data.json` / `.json.gz` 的 `meta` 与 `movies`，不读取 raw CSV。
  - 校验 TMDB ID、IMDb ID、rating 范围和稳定排序，生成 201 点 midrank CDF/LUT。
  - 输出与 TypeScript `rating-emission-profile-v1` 一致的 schema、source provenance、curve SHA-256 和不可变 profile ID。
  - 提供稳定 JSON canonicalization；Python 与 TypeScript 对同一 fixture 得到相同 curve hash。
  - 输出 LUT mean/max delta、关键 rating 节点、样本/电影数量和 source version 漂移指标。
  - 先准备并 fsync 全部临时文件，再按 profile、drift、candidate、metadata 顺序发布；失败清理本批次产物。
  - Git commit 无法解析时快速失败，不生成伪 provenance。
- 更新 `scripts/cron/monthly_refit.py`
  - final export 与 galaxy validation 成功后调用 candidate generator。
  - profile 生成失败时写入 `aborted_emission_profile` 并终止；不更新 active pointer。
- 更新 `scripts/export/export_galaxy_json.py`
  - 增加可选的最小 profile provenance 注入边界，不改变宏观 `Movie.emissive`。
- 增加 Python 单测与 TypeScript 跨语言 hash fixture。

## 验证

- `python -m pytest scripts/tests`
  - 128 个测试通过。
- `python -m py_compile scripts/cron/monthly_profile_generator.py scripts/cron/monthly_refit.py scripts/export/export_galaxy_json.py`
  - 通过。
- `npm exec vitest run src/three/focusEmission.spec.ts`
  - 24 个测试通过。
- `npx tsc -b --pretty false`
  - 通过。
- `npm run lint`
  - 通过。
- `git diff --check`
  - 通过。

实现提交：`63cafb6 feat(p42.2): generate monthly emission profiles`。

## 边界

- 产物状态仅为 validated candidate；active pointer 的选择、force activation、上传和原子切换属于 p42.4。
- 网站、Planet exporter 和 diagnostics 尚未读取 candidate/active profile，属于 p42.3。
- 未执行完整 UMAP、真实 Supabase/R2 操作或生产发布。