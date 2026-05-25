# 接地事实与写作规范（内部文档 · 非成书内容）

> **本文件是「织经 · Workflow Cookbook」全体写作者的唯一事实源。** 任何关于 Workflow API、行为、环境的论断，都必须能在本文件中找到依据，或来自 `assets/transcripts/` 的真实运行记录。**严禁凭训练记忆臆测任何 API 细节。** 不确定的地方，宁可标注「（待核实）」也不要编造。

---

## A. 特性事实（已实测核实）

| 事实 | 值 | 信源 |
|---|---|---|
| 功能名 | Workflow 工具（特性昵称 ultrawork） | 工具定义 |
| 门控环境变量 | `CLAUDE_CODE_WORKFLOWS=1` | 实测会话环境变量存在 |
| Claude Code 版本 | v2.1.150 | `@anthropic-ai/claude-code/package.json` |
| subagent 模型 | `claude-opus-4-7`（由 `CLAUDE_CODE_SUBAGENT_MODEL` 指定） | 实测环境变量 |
| 关联标志 | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | 实测环境变量 |
| 触发方式 | ①消息含 `ultrawork` 关键词；②直接调用 Workflow 工具；③具名工作流/技能触发 | 工具定义 |
| 返回性质 | **始终异步**：立即返回 `taskId`/`runId`，完成时发 `<task-notification>` | 类型定义 + 实测 |
| 实时进度 | 斜杠命令 `/workflows` | 工具定义 |

## B. API 权威定义（对照官方 `sdk-tools.d.ts` 与工具定义）

### WorkflowInput（调用 Workflow 工具的入参）
- `script?: string` — 自包含脚本，**必须**以纯字面量 `export const meta = {...}` 开头。
- `name?: string` — 预定义/具名工作流（内置或 `.claude/workflows/`）。
- `args?: object` — 暴露给脚本的全局 `args`。
- `scriptPath?: string` — 磁盘脚本路径；优先级高于 script/name。每次调用脚本都会落盘。
- `resumeFromRunId?: string` — 断点续传：未改动的 `agent()` 调用返回缓存结果；仅同会话。

### WorkflowOutput（Workflow 工具的返回）
- `status: "async_launched" | "remote_launched"`（**只有这两种**）
- `taskId: string`
- `runId?: string`（形如 `wf_...`，续传用；remote 无）
- `summary?`, `transcriptDir?`, `scriptPath?`, `sessionUrl?`, `warning?`, `error?`（语法检查失败时）

### 脚本体内的全局钩子（运行时注入，无需 import）
- **`meta`**（导出常量，纯字面量）：必填 `name`、`description`；可选 `whenToUse`、`phases`（每项 `{title, detail?, model?}`）。**禁止**变量/函数调用/展开/模板插值。
- **`agent(prompt: string, opts?): Promise<any>`**
  - 无 `schema` → 返回 subagent 最终文本（string）。
  - 有 `schema`（JSON Schema）→ 强制 subagent 调 `StructuredOutput` 工具，**在工具调用层校验**，返回**已验证对象**；不匹配则模型重试。
  - 用户中途跳过该 agent → 返回 `null`（用 `.filter(Boolean)` 过滤）。
  - `opts.label` 覆盖显示标签；`opts.phase` 显式归入某进度组（在 pipeline/parallel 内部尤其重要，避免竞争全局 phase()）；`opts.model` 覆盖模型（省略则继承主循环模型；简单任务可用 `'haiku'`）；`opts.isolation: 'worktree'` 在独立 git worktree 运行（**昂贵**，仅当并行改文件会冲突时用，无改动自动清理）；`opts.agentType` 用自定义 subagent 类型（如 `'Explore'`、`'code-reviewer'`，与 schema 可组合）。
