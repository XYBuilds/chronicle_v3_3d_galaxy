# Phase 37.1 Supabase Preflight 验收报告

- **验收日期：** 2026-07-15
- **范围：** 恢复现有 Supabase 项目后，以 GitHub Actions 验证脱敏、只读 preflight；不执行 nightly/monthly 写入。

## 验收结果

- Supabase 项目已恢复为 Healthy。
- `P37 Supabase read-only preflight` 手动运行成功：[run 29428994176](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29428994176)。
- Preflight 以 HTTP 200 读取到唯一 active threshold；覆盖年份为 1874–2026。日志仅记录 hostname hash/尾段、状态码和聚合计数，未泄漏 URL 或 service-role secret。
- 工作流的 `GITHUB_TOKEN` 权限仅为 `contents: read`；本次运行未触发 Kaggle、R2、KV、部署或 Supabase 写入。

## 已知后续事项

此前 nightly 的失败根因已确认独立于 Supabase 连通性：最终 membership 出现未知语言 `rm`，由维度漂移 gate 阻断。该问题属于 Phase 37.2–37.4 的范围。