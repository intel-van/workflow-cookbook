# 真实运行记录 · 进阶机制（续传 / 嵌套）

> 这些运行验证 Workflow 的进阶机制本身的真实行为，作为第四部进阶章的经验依据。
> 环境：Claude Code v2.1.150，`CLAUDE_CODE_WORKFLOWS=1`，2026-05。

---

## 1. 断点续传缓存命中（resumeFromRunId）

**做法**：对 §primitives 里跑过的 `hello-workflow`（Run ID `wf_dacbd480-d5d`），用**未改动的脚本** + `resumeFromRunId` 重新调用：

```javascript
Workflow({
  scriptPath: '.../hello-workflow-wf_dacbd480-d5d.js',
  resumeFromRunId: 'wf_dacbd480-d5d',
})
```

**两次运行的真实用量对比**（同一 Run ID）：

| 运行 | agent_count | tool_uses | total_tokens | duration_ms |
|---|---|---|---|---|
| 首次（真实执行） | 1 | 1 | **26,338** | **5,506** |
| 续传（缓存命中） | 0 | **0** | **0** | **8** |

**返回值完全相同**：`{"message":"...","sum":4,"runtimeConfirmed":true}`。

**结论（实证）**：未改动的 `agent()` 调用在续传时**零 token、零工具调用、8 毫秒**返回——它直接复用了缓存结果，**没有重新派发 subagent**。这就是「同样的脚本 + 同样的 args → 100% 缓存命中」的字面证据，也是脚本必须可重放（禁用 `Date.now()`/`Math.random()`）的根本原因。

> Task ID `w7pxch4w6`，Run ID 沿用 `wf_dacbd480-d5d`。

---

## 2. 嵌套工作流（workflow() 内联子流程）

**做法**：父工作流用 `workflow({ scriptPath })` 内联调用 §primitives 的 hello 子流程：

```javascript
export const meta = {
  name: 'nested-parent',
  description: 'Parent workflow calls a child workflow inline via workflow({scriptPath})',
  phases: [{ title: 'Delegate', detail: 'Run the hello child workflow as a sub-step' }],
}
phase('Delegate')
const child = await workflow({ scriptPath: '.../hello-workflow-wf_dacbd480-d5d.js' })
log(`child workflow returned: ${JSON.stringify(child)}`)
return { nested: true, childResult: child }
```

**真实返回值**（Run ID `wf_85e22b38-126`，Task ID `wwxi71uvf`）：

```json
{"nested":true,"childResult":{"message":"...executed successfully as a workflow subagent.","sum":4,"runtimeConfirmed":true}}
```

**真实用量**：`agent_count=1` ｜ `tool_uses=1` ｜ `total_tokens=26338` ｜ `duration_ms=6050`

**结论（实证）**：
- `workflow({scriptPath})` 确实**内联运行了子工作流**，并把子流程的返回值原样作为 `childResult` 交回父流程。
- 子流程的那 1 个 agent **计入了父流程的** `agent_count=1` / `total_tokens=26338`——印证官方说明「子流程的 agent 计入本次运行、其 token 计入 `budget.spent()`、共享并发上限」。
- 本次是**全新嵌套调用**（非续传），故子 agent 真实执行（26338 token），与上一节续传的「0 token」形成对照。

> 注意：嵌套**仅一层**——子工作流内再调 `workflow()` 会抛错。

---
