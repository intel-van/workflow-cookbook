# 第 04 章 · 第一个 Workflow

> 理论讲完了，动手。这一章我们从「确认环境」到「跑通并读懂第一个 Workflow」，把启动、异步、进度、迭代这套循环走一遍。每一步都对照**真实运行**的输出。

---

## 4.1 前置：确认 Workflow 已开启

Workflow 是实验性功能，由环境变量 `CLAUDE_CODE_WORKFLOWS` 门控。开工前先确认它在你的会话里是开着的。

```bash
# 启动时临时开启（当前会话生效）
CLAUDE_CODE_WORKFLOWS=1 claude
```

或写入 `~/.claude/settings.json` 持久开启：

```json
{
  "env": { "CLAUDE_CODE_WORKFLOWS": "1" }
}
```

确认是否生效，最直接的方式是看环境变量。本书写作的会话里它**确实存在且为 `1`**：

```text
CLAUDE_CODE_WORKFLOWS = 1
```

<div class="callout tip">

如果你不确定，可以直接在对话里说「ultrawork：跑一个最小工作流确认运行时」。如果功能开着，Claude 就能调用 Workflow 工具；如果没开，它会告诉你工具不可用。

</div>

---

## 4.2 Hello, Workflow

下面是本书第一个真实运行的脚本。它只做一件事：派发一个 subagent，要求它返回结构化的「运行确认」。

```javascript
export const meta = {
  name: 'hello-workflow',
  description: 'Smoke test: one subagent returns schema-constrained structured output',
  phases: [{ title: 'Greet', detail: 'One subagent confirms the runtime' }],
}

phase('Greet')
const r = await agent(
  'You are a smoke test for the Claude Code Workflow runtime. Return a one-sentence ' +
  'confirmation message, the integer value of 2+2, and a boolean confirming you ran ' +
  'as a workflow subagent.',
  {
    label: 'smoke',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        sum: { type: 'number' },
        runtimeConfirmed: { type: 'boolean' },
      },
      required: ['message', 'sum', 'runtimeConfirmed'],
    },
  }
)
log(`smoke result: ${JSON.stringify(r)}`)
return r
```

逐行解释（呼应第 01 章的「经纬」）：

| 行 | 作用 |
|---|---|
| `export const meta = {…}` | **经线**：纯字面量，声明名称、描述、阶段。运行时执行前先静态读它。 |
| `phase('Greet')` | 切到「Greet」阶段，其后的 agent 在进度树里归入此组。 |
| `agent(prompt, { schema })` | **纬线**：派发一个 subagent，`schema` 强制它返回已验证的结构化对象。 |
| `log(...)` | 向你输出一行进度叙述。 |
| `return r` | 工作流的最终返回值，会出现在完成通知里。 |

<div class="callout warn">

**这是 Workflow 脚本，不是 Node 脚本——新手第一坑。** `meta`/`phase`/`agent`/`log`/`budget`/`args` 都是 Workflow **运行时注入的全局符号**（`_grounding.md` B 节：「运行时注入，无需 import」）。把这段存成 `hello.js` 用 `node hello.js` 单独跑，Node 找不到这些全局，会立刻抛 `ReferenceError: phase is not defined`——**Windows、macOS、Linux 三平台一模一样**（这跟操作系统无关，是因为 Node 根本没有 Workflow 运行时这层）。它只能在**开了 `CLAUDE_CODE_WORKFLOWS=1` 的 Claude Code 会话里**、由 Claude 调用内置 Workflow 工具执行（见 4.1：直接对 Claude 说「ultrawork：跑这个」）。本书实测正是这样跑通它的：runtime 确认、schema 强制 `sum=4` 为**数字**、约 2.6 万 token / 约 5.5 秒（见 4.3、4.4 的真实回执与用量）。

</div>

---

## 4.3 启动：你会立刻拿到一个回执

把脚本交给 Workflow 工具的瞬间，它**不会等跑完**，而是立即返回一个回执。这是真实输出：

```text
Workflow launched in background. Task ID: wi7ye81mb
Summary: Smoke test: one subagent returns schema-constrained structured output
Transcript dir: ...\subagents\workflows\wf_dacbd480-d5d
Script file: ...\workflows\scripts\hello-workflow-wf_dacbd480-d5d.js
Run ID: wf_dacbd480-d5d
You will be notified when it completes. Use /workflows to watch live progress.
```

这段回执，对应的就是 `_grounding.md` B 节里 `WorkflowOutput` 的真实字段。把它们对照成一张表：

