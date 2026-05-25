# Appendix A · Full API Reference

> This appendix is compiled against the type definitions `sdk-tools.d.ts` (the `WorkflowInput` / `WorkflowOutput` interfaces) in Claude Code's official distribution, and the Workflow tool definition, as the book's API quick reference. **All field semantics defer to this.**
>
> Applicable version: Claude Code v2.1.150 (`CLAUDE_CODE_WORKFLOWS=1`). The feature is experimental and fields may evolve across versions — your local type definitions are the final authority.

---

## A.1 The Workflow Tool: Input `WorkflowInput`

The input when calling the Workflow tool. The script has three sources (`script` / `name` / `scriptPath`), plus the `args` parameter. **`scriptPath` has the highest priority** (above `script` and `name`); the relative priority of `script` and `name` is not officially specified.

| Field | Type | Description |
|---|---|---|
| `script` | `string?` | A self-contained script. **Must** begin with the pure literal `export const meta = {…}`, followed by the script body. |
| `name` | `string?` | A predefined/named workflow (built-in or `.claude/workflows/`), resolved into a self-contained script. |
| `args` | `object?` | The global `args` exposed to the script. Used to parameterize a named workflow. |
| `scriptPath` | `string?` | An on-disk script path. Every call lands the script on disk and returns the path in the result; you can edit it with Write/Edit and re-run with this field, no need to resend the script. **Highest priority.** |
| `resumeFromRunId` | `string?` | Resume from a run's checkpoint. Unchanged `agent()` calls return cached results; **same session only.** Stop the previous run (TaskStop) before resuming. |

## A.2 The Workflow Tool: Output `WorkflowOutput`

The Workflow tool is **always async**, returning a receipt immediately (not the workflow result).

| Field | Type | Description |
|---|---|---|
| `status` | `"async_launched" \| "remote_launched"` | **Only these two values.** |
| `taskId` | `string` | The background task handle. |
| `runId` | `string?` | The local run identifier (like `wf_…`), used by `resumeFromRunId`; `remote_launched` has none (use the CCR session URL as the resume handle). |
| `summary` | `string?` | A summary. |
| `transcriptDir` | `string?` | The subagent execution-record directory. |
| `scriptPath` | `string?` | The script path landed this run, which can be edited with Write/Edit and re-run as `scriptPath`. |
| `sessionUrl` | `string?` | The CCR session URL when `remote_launched`. |
| `warning` | `string?` | A non-blocking notice (e.g., local git state diverges from the remote branch to be cloned). |
| `error` | `string?` | Set when the syntax check fails. |

> The workflow's **actual result** is delivered via the `<task-notification>` on completion, containing the return value and usage statistics (`agent_count`/`tool_uses`/`total_tokens`/`duration_ms`).

---

## A.3 Script Structure

```javascript
export const meta = { /* pure literal, see A.4 */ }
// ↑ must be the first line; below is the script body (async context, await directly)
phase('...')
const x = await agent('...', { /* opts */ })
const ys = await parallel([ () => agent('...'), () => agent('...') ])
const zs = await pipeline(items, stage1, stage2)
log('...')
return result
```

- The script body runs in an `async` context; `await` directly.
- Standard JS built-ins (`JSON`/`Math`/`Array`/…) are available.
- **No** file system / Node API access.
- **`Date.now()` / `Math.random()` / arg-less `new Date()` are forbidden** — they throw (breaking the replayability resume needs).

---

## A.4 `meta` (exported constant, pure literal)

```javascript
export const meta = {
  name: 'review-changes',                 // required
  description: 'Review changed files',    // required, shown in the permission confirmation dialog
  whenToUse: 'When a PR touches many files', // optional, shown in the workflow list
  phases: [                               // optional, each item a progress group
    { title: 'Review' },
    { title: 'Verify', model: 'haiku' },  // mark when a phase uses a specific model
  ],
}
```

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Workflow name. |
| `description` | Yes | One-line description, shown in the permission dialog. |
| `whenToUse` | No | Use case, shown in the workflow list. |
| `phases` | No | `{ title, detail?, model? }[]`; `title` matches `phase()`/`opts.phase` by exact string. |

**Constraint**: `meta` must be a pure literal — no variables, function calls, spread operators, or template interpolation (the runtime statically reads it before executing the script).

---

## A.5 `agent(prompt, opts?) → Promise<any>`

Dispatch a subagent.

```javascript
await agent(prompt, {
  label,       // string?  progress display label, auto-numbered by default
  phase,       // string?  explicitly group into a progress group (always use inside pipeline/parallel)
  schema,      // object?  JSON Schema, force structured output
  model,       // string?  override the model (omit = inherit the main loop model; simple tasks can use 'haiku')
  isolation,   // 'worktree'?  run in an independent git worktree (expensive; use to prevent collisions when editing files in parallel)
  agentType,   // string?  custom subagent type (e.g., 'Explore' / 'code-reviewer')
})
```

