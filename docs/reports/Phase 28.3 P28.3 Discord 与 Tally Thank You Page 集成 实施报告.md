# Phase 28.3 / P28.3 Discord 与 Tally Thank You Page 集成 实施报告

## 1. 报告范围

本报告记录 **P28.3**（Phase 28 子项）关于 **Discord 社区入口** 的**最终收口方式**，对应计划：[`.cursor/plans/phase_28_feedback_support_community.plan.md`](../../.cursor/plans/phase_28_feedback_support_community.plan.md) 中「P28.3 Discord 社区入口」。计划 YAML 中该项已标为 **completed**，正文 §P28.3 已同步为「实际收口」口径。

**不在本报告范围**：P28.1（Donate）、P28.4（全量 i18n 同步）、P28.5（PRD/Design/Tech/README 等 SSOT 文档总收口）。Tally 表单本体与 HUD 反馈入口见 [Phase 28.2 P28.2 Tally 用户反馈 HUD 最终实施报告](Phase%2028.2%20P28.2%20Tally%20用户反馈%20HUD%20最终实施报告.md)。

---

## 2. 背景与计划差异

### 2.1 原计划要点（摘录）

- 在 **Info / README** 与必要 **locale** 中放置 Discord 邀请链接，与 Donate、Tally 并列或同区块；外链 `target="_blank"` + `rel="noopener noreferrer"`；明确社区属性（非 TMDB 官方、非 SLA 工单）。

### 2.2 实际决策

- **Discord 服务器邀请链接已在 Tally 后台配置于反馈表单的 thank you page**（用户成功提交反馈后由 Tally 展示感谢页并引导加入 Discord）。
- **优势**：与「先反馈、再入群」动线一致；链接变更可在 **Tally / Discord 后台** 完成，**不依赖** 前端发版；不在主沉浸 HUD 增加额外常驻块。
- **与仓库关系**：本项**不要求**为 P28.3 单独提交前端/文案 diff；计划文件已写明「实际收口」以避免与初版验收表述冲突。

---

## 3. 与仓库内既有能力的关系（参考）

| 能力 | 说明 |
|------|------|
| **Tally thank you page** | 本报告确认的 **P28.3 主交付路径**（运维在 Tally 侧配置）。 |
| **HUD 分享中的 Discord** | Phase **27.1** 已在 [`frontend/src/hud/ShareMovieTodayButton.tsx`](../../frontend/src/hud/ShareMovieTodayButton.tsx) 支持可选构建变量 **`VITE_DISCORD_INVITE_URL`**（缺省回退 `https://discord.com/`），与「社区入口」目标一致但**不属于**本次 Tally 感谢页改动的代码范围；详见 [Phase 27.1 实施报告](Phase%2027.1%20P27.1%20The%20Movie%20Today%20分享与%20OG%20预览%20cache-bust%20实施报告.md)。 |

---

## 4. 验收结论（修订口径）

| 验收项（修订后） | 结论 |
|------------------|------|
| 用户完成 Tally 反馈后可在 thank you page 看到并进入 Discord | **已满足**（由维护者在 Tally 后台完成配置）。 |
| 邀请链接轮换 | **责任边界**：Tally / Discord 控制台更新；建议在 P28.5 Tech Spec 中一句话写明。 |
| Info / README / 独立 locale 区块中的 Discord 文案 | **不作为 P28.3 硬性交付**；若产品希望统一「所有入口列表」，可在 **P28.4 / P28.5** 按需补全。 |

---

## 5. 维护提示（非代码）

1. **Discord 邀请**：建议在 Discord 侧使用稳定策略（永不过期或定期轮换并在 Tally 感谢页同步更新）。
2. **Tally 表单**：若更换表单或感谢页模板，需复查 thank you page 内 Discord 区块是否仍生效。
3. **品牌与免责声明**：感谢页文案仍应体现「社区讨论、非 TMDB 官方、非工单 SLA」，与 Phase 24 起公开说明策略一致。

---

## 6. 文档修订清单

| 产出物 | 操作 |
|-----------|------|
| [`.cursor/plans/phase_28_feedback_support_community.plan.md`](../../.cursor/plans/phase_28_feedback_support_community.plan.md) | `p283-discord-community` → **completed**；§P28.3 增加「实际收口」与修订验收；§范围中 Discord 表述补充「或 Tally thank you page」。 |
| 本报告 | **新建**。 |