| 回执里看到的 | `WorkflowOutput` 字段 | 含义 / 用途 |
|---|---|---|
| `Task ID: wi7ye81mb` | `taskId: string` | 后台任务句柄（可配合 TaskStop 停掉它）。 |
| `Run ID: wf_dacbd480-d5d` | `runId?: string` | 本次运行标识，**断点续传要用**（第 22 章）；`remote_launched` 时没有此项。 |
| `Script file: ...js` | `scriptPath?` | 你的脚本被**写到了磁盘上**——这是迭代的关键（见 4.5）。 |
| `Transcript dir: ...` | `transcriptDir?` | subagent 的完整执行记录目录。 |
| `Summary: Smoke test...` | `summary?` | 回显的一行摘要（即 `meta.description`）。 |

<div class="callout info">

**回执的 `status` 只有两种取值。** 据 `_grounding.md` B 节，`WorkflowOutput.status` 是 `"async_launched" | "remote_launched"`——**没有第三种**，尤其**没有**一个表示「已完成」的同步状态。本地跑就是 `async_launched`（你这次），跑在 CCR 远端就是 `remote_launched`（此时无 `runId`，续传句柄改用返回的 session URL）。语法检查失败时，返回会带一个 `error` 字段（见 4.7）。**记住这条，你就不会再期待「调用 Workflow 直接拿到结果」了。**

</div>

<div class="callout info">

**为什么是异步的？** 因为一个工作流可能扇出几十个 subagent、跑几分钟甚至更久。异步设计让你启动后能继续做别的事，完成时再收到通知。所以——**Workflow 工具的返回值不是结果，而是「已启动」的回执**。真正的结果在完成通知里。

</div>

---

## 4.4 进度与完成

启动后，用斜杠命令 **`/workflows`** 可以看到一棵**实时进度树**：当前在哪个 phase（来自 `meta.phases` 与 `phase()`）、哪些 agent 在跑、哪些已完成（叶子节点名来自每个 `agent()` 的 `label`）。它就是你「启动之后、通知之前」这段时间里的观察窗口——一个不停刷新的进度面板。`phase`/`log`/`/workflows` 三者如何配合，是第 09 章的专题。

当工作流真正跑完，你会收到一条**完成通知**。`hello-workflow` 的真实完成通知，核心是这段返回值：

```json
{
  "message": "The Claude Code Workflow runtime smoke test executed successfully as a workflow subagent.",
  "sum": 4,
  "runtimeConfirmed": true
}
```

外加一份真实用量：

```text
agent_count = 1   tool_uses = 1   total_tokens = 26338   duration_ms = 5506
```

读懂它：

- `sum` 是数字 `4`，**不是**字符串 `"4"`——因为 schema 声明了 `type: 'number'`，校验层保证了类型（结构化输出的威力，详见第 07 章）。
- 一个最简单的 agent 往返 ≈ **5.5 秒 / 2.6 万 token**。这是你估算更大工作流成本的基线单位。

```mermaid
sequenceDiagram
    participant You as 你
    participant WF as Workflow 运行时
    participant A as subagent "smoke"
    You->>WF: Workflow({ script })
    WF-->>You: taskId wi7ye81mb · runId wf_…（立即）
    Note over You: 用 /workflows 看进度
    WF->>A: agent(prompt, { schema })
    A->>A: 调 StructuredOutput，校验通过
    A-->>WF: {message, sum:4, runtimeConfirmed:true}
    WF-->>You: 完成通知：返回值 + 用量
```

---

## 4.5 迭代循环：脚本即文件

因为脚本落了盘（回执里的 `Script file` / `WorkflowOutput.scriptPath`），迭代一个工作流不用每次重发整段代码。这形成一个**「改盘上文件 → `scriptPath` 重跑」的迭代闭环**：

```mermaid
flowchart LR
    A["首次启动<br/>Workflow({ script })"] --> B["回执给出<br/>scriptPath + runId"]
    B --> C["Write/Edit<br/>直接改那个 .js"]
    C --> D["Workflow({ scriptPath })<br/>重跑（可加 resumeFromRunId）"]
    D --> C
    style A fill:#69d
    style D fill:#2d6
```

拿到回执里的 `Script file` 路径后，每一轮迭代就是：

1. 用 `Write`/`Edit` 直接改那个 `.js` 文件；
2. 用 `{ scriptPath: "<那个路径>" }` 重新调用 Workflow（`scriptPath` 优先级高于 `script`/`name`）。

如果还想复用上次的**昂贵中间结果**，加上 `resumeFromRunId`：

```javascript
// 改完脚本后，断点续传重跑：未改动的 agent() 调用秒级返回缓存结果
Workflow({ scriptPath: ".../hello-workflow-wf_dacbd480-d5d.js", resumeFromRunId: "wf_dacbd480-d5d" })
```

「同样的脚本 + 同样的 args → 100% 缓存命中」。这就是为什么脚本里禁用 `Date.now()` / `Math.random()`（它们破坏可重放性）。续传细节见第 22 章。

---

## 4.6 让它稍微大一点：两个 agent

把 hello 扩成「两个并发 agent + 一句汇总」，体会一下 `parallel()`：