**Return semantics**:

- No `schema` → returns the subagent's final text (`string`).
- Has `schema` → forces the subagent to call the `StructuredOutput` tool, validates at the tool-call layer, returns a **validated object**; retries the model if it doesn't match.
- User skips the agent midway → returns `null` (filter with `.filter(Boolean)`).

**Option details**:

| Option | Description |
|---|---|
| `label` | Overrides the display label in `/workflows`; a descriptive label aids search and observation. |
| `phase` | Explicit grouping; matches `meta.phases.title` exactly. **Use it inside pipeline/parallel** to avoid racing the global `phase()`. |
| `schema` | JSON Schema; validation is at the tool-call layer, so the model auto-retries until conforming. |
| `model` | Overrides this agent's model; omitted, inherits the main loop model (recommended, unless the user specifies one or the task is simple enough for `'haiku'`). |
| `isolation: 'worktree'` | Runs in a fresh git worktree; **expensive** (~200–500ms startup + disk/agent), use only when parallel agents editing files would collide; auto-cleaned if no changes; the result returns the path and branch. |
| `agentType` | Use a custom subagent type instead of the default (resolved from the same registry as the Agent tool); combinable with `schema` (the custom agent's system prompt gets the StructuredOutput instruction appended). |

---

## A.6 `pipeline(items, stage1, stage2, …) → Promise<any[]>`

Each item flows **independently** through all stages, with **no barrier between stages.** Wall clock ≈ the slowest single chain.

- Each stage callback receives `(prevResult, originalItem, index)`.
- First stage: `prevResult === item`.
- A stage throwing → that item becomes `null` and skips the remaining stages.
- **Use `pipeline()` by default for multi-stage.**

```javascript
const out = await pipeline(items,
  (item, _orig, i) => agent(`stage1 for ${item}`, { phase: 'S1', schema: A }),
  (r, item, i)     => agent(`stage2 using ${r.x} (orig ${item})`, { phase: 'S2', schema: B }),
)
```

## A.7 `parallel(thunks) → Promise<any[]>`

Run a set of **thunks** (`() => Promise`) concurrently, with a **barrier**: wait for all to complete. Result order = input order.

- An async reject / inner `agent()` error → that position is `null`; a synchronous `throw` in the thunk body rejects the whole call (`.filter(Boolean)` before use).
- Use it only when you genuinely need all results together.

```javascript
const results = (await parallel(items.map(it => () => agent(prompt(it), { schema: S })))).filter(Boolean)
```

<div class="callout warn">

What you pass to `parallel()` must be an **array of functions** (`() => agent(...)`), not an array of Promises (`agent(...)`). The latter executes immediately at array construction, so it doesn't conform to the `parallel(thunks)` API and loses its async-failure gathering semantics (async reject / agent error → `null`). (The concurrency limit is per-workflow, not specific to `parallel()`.)

</div>

## A.8 Other Globals

| Global | Signature | Description |
|---|---|---|
| `phase(title)` | `(string) => void` | Open a new phase; subsequent `agent()` groups under it. |
| `log(message)` | `(string) => void` | Output a line of progress narration to the user (above the progress tree). |
| `args` | `any` | The value of the Workflow input `args` (`undefined` if not passed). |
| `budget` | see below | The token budget object for this turn. |
| `workflow(nameOrRef, args?)` | `(string\|{scriptPath}, any?) => Promise<any>` | Inline-run another workflow; shares the concurrency limit / agent count / abort signal / token budget; **nesting one level only.** |

### `budget`

```javascript
budget.total        // number | null: this turn's token target; null = not set
budget.spent()      // number: output tokens spent this turn (pool shared by main loop + all workflows)
budget.remaining()  // number: max(0, total - spent()); Infinity when not set
```

Hard cap: calling `agent()` after `spent()` reaches `total` throws. Always guard dynamic loops with `budget.total &&`.

---

## A.9 Concurrency and Scale

| Limit | Value |
|---|---|
| Agents running at once per workflow | `min(16, CPU cores − 2)`, the rest queue |
| Total agent cap per workflow | **1000** (runaway-loop fallback) |
| `workflow()` nesting depth | **1 level** (calling `workflow()` again inside a sub-workflow throws) |

---

## A.10 Triggering and Gating

- **Gating**: the environment variable `CLAUDE_CODE_WORKFLOWS=1`.
- **Triggering**: ① a message containing the `ultrawork` keyword; ② calling the Workflow tool directly; ③ a named workflow / a skill or slash command that triggers it.
- **Live progress**: the slash command `/workflows`.

---

## A.11 Minimal Skeleton Template

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

> If in doubt about a field's semantics, the `WorkflowInput` / `WorkflowOutput` in your local `@anthropic-ai/claude-code/sdk-tools.d.ts` is the final authority.
