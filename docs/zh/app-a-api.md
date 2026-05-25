# 附录 A · API 完整参考

> 本附录对照 Claude Code 官方分发包的类型定义 `sdk-tools.d.ts`（`WorkflowInput` / `WorkflowOutput` 接口）与 Workflow 工具定义整理，作为全书的 API 速查。**所有字段语义均以此为准。**
>
> 适用版本：Claude Code v2.1.150（`CLAUDE_CODE_WORKFLOWS=1`）。功能为实验性，字段可能随版本演进——以你本机的类型定义为最终依据。

---

## A.1 Workflow 工具：入参 `WorkflowInput`

调用 Workflow 工具时的入参。脚本来源有三种（`script` / `name` / `scriptPath`），外加 `args` 参数。**`scriptPath` 优先级最高**（高于 `script` 和 `name`）；`script` 与 `name` 的相对优先级官方未明确。

| 字段 | 类型 | 说明 |
|---|---|---|
| `script` | `string?` | 自包含脚本。**必须**以纯字面量 `export const meta = {…}` 开头，随后是脚本体。 |
| `name` | `string?` | 预定义/具名工作流（内置或 `.claude/workflows/`），解析为一段自包含脚本。 |
| `args` | `object?` | 暴露给脚本的全局 `args`。用于参数化具名工作流。 |
| `scriptPath` | `string?` | 磁盘脚本路径。每次调用脚本都会落盘并在结果里返回该路径；可用 Write/Edit 改后用此字段重跑，无需重发脚本。**优先级最高**。 |
| `resumeFromRunId` | `string?` | 从某次运行断点续传。未改动的 `agent()` 调用返回缓存结果；**仅同会话**。续传前先停掉上一次运行（TaskStop）。 |

## A.2 Workflow 工具：返回 `WorkflowOutput`

Workflow 工具**始终异步**，立即返回回执（不是工作流结果）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | `"async_launched" \| "remote_launched"` | **只有这两种取值。** |
| `taskId` | `string` | 后台任务句柄。 |
| `runId` | `string?` | 本地运行标识（形如 `wf_…`），`resumeFromRunId` 用；`remote_launched` 无（用 CCR session URL 作续传句柄）。 |
| `summary` | `string?` | 摘要。 |
| `transcriptDir` | `string?` | subagent 执行记录目录。 |
| `scriptPath` | `string?` | 本次落盘脚本路径，可 Write/Edit 后作 `scriptPath` 重跑。 |
| `sessionUrl` | `string?` | `remote_launched` 时的 CCR session URL。 |
| `warning` | `string?` | 非阻塞提示（如本地 git 状态与待克隆的远端分支有偏离）。 |
| `error` | `string?` | 语法检查失败时设置。 |

> 工作流的**真正结果**通过完成时的 `<task-notification>` 送达，内含返回值与用量统计（`agent_count`/`tool_uses`/`total_tokens`/`duration_ms`）。

---

## A.3 脚本结构

```javascript
export const meta = { /* 纯字面量，见 A.4 */ }
// ↑ 必须第一行；以下是脚本体（async 上下文，可直接 await）
phase('...')
const x = await agent('...', { /* opts */ })
const ys = await parallel([ () => agent('...'), () => agent('...') ])
const zs = await pipeline(items, stage1, stage2)
log('...')
return result
```

- 脚本体运行在 `async` 上下文，直接 `await`。
- 标准 JS 内置（`JSON`/`Math`/`Array`/…）可用。
- **无**文件系统 / Node API 访问。
- **禁用 `Date.now()` / `Math.random()` / 无参 `new Date()`**——会抛错（破坏续传所需的可重放性）。

---

## A.4 `meta`（导出常量，纯字面量）