```javascript
export const meta = {
  name: 'hello-parallel',
  description: 'Two concurrent agents, then a one-line summary',
  phases: [{ title: 'Ask', detail: 'Two agents in parallel' }],
}

phase('Ask')
const [a, b] = await parallel([
  () => agent('In one sentence: what is a barrier in concurrency?', {
    label: 'q-barrier',
    schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] },
  }),
  () => agent('In one sentence: what is a pipeline in concurrency?', {
    label: 'q-pipeline',
    schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] },
  }),
])
log('both answers in')
return { barrier: a?.answer, pipeline: b?.answer }
```

注意 `parallel()` 收的是 **thunk 数组**（`() => …`），不是 Promise 数组——这是新手第一个坑，第 08 章详述。

> 上面这段 `hello-parallel` 为**示意**（未单独实跑）；其所依赖的 `parallel()` 真实行为，已由第 08 章的 `parallel-demo`（Run `wf_52957913-6d2`）验证。

---

## 4.7 新手最常见的四个错

第一次写 Workflow，几乎人人会撞上下面这几个坑。逐一拆开，给出「错」与「对」：

**① `meta` 不是纯字面量（含「在 `meta` 里算值」）。** `meta` 必须是「死」字面量，运行时在**静态解析阶段**就读它——任何变量引用、函数调用、展开、模板插值都会让它拒绝启动。新手尤其爱在 `meta` 里「顺手算一下」（拼接名字、按日期生成描述），这正是被坑的高发区：

```javascript
// ✗ 错：变量引用 + 模板插值 + 函数调用，全是「计算」
const NAME = 'x'
export const meta = { name: NAME, description: `run ${NAME} at ${Date.now()}` }
// ✓ 对：纯字面量，一个字一个字写死
export const meta = { name: 'x', description: 'run x' }
```

**② schema 漏了 `required` 字段。** 传 `schema` 时，别只写 `properties` 就完事——还要在 `required` 里列出**必须出现**的字段，否则模型可能合法地省略它，你下游 `r.sum + 1` 就会拿到 `undefined`：

```javascript
// ✗ 错：声明了 sum，却没把它列进 required —— 模型可以不返回它
schema: { type: 'object', properties: { sum: { type: 'number' } } }
// ✓ 对：required 钉死「这个字段一定要有」
schema: { type: 'object', properties: { sum: { type: 'number' } }, required: ['sum'] }
```

**③ 把它当同步调用，期待「调完就拿到结果」。** 这是最伤的一个认知错。Workflow **始终异步**：调用立即返回回执（`status` 只会是 `async_launched`/`remote_launched`，见 4.3），结果在**完成通知**里。任何「`const result = Workflow(...)` 然后立刻用 `result.sum`」的写法都是错的——那一刻 `result` 只是回执，不是产物。

**④ 语法错误。** 脚本语法检查不过，`WorkflowOutput` 会带一个 `error` 字段告诉你哪里错了，工作流**不会启动**。先在本地把脚本写对再交上去。

<div class="callout warn">

**别在脚本里用 `Date.now()` / `Math.random()` / 无参 `new Date()`**——它们会抛错（破坏可重放性，使续传缓存失效，见 4.5）。需要时间戳就用 `args` 传进来；需要随机性就用 agent 的下标 `index` 去变化提示词。

</div>

---

## 4.8 本章小结

- 用 `CLAUDE_CODE_WORKFLOWS=1` 开启功能；不确定就让 Claude 跑个最小工作流确认。
- 它是 **Workflow 脚本不是 Node 脚本**：`meta`/`phase`/`agent`/`log` 是运行时注入的全局，`node hello.js` 会三平台一致地报 `phase is not defined`，只能由 Claude 在 `CLAUDE_CODE_WORKFLOWS=1` 会话里跑。
- 启动 Workflow **立即返回回执**（`WorkflowOutput`：`taskId`/`runId`/`scriptPath`/`transcriptDir`；`status` 只有 `async_launched`/`remote_launched`），结果在**完成通知**里；用 `/workflows` 看实时进度。
- 真实基线：单 agent ≈ 5.5s / 2.6 万 token；`schema` 保证返回类型（`sum` 是数字 4，非字符串）。
- 迭代靠「脚本即文件」闭环：改盘上的 `.js` + `scriptPath` 重跑；加 `resumeFromRunId` 复用缓存。
- 新手四坑：① `meta` 里算值（必须纯字面量）；② schema 漏 `required`；③ 把它当同步调用、期待立刻拿到结果；④ 语法错误进 `error` 字段、不启动。

基础篇至此，你已经能跑通、读懂、迭代一个 Workflow。接下来三章（05/06/07）把经线（`meta`/`phase`）、纬线核心（`agent()`）、和结构化输出（`schema`）逐一讲透，第 08 章再把并发模型钉死。

> 继续阅读：[第 05 章 · meta 与 phase：经线](#/zh/p2-05)
