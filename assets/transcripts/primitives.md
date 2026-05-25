# 真实运行记录 · 核心原语 (Primitives)

> 本文件记录在真实 Claude Code 会话中运行 Workflow 的**原始输出**，作为全书示例的经验依据。
> 环境：Claude Code **v2.1.150**，`CLAUDE_CODE_WORKFLOWS=1`，`CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-4-7[1m]`，2026-05。
> 所有 `usage` / `result` 字段均来自 Workflow 完成时的 `<task-notification>`，未经修改。

---

## 1. hello-workflow — 单 agent + schema 冒烟测试

**Run ID**：`wf_dacbd480-d5d` ｜ **Task ID**：`wi7ye81mb`

脚本（节选核心）：

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

**真实返回值**：

```json
{"message":"The Claude Code Workflow runtime smoke test executed successfully as a workflow subagent.","sum":4,"runtimeConfirmed":true}
```

**真实用量**：`agent_count=1` ｜ `total_tokens=26338` ｜ `tool_uses=1` ｜ `duration_ms=5506`

**要点**：
- 启动时工具立即返回 `Task ID` + `Run ID` + 脚本落盘路径（异步，非阻塞）。
- `schema` 强制 agent 调用 StructuredOutput 工具，返回值**严格匹配** schema（`sum` 为数字 4 而非字符串）。
- 单个最简单 agent 往返约 5.5 秒、约 2.6 万 token。

---

## 2. parallel-demo — `parallel()` 屏障，3 agent 并发

**Run ID**：`wf_52957913-6d2` ｜ **Task ID**：`wjqmilq04`

```javascript
export const meta = {
  name: 'parallel-demo',
  description: 'parallel() barrier: 3 agents run concurrently, all results awaited together',
  phases: [{ title: 'Fan-out', detail: 'Three concurrent agents' }],
}

phase('Fan-out')
const dims = ['naming', 'error-handling', 'comments']
const results = await parallel(
  dims.map((d, i) => () =>
    agent(`Name one common ${d} code smell in exactly one sentence.`, {
      label: `smell:${d}`,
      schema: {
        type: 'object',
        properties: { smell: { type: 'string' } },
        required: ['smell'],
      },
    })
  )
)
log(`barrier released with ${results.filter(Boolean).length}/${dims.length} results`)
return results.filter(Boolean)
```

**真实返回值**：

```json
[
  {"smell":"A common naming code smell is the use of vague, non-descriptive identifiers like `data`, `temp`, `obj`, or single letters (e.g., `x`, `d`) that fail to convey the variable's purpose or meaning."},
  {"smell":"A common error-handling code smell is the \"empty catch block,\" where an exception is caught but silently swallowed without logging, rethrowing, or any handling, hiding failures and making bugs nearly impossible to diagnose."},
  {"smell":"Redundant comments that merely restate what the code already clearly expresses (e.g., `i++; // increment i`), adding noise and risking becoming stale when the code changes."}
]
```

**真实用量**：`agent_count=3` ｜ `total_tokens=78844` ｜ `tool_uses=3` ｜ `duration_ms=8395`

**要点**：
- 3 个 agent 并发执行，总耗时约 8.4 秒——**远小于** 3×5.5 秒，证明并发真实生效（非串行）。
- `parallel()` 是**屏障**：等全部 3 个 thunk 完成后才返回结果数组，顺序与传入顺序一致。
- token 用量约为单 agent 的 3 倍（78844 ≈ 3 × 26338），符合「每个 agent 独立上下文」的预期。

---

## 3. pipeline-demo — `pipeline()` 两阶段流水线（Find → Verify）

**Run ID**：`wf_bf086b98-6ec` ｜ **Task ID**：`w60ugs3lk`

```javascript
export const meta = {
  name: 'pipeline-demo',
  description: 'pipeline(): each item flows Find -> Verify independently, no barrier between stages',
  phases: [{ title: 'Find', detail: 'Produce a candidate' }, { title: 'Verify', detail: 'Adversarially check it' }],
}

const items = ['off-by-one', 'null-dereference', 'race-condition']
const out = await pipeline(
  items,
  (kind) =>
    agent(`Give a one-line code example of a ${kind} bug.`, {
      label: `find:${kind}`, phase: 'Find',
      schema: { type: 'object', properties: { example: { type: 'string' } }, required: ['example'] },
    }),
  (found, kind) =>
    agent(`Is this genuinely a ${kind} bug? Example: "${found.example}". Reply boolean + short reason.`, {
      label: `verify:${kind}`, phase: 'Verify',
      schema: { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' } }, required: ['real', 'reason'] },
    }).then((v) => ({ kind, ...found, ...v }))
)
log(`pipeline produced ${out.filter(Boolean).length} verified items`)
return out.filter(Boolean)
```

**真实返回值**（节选 reason，完整保留语义）：

```json
[
  {"kind":"off-by-one","example":"for i in range(len(arr)): print(arr[i+1])  # off-by-one: skips arr[0] and reads arr[len(arr)] (out of bounds)","real":true,"reason":"Genuine off-by-one bug... at i=2 it accesses arr[3]=arr[len(arr)], raising IndexError..."},
  {"kind":"null-dereference","example":"int *p = NULL; *p = 5;","real":true,"reason":"...Dereferencing a NULL pointer is undefined behavior and crashes (segfault)..."},
  {"kind":"race-condition","example":"balance = balance - amount  # two threads read the same balance...","real":true,"reason":"Genuine lost-update race... non-atomic read-modify-write on shared state... interleave across the GIL."}
]
```

**真实用量**：`agent_count=6` ｜ `total_tokens=158982` ｜ `tool_uses=8` ｜ `duration_ms=26743`

**要点**：
- 3 项 × 2 阶段 = **6 个 agent**，`agent_count=6` 印证。
- 第二阶段回调签名为 `(found, kind)`：`found` 是上一阶段返回值（`prevResult`），`kind` 是 `originalItem`——可在后续阶段引用原始输入，无需把它塞进上一阶段的返回值里穿线。
- `.then((v) => ({ kind, ...found, ...v }))`：在 stage 内合并上下文，得到带 `kind/example/real/reason` 的完整记录。
- 每项独立流过两阶段，阶段间**无屏障**：某项在 Verify 时，另一项可能仍在 Find。

---

## 用量速查（真实数据，同一会话）

| Workflow | agent_count | tool_uses | total_tokens | duration_ms |
|---|---|---|---|---|
| hello（单 agent + schema） | 1 | 1 | 26,338 | 5,506 |
| parallel（3 并发） | 3 | 3 | 78,844 | 8,395 |
| pipeline（3 项 × 2 阶段） | 6 | 8 | 158,982 | 26,743 |

> 经验法则：**token ≈ agent 数 × 每 agent 上下文**（约 2.5–3 万/agent，视提示与产物而定）；**墙钟时间**取决于关键路径而非 agent 总数——并发把 N 个 agent 的时间压到约「最慢的一个」。