- **`pipeline(items, stage1, stage2, ...): Promise<any[]>`** — 每个 item 独立流过全部 stage，**阶段间无屏障**。墙钟≈最慢的单条链，而非各阶段最慢之和。每个 stage 回调收到 `(prevResult, originalItem, index)`。某 stage 抛错→该 item 变 `null` 并跳过其余 stage。**多阶段默认用 pipeline。**
- **`parallel(thunks: Array<() => Promise<any>>): Promise<any[]>`** — 并发执行，**屏障**：等全部完成。返回的 promise 异步 reject / agent 出错→该位置 `null`（调用本身不 reject，用前先 `.filter(Boolean)`）；thunk 体内同步 `throw` 会 reject 整个调用。仅当确实需要所有结果一起时才用。
- **`log(message: string): void`** — 向用户输出进度（进度树上方叙述行）。
- **`phase(title: string): void`** — 开启新阶段；其后 `agent()` 归入该组。
- **`args: any`** — Workflow 入参 `args` 的值（未传则 undefined）。
- **`budget: { total: number|null, spent(): number, remaining(): number }`** — 本回合 token 目标（来自用户 `+500k` 式指令）。`total` 为 null 表示未设目标（此时 `remaining()` 为 Infinity）。是**硬上限**：`spent()` 达 `total` 后再调 `agent()` 会抛错。池为主循环+所有工作流共享。
- **`workflow(nameOrRef, args?): Promise<any>`** — 内联运行另一个工作流（具名或 `{scriptPath}`）。共享并发上限/agent 计数/中止信号/token 预算。**嵌套仅一层**：子工作流里再调 workflow() 会抛错。

### 硬约束
- `meta` 必须纯字面量（运行时执行前静态读取）。
- 脚本禁用 **`Date.now()` / `Math.random()` / 无参 `new Date()`**（破坏可重放性 → 续传失效）。需要时间戳用 `args` 传入或事后盖戳；需要随机性用 agent 下标变化提示词。
- 标准 JS 内置（JSON/Math/Array…）可用；**无文件系统/Node API**。
- 并发上限：每工作流同时运行 `min(16, CPU核心数 − 2)` 个 agent，超出排队。
- 全局兜底：单工作流生命周期 agent 总数上限 **1000**。
- 文件写入用原生 Write/Edit 工具——`ctx_execute` / Bash 子进程的写入**不持久化**到宿主文件系统。

### subagent 行为
- subagent 被告知「最终文本即返回值」（不是给人看的话），故返回原始数据。
- 结构化输出在工具调用层校验，模型不合规会重试。**重试无明确上限、重试成本倍率未实测**——不要声称「重试上限」或具体倍率。

