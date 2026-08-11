# Chronicle 文档架构模式调研

日期：2026-08-11
状态：研究证据，不是 Issue #370 的最终决议

## 结论摘要

成熟软件项目并不存在一套“必须有固定几份规格文档”的行业标准。较稳定的共同模式是一个分层的混合结构：

1. 仓库根部用少量、职责明确的入口文件服务首次访问、协作、安全和治理。
2. 实质性产品文档先区分用户的信息需求，再按产品 topic、受众或子系统继续组织。
3. 架构提案、决策记录、跨系统 contract 和历史执行证据拥有不同生命周期，不应塞进同一种 current 文档。

对 Chronicle 而言，比“四份平衡后的大文档”更有未来兼容性、又比“每个微小 claim 一份文件”更省维护的方案，是 **bounded atomic topics（有下限的原子 topic）**：一份文件回答一个可以独立理解、独立演化的问题，但不能小到失去上下文。现有 `docs/system/decision-index.md` 继续承担导航，不新增第二个 registry。

这不是建议引入 DITA XML、文档站生成器或复杂元数据。DITA 在本研究中只提供成熟的 topic 边界原则；Chronicle 可以继续使用普通 Markdown。

## 证据范围和置信度

本研究只使用拥有相关规则或文档的一手来源，并把证据分成三类：

- **广泛常见**：GitHub 官方支持的仓库入口/社区文件，以及在多个成熟项目中重复出现的信息类型。
- **特定项目或框架实践**：Kubernetes、Django、Rust 的具体目录和内容结构；它们是有价值的实例，但不是所有项目必须照搬的标准。
- **新兴 AI 约定**：`AGENTS.md`、GitHub Copilot 的仓库级和路径级 instructions。它们正在获得多工具支持，但不能等同于已经稳定多年的通用文档规范。

本研究没有把 `llms.txt` 等新提案视为主流，也没有找到一手证据支持“AI 需要每个 claim 单独一个 Markdown 文件”。

## 1. 主流项目通常有哪些文档

### 1.1 仓库入口和协作表面

GitHub 官方对仓库根部文件给出了很清楚的职责划分：

| 表面 | 主要内容 | 证据强度 |
| --- | --- | --- |
| `README.md` | 项目做什么、为什么有用、如何开始、去哪里求助、谁维护 | 广泛常见。GitHub 说明 README 往往是访客首先看到的内容，并建议把更长的文档放到其他位置。[GitHub：About the repository README file](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) |
| `LICENSE` | 软件的许可条件 | 广泛常见；GitHub community profile 会检查它。[GitHub：About community profiles for public repositories](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories) |
| `CONTRIBUTING.md` | 如何提出高质量 Issue/PR、开发和评审预期、贡献入口 | 广泛常见，尤其适用于接受外部贡献的项目。GitHub 会在创建 Issue/PR 时展示入口。[GitHub：Setting guidelines for repository contributors](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors) |
| `SECURITY.md` | 支持的版本和私下报告漏洞的方法 | 广泛常见于需要公开安全报告通道的项目。[GitHub：Adding a security policy](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/add-security-policy) |
| `CODE_OF_CONDUCT.md`、`SUPPORT.md`、`GOVERNANCE.md` | 社区行为、求助路径、项目治理 | GitHub 支持的标准 community-health 类型，但是否需要取决于项目规模和协作方式。[GitHub：Creating a default community health file](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) |
| Issue/PR templates | 让报告和贡献包含一致的必要信息 | GitHub 支持的标准协作表面；适合需要减少往返沟通的项目。[GitHub：Creating a default community health file](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) |

这里没有 PRD、Tech Spec、Design Spec、ADR、system map 或 contract 的固定组合。这些文件可能很重要，但属于项目根据产品形态和决策流程选择的内部结构，不能因为大型公司或某个模板使用它们，就称为 GitHub 项目的通用必选项。

