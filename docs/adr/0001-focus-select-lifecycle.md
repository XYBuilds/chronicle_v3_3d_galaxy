---
status: accepted
---

# Focus 与 Select session 采用意图驱动的父子生命周期

影片 focus 不能仅由 `selectedMovieId` 与搜索字段的偶然组合解释。系统按进入意图区分两种关系：从当前 person/genre select session 的 `selectionIds` 中选择影片会建立 nested focus，并保留父 session；标题搜索、TMDB ID 搜索、直接导航，以及不属于当前 `selectionIds` 的 route Forward 会建立 replacing focus，并退出已有 select session。这样可以在退出 nested focus 时可靠恢复父上下文，同时避免把无关影片错误归入当前 person/genre 集合。

Route 只表达 focus 目标，不保存 select session 快照；Back/Forward 根据当时仍在内存中的 session 与集合成员资格解释目标，刷新不恢复 session。清除 Person/Genre 上下文或离开相应 Tab 是一次原子生命周期 transition：若存在 nested focus，focus 与父 session 一并退出到 macro idle；Title/TMDB ID 的输入 Clear 只影响本地输入或 echo。

生命周期编排属于独立 exploration module，其 canonical state 是 `idle | select(session) | focus(movieId, parent)` 判别联合；`focus.parent` 是否存在直接表达 nested/replacing 关系，不另设可漂移的布尔字段。纯 `decideExploration(current, intent)` 核心只接受 `select/entered`、`select/cleared`、`focus/requested`、`focus/exited` 四类语义 intent，其中 focus 请求只区分 `preserve-if-member` 与 `replace`。独立 Zustand adapter 一次提交完整 context；结构无效的 payload 立即失败，合法的重复 intent 幂等。

搜索 HUD 只发出用户 intent，route adapter 只同步 URL 与 focus 目标，Three.js scene 继续拥有时间驱动的 `selectionPhase`。搜索草稿、当前 Tab、focus 邻域缓存、orbit、mask 与动画不进入 lifecycle SSOT。Person/Genre 条件变化会创建新的顶层 select session 并退出现有 focus；迁移完成后移除旧的可独立写入 lifecycle 字段，避免双 SSOT。这样的 seam 可防止 React、route 与 scene 观察到“先清 focus、后清 select”或相反顺序产生的无效中间态。