### B2. 权威补充（均来自 Workflow 工具定义原文，权威可用）
> 以下条目此前未完整收录，导致部分章节被 codex 误判「超出 grounding」。它们**全部来自工具定义原文，可放心使用**：
- `meta.description`：**一行，显示在权限确认对话框**（authoritative）。
- `meta.whenToUse`：**显示在工作流列表**（authoritative）。
- `meta.phases[].model`：**某阶段的模型覆盖**（如 `{title:'Verify', model:'haiku'}`）（authoritative）。
- `opts.model`：覆盖该 agent 模型；**省略则继承主循环模型**（首选）（authoritative）。
- `opts.isolation:'worktree'`：**昂贵（~200–500ms 启动 + 磁盘/agent）**；无改动自动清理；**结果返回 worktree 路径与分支**（authoritative）。
- `opts.agentType`：**与 Agent 工具同一注册表解析**；与 schema 组合时，**自定义 agent 的系统提示会被追加 StructuredOutput 指令**（authoritative）。
- `budget.spent()`：返回**本回合已花的 output token**（主循环 + 所有工作流**共享池**）；`budget.total` 是**硬上限**，达到后再调 `agent()` 抛错（authoritative，"output token" 正确）。
- 续传粒度：**最长未改动的 `agent()` 前缀**秒级返回缓存；**第一个被编辑/新增的调用及其之后**全部 live 重跑；**仅同会话**；**续传前先 TaskStop 停掉上一次运行**（authoritative）。
- `scriptPath` **优先级高于 `script` 和 `name`**；但 `script` 与 `name` 的相对优先级**未明确**——不要写 `scriptPath > script > name` 这种三级排序。
- `remote_launched`：无 `runId`，**CCR session URL 即续传句柄**（authoritative）。
- Agent Teams（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`）：有状态、可经 SendMessage 互通、共享任务列表的协作团队（本书实测中实际使用过 TeamCreate/SendMessage，可据此描述）。

### B3. 未核实/需谨慎（不要当已验证机制写）
- **顶层 `meta.model`**：类型未确认顶层字段及其「自动解析」语义。**只写已确认的 `phases[].model` 与 `opts.model` 两层**；不要写「meta.model → phases[].model → opts.model 三层解析」。
- **主循环模型**：工具定义只说 `opts.model` 省略「继承主循环模型」。本书实测会话的主循环恰为 Opus 4.7（见系统环境），引用时写「本书实测会话的主循环为 Opus 4.7」，不要当成 Workflow 的通用事实。
- **JSON Schema 的 `description` 字段是否「交给模型」**：属通用 JSON Schema 实践建议，非工具定义明示机制——写成「建议」而非「运行时保证」。
- **大产物「写盘 + schema 返回句柄」**：脚本本身无 FS/Node API；该模式属设计建议，标「（示意，未实跑）」。
- **`parallel` 与节流**：并发上限是**每工作流**的（`min(16, 核心−2)`），非 `parallel()` 专属。传 Promise 而非 thunk 的问题是「不符合 `parallel(thunks)` API、失去其异步失败归集（async reject/agent 出错→null）语义」，**不要说「绕过运行时节流」**。

## C. 真实运行数据（来自 assets/transcripts/，可直接引用）

> **10 完成记录 / 9 个唯一 Run ID**（#4 为 #1 的续传，复用同一 Run ID、0 新 agent）。

| # | Workflow | Run ID | agent_count | total_tokens | duration_ms | 要点 |
|---|---|---|---|---|---|---|
| 1 | hello（单 agent + schema） | `wf_dacbd480-d5d` | 1 | 26,338 | 5,506 | schema 强制类型（sum=4 为数字）；异步返回 taskId/runId |
| 2 | parallel（3 并发） | `wf_52957913-6d2` | 3 | 78,844 | 8,395 | 8.4s ≪ 3×5.5s，并发真实；屏障；token≈3× |
| 3 | pipeline（3 项×2 阶段） | `wf_bf086b98-6ec` | 6 | 158,982 | 26,743 | agent_count=6 印证；stage 签名 (prev, orig, i)；阶段间无屏障 |
| 4 | resume 缓存命中 | `wf_dacbd480-d5d`（复用 #1） | 0 | 0 | 8 | 续传缓存命中，返回值与首次一致 |
| 5 | nested workflow() | `wf_85e22b38-126` | 1 | 26,338 | 6,050 | 子工作流计入父；嵌套仅一层 |
| 6 | PR 多维 review | `wf_4c5caabb-b73` | 4 | 221,648 | 272,643 | dogfood 审本书前端，26→16 问题 |
| 7 | GCF slugify | `wf_7472ceac-daa` | 3 | 96,468 | 180,724 | Generate-Critique-Fix，揪出 10 个缺陷 |
| 8 | judge panel | `wf_f5b69668-b18` | 5 | 201,852 | 79,462 | 评委面板 3:0 收敛 |
| 9 | bug hunter | `wf_53da9a06-915` | 11 | 311,134 | 61,660 | 5/5 确认，证伪者 2:0 |
| 10 | deep research | `wf_6090decc-8a5` | 4 | 148,975 | 298,530 | 真实 web 检索 + 逐版本核实 |

> 经验法则：token ≈ agent 数 × 每 agent 上下文（约 2.5–3 万/agent）；墙钟取决于关键路径，并发把 N 个压到「最慢的一个」。
> **更多真实运行**会陆续追加到 `assets/transcripts/`，写实战章节前先读对应记录。

## D. 四大社区系统精华（来自对各仓库源码的真实阅读，第五部用）

- **ccg-workflow**（Claude+Codex+Gemini 多模型协作）：精华＝**磁盘状态 `task.json` + 每轮 Hook 注入面包屑**对抗上下文压缩；Ralph Loop 干净上下文迭代；文件归属+Layer 分层并行；Spec Evolution；死循环检测。它是「提示词状态机 + JS Hook + Go 二进制桥接异构 CLI」模拟编排。
- **superpowers**（obra，跨 7 个 harness 的方法论）：精华＝**两段式评审闭环**（spec 合规→code quality，各自循环到过）；Brainstorming-first 硬门禁；TDD Iron Law；Verification-before-completion；结构化状态返回（DONE/BLOCKED/...）。纯 skill + SessionStart hook 注入「行为宪法」，概率性编排。
- **oh-my-claudecode（OMC）**：精华＝**`Stop` 钩子持久循环**（「boulder never stops」，让「是否允许停止」可编程）；控制面/数据面分离 + Artifact 句柄；声明式委派强制；echo-guard；PRD 驱动 + 独立 reviewer 签核；20 角色。hooks+状态文件模拟编排，无 JSON Schema 强约束。
- **oh-my-openagent（OmO）**（建在 opencode 上，非 Claude Code）：精华＝**工具层护栏 throw**（规划者物理无法写码）+ system-reminder 注入纠偏（VERIFICATION_REMINDER）；Category（语义意图）而非模型名委派；跨会话 boulder.json + notepad 外化记忆。

**贯穿洞察**：这 4 个系统都诞生在原生 Workflow 之前，靠「提示词+Hook+状态文件」**模拟**确定性编排。原生 Workflow 提供了它们缺的**确定性骨架 + JSON Schema 强约束**；而它们的精华（验证门、持久循环、磁盘状态、越界护栏）正是原生 Workflow 该补的**韧性层**。第五部的主线＝「如何把这些精华用 phase/schema 重写成可复用 Workflow」。

### D2. 第 23 章具体机制的源码核实（2026-05 复核，可引用）

以下机制声明已逐条对照真实仓库源码核实（用于第 23 章；4 条 VERIFIED + 1 条更正）：

- **ccg-workflow「10 种策略」**：`templates/commands/go.md` 附录表恰 10 条（direct-fix / quick-implement / guided-develop / full-collaborate / debug-investigate / refactor-safely / deep-research / optimize-measure / review-audit / git-action），策略文件目录 `templates/engine/strategies/` 真实存在。
- **ccg-workflow「信号量并发 + DAG 依赖调度」**：`codeagent-wrapper/executor.go` 的 `topologicalSort`（indegree 分层拓扑排序 + cycle 检测）与 `executeConcurrentWithContext`（`sem := make(chan struct{}, workerLimit)` 信号量）。
- **ccg 多模型审查路由**：`src/utils/config.ts` 默认 `frontend.primary='antigravity'`、`backend.primary='codex'`、`review.models=['codex','antigravity']`（并行）。（注：`model-router.md` 文档示例写 gemini，但生效配置以 config.ts 为准。）
- **oh-my-openagent**：入口 `keyword-detector/constants.ts` `/\b(ultrawork|ulw)\b/i`；`task()`/`call_omo_agent` 真调 opencode SDK（`call-omo-agent/session-creator.ts` `ctx.client.session.create(...)`、`completion-poller.ts` `client.session.status()/messages()`）；`task` = `delegate-task` 工具（`delegate-task/AGENTS.md` 对外名为 `task`）。
- **更正（原写「11 个内置角色」→ 应为「10 个」）**：OmO 注册的 `BuiltinAgentName` 联合（`src/agents/types.ts`）恰 **10 个**（sisyphus, hephaestus, oracle, librarian, explore, multimodal-looker, metis, momus, atlas, sisyphus-junior）；**Prometheus 是 planner 人格、不在注册联合内**。

## E. 写作规范（所有章节统一）

1. **语言**：简体中文正文；技术术语/代码标识符保留英文原形。英文镜像在 `docs/en/`，口径一致。
2. **深入浅出**：每个概念从「为什么需要它」讲起 → 最小可运行例子建立直觉 → 逐步加码到生产级。
3. **结构**：每章以 `# 第 N 章 · 标题` 开头，引用块点题；用 `## N.1`、`## N.2` 分节；小结收尾；结尾给「继续阅读：[下一章](#/zh/<id>)」链接。
4. **真实优先**：能引用 C 节真实数据就引用，并注明 Run ID / 信源。仅作示意、未实跑的脚本**必须明确标注**「（示意，未实跑）」。
5. **图示**：用 ` ```mermaid ` 代码块画流程图/时序图/状态机（前端会渲染为 SVG），帮助「深入浅出」。
6. **代码块**：用 ```javascript / ```json / ```bash 等带语言标注；缩进 2 空格；保持可直接复制运行。
7. **callout**：用 `<div class="callout tip">…</div>`（提示）/ `warn`（警告/陷阱）/ `info`（信息）包裹，前后留空行。
8. **表格**：用于对比、字段清单、数据。
9. **篇幅**：百科级深度，认知/基础/进阶章约 1.5–2.5 万字，实战食谱章围绕真实运行展开。
10. **禁止**：①虚构 API/参数/输出；②照抄参考博客的案例（要原创真实案例）；③空洞套话。内链格式 `#/zh/<chapter-id>`（见 manifest.json）。

## F. 章节清单与文件路径

见 `manifest.json`。中文写到 `docs/zh/<file>`，英文写到 `docs/en/<file>`。一个文件同一时刻只允许一个写作者（文件归属互斥）。