Google 的第一方工程文档指南也强调“小而准确”优于数量庞大但状态混乱的文档，要求文档与代码同一变更更新、删除失效内容、避免重复；它把 README、API 文档、`docs/`、design docs/PRD 分成不同层次，并提醒已经实施的 design docs 更适合作为决策档案，而不是半正确的 current 使用手册。[Google：Documentation Best Practices](https://google.github.io/styleguide/docguide/best_practices.html)

### 1.2 面向使用者的实质性文档

Diátaxis 把技术文档分成四种用户需求：

- tutorial：带领学习者获得一次受控的学习体验；
- how-to：帮助已有能力的用户完成一个实际目标；
- reference：准确、紧凑地描述机器、API 或事实；
- explanation：解释背景、关系和原因。

这四种类型描述的是内容目的，不要求物理上恰好只有四个文件或四个目录。[Diátaxis：Start here](https://diataxis.fr/start-here/) 明确了四种需求；[Diátaxis：Complex hierarchies](https://diataxis.fr/complex-hierarchies/) 进一步说明，面对不同 topic 或不同受众时可以增加层级，不应把框架误解为必须塞内容的“四个盒子”。

成熟项目体现的是混合轴，而不是单一分类法：

| 项目 | 第一层组织方式 | 下一层组织方式 | 能说明什么 |
| --- | --- | --- | --- |
| Django | Tutorials、Topic guides、Reference guides、How-to guides | 每一类内按 Django subject 细分 | 信息类型优先；Django 要求 topic guide 链接 reference 而不重复，reference 紧扣对象，how-to 以结果为导向。[Django：Writing documentation](https://docs.djangoproject.com/en/5.2/internals/contributing/writing-documentation/#how-the-documentation-is-organized) |
| Kubernetes | Concept、Task、Tutorial、Reference | 在类型下按 Kubernetes 功能/主题组织；大型目录再设 section 和 landing page | 信息类型与产品 topic 共同组织；task 通常只做一件事，较大的目标属于 tutorial，reference 可由程序生成。[Kubernetes：Page content types](https://kubernetes.io/docs/contribute/style/page-content-types/)；[Content organization](https://kubernetes.io/docs/contribute/style/content-organization/) |
| Rust | Learning Rust、Using Rust、Mastering Rust、Specialized Rust 等读者路径 | 分流到 The Book、Reference、API docs、Cargo Book、rustdoc Book 等独立资料，再在各资料内按 topic/章节组织 | 大型生态会先按读者意图和产品边界分流，而不是维护一份总规格。[Rust：Rust Documentation](https://doc.rust-lang.org/stable/index.html)；[The Rust Programming Language：Introduction](https://doc.rust-lang.org/stable/book/ch00-00-introduction.html) |

因此，更准确的“行业主流”不是某份文件清单，而是以下分工：

```text
仓库入口/协作职责
        +
用户的信息类型（学习、做事、查事实、理解原因）
        +
产品 topic / 受众 / 子系统
        +
有独立生命周期的决策、契约和历史记录
```

具体项目会调整这些轴的先后。Diátaxis 自身也建议让结构从用户需求和小步改进中形成，而不是先创建空目录再把内容硬塞进去。[Diátaxis：How to use Diátaxis](https://diataxis.fr/how-to-use-diataxis/)

## 2. Topic-based / atomic authoring 的收益和成本

### 2.1 “原子”应当多大

OASIS DITA 是 topic-based authoring 的成熟行业标准。它对边界的定义很适合本次问题：topic 应当足够短，只处理一个 subject 或回答一个问题；同时又必须足够长，能够独立理解和作为一个完整单位维护。[OASIS DITA：The topic as the basic unit of information](https://docs.oasis-open.org/dita/dita/v1.3/os/part2-tech-content/archSpec/base/topicdefined.html)

这意味着：

- “搜索如何工作”可以是一份 topic；
- “搜索框按下 Enter 的行为”如果离开搜索状态、URL 和结果语义就无法理解，更可能只是同一 topic 的一节；
- 一个常量、一个默认值或一句 claim 通常不应单独成为文件，它更适合由 source、test 或结构化 reference 拥有。

文件边界应由“是否可以独立回答一个问题、是否有独立的变化原因”决定，而不是由固定行数、当前五份文档的平均分割或任意文件数量决定。

### 2.2 收益

OASIS 对 topic 架构列出的直接收益包括：从搜索或索引随机进入时仍可独立阅读、可以用不同方式组合、可以复用和过滤、在文件系统或内容系统中更易管理、更新和翻译成本可下降。[OASIS DITA：The benefits of a topic-based architecture](https://docs.oasis-open.org/dita/v1.2/os/spec/archSpec/topicbenefits.html)

映射到 Chronicle，收益是：

- 新增 Search、accessibility、observability、新 consumer 等内容时，可以增加或扩展相关 topic，不需要重新平衡四个大 owner；
- agent 或人类通过文件名、标题、索引或全文搜索可以直接取得一个有边界的答案；
- 一次语义变更通常只修改一个 current topic，diff 更小，也更少误碰无关内容；
- 跨仓 contract 可以继续独立演化，而不会埋在 frontend 或 data 的大文档中；
- 中文 current topic 不必为了英语入口复制一整套；双语成本可以限制在公开 README 等确有两类读者的表面。

### 2.3 成本和失败方式

Atomic authoring 并非文件越多越好。OASIS 明确指出，比 topic 更小的内容块需要更多思考和评审，组合后也更容易失去连贯性；topic 应当在复用机会和可连贯阅读之间取平衡。[OASIS DITA：Why topics?](https://docs.oasis-open.org/dita/v1.1/OS/archspec/dita_spec_22_topics_why.html)

主要成本是：

- 需要更好的文件命名、landing/index、相关链接和失效链接检查；
- topic 必须自包含，作者不能默认读者已经顺序读完上一份文件；
- 端到端旅程若被切得太碎，读者和 agent 都要额外拼接上下文；
- topic 数增加后，更容易出现两个近义页面、重复摘要或“不知道该改哪份”的新问题；
- 重命名和移动文件的成本高于在一份稳定大文档内改标题。

DITA 用 maps 把“如何存储 topic”和“如何组织阅读”分开。[OASIS DITA：The topic as the basic unit of information](https://docs.oasis-open.org/dita/dita/v1.3/os/part2-tech-content/archSpec/base/topicdefined.html) Chronicle 不需要采用 DITA 工具链，但仍需要一个轻量的导航层。已有 `docs/system/decision-index.md` 可以承担这个角色；另建 registry 只会增加双写成本。

## 3. 什么结构对 AI 查询更友好

### 3.1 有一手支持的属性

| 属性 | 一手证据 | 对 Chronicle 的含义 |
| --- | --- | --- |
| 可预测入口 | `AGENTS.md` 把自身定义为 agent 的 README，建议记录项目概览、build/test、代码风格、测试和安全注意事项。[AGENTS.md specification](https://agents.md/) | 根 `AGENTS.md` 应当很薄，负责导航、仓库约束和验证命令，不复制产品事实。 |
| 作用域明确 | AGENTS.md 允许在子目录嵌套，离工作文件最近的指令优先；GitHub Copilot 也区分 repository-wide、path-specific 和 agent instructions，并组合适用的作用域。[AGENTS.md specification](https://agents.md/)；[GitHub：Adding repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions) | host-specific rules 只保留该 host 真正需要的局部操作约束。跨 host 的产品 truth 留在普通 Markdown、source 和 tests。 |
| 能从搜索结果独立理解 | DITA 要求 topic 围绕单一 subject、在随机访问时仍有意义。[OASIS DITA：The benefits of a topic-based architecture](https://docs.oasis-open.org/dita/v1.2/os/spec/archSpec/topicbenefits.html) | 文件名和 H1 应回答明确问题，开头用短段说明 scope、非 scope 和相关权威来源。 |
| 标题和链接可定位 | Google 的 Markdown 指南建议一个 H1、短介绍、描述性且唯一的 headings 和明确的链接文字。[Google：Markdown style guide](https://google.github.io/styleguide/docguide/style.html) | `rg`、GitHub outline、anchor 和 agent 检索都能利用稳定的路径与标题，不需要额外 metadata registry。 |
| current 内容简洁且无重复 | Google 建议 minimum viable documentation、与代码同步更新、删除 dead docs、避免重复。[Google：Documentation Best Practices](https://google.github.io/styleguide/docguide/best_practices.html) | AI-friendly 的关键首先是准确和无矛盾，不是文档总量。current/reference/historical 必须可区分。 |
| 有上下文的 landing/index | Diátaxis 建议 landing page 不只是长链接列表，还要说明其下内容的范围和关系；复杂文档可以增加层级。[Diátaxis：Complex hierarchies](https://diataxis.fr/complex-hierarchies/) | `decision-index.md` 和 system maps 应提供简短问路信息，不复制每个 topic 的正文。 |

### 3.2 仍然只是合理推论的属性

以下结论符合上述一手来源，但不是某个 AI 标准直接规定的要求：

- 小而完整的 topic 通常能减少 agent 为一个问题加载无关内容，但过小会增加跨文件拼接和漏读依赖的概率。
- “一个 claim 只有一个 current owner，其他位置摘要并链接”能降低模型遇到矛盾文本的概率。
- 稳定英文路径、描述性文件名和中文正文可以共存；AI 检索并不要求为所有 current 文档维护中英双份。
- source、tests、manifest 和 workflow 更适合拥有易漂移的实现事实；Markdown 更适合拥有稳定语义、边界和理由。

AGENTS.md 是由 Agentic AI Foundation 管理的开放约定，GitHub 已支持它，但这仍属于新兴 agent instruction 层，而不是替代 README、architecture docs 或 contracts 的成熟通用文档架构。[AGENTS.md specification](https://agents.md/)；[GitHub：Support for different types of custom instructions](https://docs.github.com/en/copilot/reference/custom-instructions-support)

## 4. 三种方向的维护工作量评估

| 方向 | 一次性迁移 | 长期维护 | 对未来新增内容 | 人类查找 | AI 查询 | 主要风险 |
| --- | --- | --- | --- | --- | --- | --- |
| 四个 bounded owner 大文档 | 中高 | 初期低；内容增长后升到中 | 中。新 topic 仍需判断塞进哪一份，文档会逐渐重新失衡 | 少量入口直观，但文件内部越来越长 | 中。需要加载或搜索较大的上下文 | 再次形成 omnibus docs；topic 重叠在大文档内部不易察觉 |
| **信息角色 × bounded atomic topic（推荐）** | 高 | **中低** | **高**。新领域可以新增 topic，不改变既有 topic 的职责 | 需要清晰 index，但单页目的明确 | **高**。检索精确且每页仍自包含 | 命名、链接和 topic 边界需要纪律 |
| 最大化原子化：微小 claim/小节即文件 | 很高 | 中高至高 | 表面上很高，实际容易出现近义页和依赖图 | 容易迷路，端到端阅读破碎 | 不保证更高；agent 需要拼接更多文件 | 链接/索引维护、上下文丢失、重复、文件移动成本 |

对单一主要维护者而言，推荐方案的长期成本不是“每次改代码都更新很多文档”，而应按语义变化触发：

- 纯实现修复、没有支持行为或 contract 变化：不改 current topic；
- 一个用户行为、runtime boundary 或 data semantic 变化：通常改一份 topic；
- 真正跨层或跨仓的变化：改相关 topic 和对应 contract；
- 新 capability、ownership、contract、retirement 或状态纠错：才更新现有 system map/index；
- README 只在公开介绍、首次使用或贡献入口改变时更新。

这会比维护固定四份大文档略多一些导航和链接工作，但能避免未来每次新增领域都重新切文档。它远低于“一个小 claim 一份文件”的持续管理成本。

## 5. 对 Chronicle 可迁移的结论

### 5.1 应保留的层

- `README.md`：英语默认的短公开入口；内容限于项目价值、支持的体验、快速开始、求助/文档入口。
- `README.zh-CN.md`：中文镜像；不再长期维护第三份完整 README。
- `AGENTS.md`：跨 host 可读的仓库约束、导航和验证入口；不拥有产品行为 truth，也不锁定 ChatGPT/Codex 与 Cursor 的分工。
- `docs/system/`：继续保留 repository/capability/decision/contract maps 和一份 contract 一个文件的结构。这些文件按所有权与兼容边界组织，生命周期不同于产品说明，不应为了追求统一目录而合并。
- `CONTEXT.md` 与 ADR：分别拥有术语和耐久决策；按已有规则按需创建，不扩张为日常流水账。
- `.cursor/plans/`、`docs/reports/`：历史档案原地保留，不迁移或重编号。
- `docs/guides/`：按已接受方向只作为 reference 或 historical，不拥有 truth。

### 5.2 Current 产品文档应从“固定套数”改成“topic 加入规则”

不需要现在承诺永远只有四份或五份 current product docs。可以在稳定的产品区域下按需建立 topic，例如 product experience、frontend/runtime、exploration、data 等；目录名只负责粗粒度导航，文件才是可独立维护的 topic。

新建一份 current topic 应同时满足：

1. 标题能表达一个独立可回答的问题或 subject。
2. 内容有共同的变化原因；不会因为两个互不相关的功能经常分别修改。
3. 离开前一篇文档仍能通过短 introduction 理解。
4. 能明确指出不负责什么，以及相关 contract/source/test 在哪里。
5. 现有 topic 无法在不混合信息目的或所有权的前提下自然容纳它。

如果不满足这些条件，就先作为现有 topic 的 section。若一个文件持续出现两个独立变化频率、两个不同证据 owner 或两种互相干扰的信息目的，再拆分。

### 5.3 不需要增加的系统

- 不采用 DITA XML、DITA maps、CMS 或内容复用语法；使用其 topic 原则即可。
- 不增加 YAML frontmatter、状态数据库或第二份 authority registry。
- 不把每个 current topic 翻译成中英双份；保持英语 README 默认入口，中文作为主要内部创作语言即可。
- 不把 host-specific instruction 文件变成产品规格。
- 不为了满足 Diátaxis 预先创建空的 tutorial/how-to/reference/explanation 目录。

## 6. 对 Issue #370 的研究建议

Q22 不应锁定为“四份 bounded owner docs”。更稳健的决策表述是：

> Chronicle 采用信息角色与产品 subject 相结合的 bounded atomic topic 架构。每份 current topic 回答一个可独立理解、具有共同变化原因的问题；topic 不能细分到失去连贯上下文。`docs/system/decision-index.md` 是唯一导航和状态索引，不新增 registry。README、agent instructions、current product topics、cross-repository contracts、reference guides 和 historical records 保持不同职责与生命周期。具体初始 topic 清单在迁移实施票中根据现有内容生成，而不是在本决策中永久限制文件数量。

这项选择的一次性迁移工作量高于把旧五份重写成四份，但长期维护为中低：普通语义变更通常只改一个 topic；新增领域只增加有真实内容的 topic；导航只在 topic 来源或状态发生变化时更新。它也保留了将来继续拆分或合并的空间，不需要再次重做整套文档架构。

## 官方来源索引

### 通用文档架构

- [Diátaxis](https://diataxis.fr/)
- [Diátaxis：Start here](https://diataxis.fr/start-here/)
- [Diátaxis：Complex hierarchies](https://diataxis.fr/complex-hierarchies/)
- [Diátaxis：How to use Diátaxis](https://diataxis.fr/how-to-use-diataxis/)
- [GitHub：About the repository README file](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [GitHub：Creating a default community health file](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)
- [GitHub：Setting guidelines for repository contributors](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors)
- [GitHub：Adding a security policy](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/add-security-policy)
- [Google：Documentation Best Practices](https://google.github.io/styleguide/docguide/best_practices.html)
- [Google：Markdown style guide](https://google.github.io/styleguide/docguide/style.html)

### 成熟项目实例

- [Django：Writing documentation](https://docs.djangoproject.com/en/5.2/internals/contributing/writing-documentation/)
- [Kubernetes：Page content types](https://kubernetes.io/docs/contribute/style/page-content-types/)
- [Kubernetes：Content organization](https://kubernetes.io/docs/contribute/style/content-organization/)
- [Rust：Rust Documentation](https://doc.rust-lang.org/stable/index.html)
- [Rust：The Rust Programming Language](https://doc.rust-lang.org/stable/book/)
- [Rust：The rustdoc book — How to write documentation](https://doc.rust-lang.org/rustdoc/how-to-write-documentation.html)

### Topic authoring 与 AI instructions

- [OASIS DITA：What are topics?](https://docs.oasis-open.org/dita/v1.0/archspec/topics.html)
- [OASIS DITA：Why topics?](https://docs.oasis-open.org/dita/v1.1/OS/archspec/dita_spec_22_topics_why.html)
- [OASIS DITA：The benefits of a topic-based architecture](https://docs.oasis-open.org/dita/v1.2/os/spec/archSpec/topicbenefits.html)
- [OASIS DITA：The topic as the basic unit of information](https://docs.oasis-open.org/dita/dita/v1.3/os/part2-tech-content/archSpec/base/topicdefined.html)
- [AGENTS.md specification](https://agents.md/)
- [GitHub：Adding repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)
- [GitHub：Support for different types of custom instructions](https://docs.github.com/en/copilot/reference/custom-instructions-support)