```javascript
export const meta = {
  name: 'review-changes',                 // 必填
  description: 'Review changed files',    // 必填，显示在权限确认对话框
  whenToUse: 'When a PR touches many files', // 可选，显示在工作流列表
  phases: [                               // 可选，每项一个进度分组
    { title: 'Review' },
    { title: 'Verify', model: 'haiku' },  // 该阶段用特定模型时标注
  ],
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 工作流名称。 |
| `description` | 是 | 一行描述，显示在权限弹窗。 |
| `whenToUse` | 否 | 适用场景，显示在工作流列表。 |
| `phases` | 否 | `{ title, detail?, model? }[]`；`title` 与 `phase()`/`opts.phase` 按字符串精确匹配。 |

**约束**：`meta` 必须是纯字面量——不得有变量、函数调用、展开运算符、模板插值（运行时在执行脚本前静态读取它）。

---

## A.5 `agent(prompt, opts?) → Promise<any>`

派发一个 subagent。

```javascript
await agent(prompt, {
  label,       // string?  进度显示标签，默认自动编号
  phase,       // string?  显式归入某进度组（pipeline/parallel 内部务必用它）
  schema,      // object?  JSON Schema，强制结构化输出
  model,       // string?  覆盖模型（省略=继承主循环模型；简单任务可 'haiku'）
  isolation,   // 'worktree'?  在独立 git worktree 运行（昂贵；并行改文件防冲突时用）
  agentType,   // string?  自定义 subagent 类型（如 'Explore' / 'code-reviewer'）
})
```

**返回语义**：

- 无 `schema` → 返回 subagent 最终文本（`string`）。
- 有 `schema` → 强制 subagent 调 `StructuredOutput` 工具，在工具调用层校验，返回**已验证对象**；不匹配则模型重试。
- 用户中途跳过该 agent → 返回 `null`（用 `.filter(Boolean)` 过滤）。

**选项细节**：

| 选项 | 说明 |
|---|---|
| `label` | 覆盖 `/workflows` 里的显示标签；描述性 label 利于搜索与观察。 |
| `phase` | 显式归组；与 `meta.phases.title` 精确匹配。**在 pipeline/parallel 内部用它**，避免对全局 `phase()` 的竞争。 |
| `schema` | JSON Schema；校验在工具调用层，故模型会自动重试到合规。 |
| `model` | 覆盖该 agent 模型；省略则继承主循环模型（推荐，除非用户指定或任务足够简单可用 `'haiku'`）。 |
| `isolation: 'worktree'` | 在全新 git worktree 运行；**昂贵**（~200–500ms 启动 + 磁盘/agent），仅当并行 agent 改文件会冲突时用；无改动自动清理；结果返回路径与分支。 |
| `agentType` | 用自定义 subagent 类型而非默认（与 Agent 工具同一注册表解析）；与 `schema` 可组合（自定义 agent 的系统提示会追加 StructuredOutput 指令）。 |

---

## A.6 `pipeline(items, stage1, stage2, …) → Promise<any[]>`

每个 item **独立**流过全部 stage，**阶段间无屏障**。墙钟 ≈ 最慢的单条链。

- 每个 stage 回调收到 `(prevResult, originalItem, index)`。
- 第一阶段：`prevResult === item`。
- 某 stage 抛错 → 该 item 变 `null` 并跳过其余 stage。
- **多阶段默认用 `pipeline()`。**

```javascript
const out = await pipeline(items,
  (item, _orig, i) => agent(`stage1 for ${item}`, { phase: 'S1', schema: A }),
  (r, item, i)     => agent(`stage2 using ${r.x} (orig ${item})`, { phase: 'S2', schema: B }),
)
```

## A.7 `parallel(thunks) → Promise<any[]>`

并发执行一组 **thunk**（`() => Promise`），**屏障**：等全部完成。结果顺序 = 输入顺序。

- 异步 reject / 内部 `agent()` 出错 → 该位置 `null`；thunk 体内同步 `throw` 会 reject 整个调用（用前 `.filter(Boolean)`）。
- 仅当确实需要所有结果一起时才用。

```javascript
const results = (await parallel(items.map(it => () => agent(prompt(it), { schema: S })))).filter(Boolean)
```

<div class="callout warn">

传给 `parallel()` 的必须是**函数数组（thunk）**（`() => agent(...)`），不是 Promise 数组（`agent(...)`）。后者会立即开始执行，从而失去 `parallel()` 的异步失败归集语义（async reject / agent 出错 → 对应位置 `null`）。

</div>

## A.8 其它全局

| 全局 | 签名 | 说明 |
|---|---|---|
| `phase(title)` | `(string) => void` | 开启新阶段，其后 `agent()` 归入该组。 |
| `log(message)` | `(string) => void` | 向用户输出一行进度叙述（进度树上方）。 |
| `args` | `any` | Workflow 入参 `args` 的值（未传则 `undefined`）。 |
| `budget` | 见下 | 本回合 token 预算对象。 |
| `workflow(nameOrRef, args?)` | `(string\|{scriptPath}, any?) => Promise<any>` | 内联运行另一工作流；共享并发上限/agent 计数/中止信号/token 预算；**嵌套仅一层**。 |

### `budget`

```javascript
budget.total        // number | null：本回合 token 目标；null = 未设
budget.spent()      // number：本回合已花 output token（主循环+所有工作流共享池）
budget.remaining()  // number：max(0, total - spent())；未设时为 Infinity
```

硬上限：`spent()` 达 `total` 后再调 `agent()` 抛错。动态循环务必用 `budget.total &&` 守卫。

---

## A.9 并发与规模

| 限制 | 值 |
|---|---|
| 单工作流同时运行 agent | `min(16, CPU核心数 − 2)`，超出排队 |
| 单工作流 agent 总数上限 | **1000**（失控循环兜底） |
| `workflow()` 嵌套层数 | **1 层**（子工作流内再调 `workflow()` 抛错） |

---

## A.10 触发与门控

- **门控**：环境变量 `CLAUDE_CODE_WORKFLOWS=1`。
- **触发**：①消息含 `ultrawork` 关键词；②直接调用 Workflow 工具；③具名工作流 / 触发它的技能或斜杠命令。
- **实时进度**：斜杠命令 `/workflows`。

---

## A.11 最小骨架模板

```javascript
export const meta = {
  name: 'my-workflow',
  description: 'one-line description shown in the permission dialog',
  phases: [{ title: 'Work' }],
}

phase('Work')
const result = await agent('do the thing', {
  label: 'worker',
  schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
})
log(`done: ${result.ok}`)
return result
```

> 字段语义如有疑问，以你本机 `@anthropic-ai/claude-code/sdk-tools.d.ts` 中的 `WorkflowInput` / `WorkflowOutput` 为最终依据。
