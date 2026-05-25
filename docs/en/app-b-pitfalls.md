# Appendix B · Pitfalls & Troubleshooting

> This appendix turns the most-commonly-stepped-in potholes of writing Workflows into a quick-to-look-up, accurate reference. Each entry is organized as **symptom → cause → fix**: first describe what you'll see and when it happens, then make clear the underlying why, and finally give a directly-copyable fix.
>
> The API basis for all claims is in [Appendix A](#/en/app-a); the behavioral basis comes from the real runs listed in [Appendix E](#/en/app-e). Applicable version: Claude Code v2.1.150 (`CLAUDE_CODE_WORKFLOWS=1`).

---

## B.1 Quick Master Table

Scan it first. Each row links to the detailed section below.

| # | Symptom (what you see) | Root cause (one line) | Quick fix |
|---|---|---|---|
| 1 | The tool returns `error` directly, the workflow never ran | `meta` isn't a pure literal / the script's first line isn't `export const meta` | [B.2](#b2-meta-rejected-for-not-being-a-pure-literal) |
| 2 | Returns an `error` field indicating a syntax/parse failure | The script body has a syntax error, caught by the pre-launch static check | [B.3](#b3-a-syntax-error-lands-in-the-error-field) |
| 3 | Concurrency "doesn't take effect," time ≈ serial total, throttling/error-gathering fail | Passed `parallel()` an array of Promises rather than functions | [B.4](#b4-parallel-passed-promises-instead-of-thunks) |
| 4 | The runtime throws, indicating a forbidden API | The script used `Date.now()` / `Math.random()` / arg-less `new Date()` | [B.5](#b5-datenow-mathrandom-throw) |
| 5 | The workflow keeps dispatching agents, tokens spike until hitting the cap | A dynamic loop has no `budget.total &&` guard | [B.6](#b6-an-infinite-loop-without-a-budget-guard) |
| 6 | On resume, a step that should be cached re-executed (cost tokens) | The script was changed / cross-session / didn't stop the previous run first | [B.7](#b7-resume-didnt-hit-the-cache) |
| 7 | The runtime throws, indicating the nesting depth is exceeded | A sub-workflow called `workflow()` again (more than one level) | [B.8](#b8-nesting-more-than-one-level-throws) |
| 8 | An agent retries repeatedly, slow to return, or unusually long | The `schema` is over-strict, hard for the model to satisfy at once | [B.9](#b9-an-over-strict-schema-causes-repeated-retries) |
| 9 | An external model/CLI "ran but produced no file," thought it failed | Mistakenly assuming `ctx_execute`/subprocess writes land on disk | [B.10](#b10-the-misconception-that-sandbox-writes-land-on-disk) |
| 10 | `parallel`/`pipeline` results contain `null`, and the subsequent `.map` errors | Didn't `.filter(Boolean)` the results | [B.11](#b11-unfiltered-null-in-the-results) |
| 11 | Agents in the progress tree don't group into the expected phase, or phase labels are scrambled | Relying on the global `phase()` inside `parallel`/`pipeline` | [B.12](#b12-the-phase-race-inside-a-concurrency-block) |
| 12 | `args` is `undefined` in the script | Didn't pass `args` when calling Workflow, or the field name is mistyped | [B.13](#b13-args-not-passed-or-field-misplaced) |
| 13 | Wanted to read the return value but got `taskId`, thought the workflow was synchronous | The Workflow tool is **always async**, the receipt ≠ the result | [B.14](#b14-mistaking-the-async-receipt-for-the-result) |
| 14 | An item in `pipeline` "vanishes" midway, the final count drops | A stage throwing makes that item `null` and skips the rest | [B.15](#b15-a-single-pipeline-item-silently-drops-out) |
| 15 | Wanted the file system/`fetch`/`require`, the runtime errors or it's undefined | The script body has no file system / Node API | [B.16](#b16-wanting-to-use-node-apis-in-the-script-body) |
| 16 | The workflow fails for no clear reason, `0 tokens` instant bailout, agents barely ran | A **synchronous throw in the body** of a `parallel()` thunk (≠ async reject) | [B.17](#b17-a-synchronous-throw-in-a-parallel-thunk-body-crashes) |

---

## B.2 `meta` Rejected for Not Being a Pure Literal

<div class="callout warn">

**Symptom**: calling the Workflow tool immediately returns a `WorkflowOutput` with `error`, the workflow dispatches not a single agent. Common when you "casually" splice a version number, timestamp, or some variable into `meta`.

</div>

**Cause**: the runtime statically reads `meta` **before executing the script** (it needs `name`/`description` to fill the permission confirmation dialog). This step doesn't run your code, only literal evaluation. So `meta` must be a **pure literal** — no variable references, function calls, spread operators, or template interpolation.

```javascript
// ✗ All will be rejected
export const meta = {
  name: `review-${args.target}`,        // template interpolation
  description: buildDesc(),              // function call
  phases: [...basePhases, { title:'X' }],// spread
  model: DEFAULT_MODEL,                  // variable reference
}
```

**Fix**: move dynamic content into the script body — `meta` holds only static text, and at runtime express mutable info with `log()` / `phase()`.

```javascript
// ✓ meta is a pure literal; dynamic info goes into the script body
export const meta = {
  name: 'review',
  description: 'Review the target files for issues',
  phases: [{ title: 'Review' }],
}

phase('Review')
log(`reviewing target: ${args.target}`)   // dynamic info goes here
```

> Same-source constraint: the script's **first line must be** `export const meta = {…}`, with no other statement before it.

---

## B.3 A Syntax Error Lands in the `error` Field

**Symptom**: `WorkflowOutput.error` is set, its content pointing to a parse/syntax issue; the workflow didn't launch.

**Cause**: Workflow does a syntax check on the script before dispatching any subagent. The check fails → it writes the error into the `error` field and returns immediately, **consuming no agents/tokens.** This is a good thing: it keeps "mis-written scripts" out before spending money.

**Fix**:

1. Read the `error` field to locate the line/cause, fix it, and resend.
2. For complex scripts, land them as a `.js` file first and call with `scriptPath` — so you can do basic syntax checking with an editor/local tools before handing it to Workflow.
3. Note the script body is an `async` context, you can `await` directly, but **don't** write illegal structures at the top level besides a bare `return`.

<div class="callout tip">

`error` (syntax-check failure) and a runtime throw are two different things: the former returns synchronously before launch; the latter happens during execution, reflected via the completion notification, and in some scenarios is turned into `null` by `parallel`/`pipeline` (see [B.11](#b11-unfiltered-null-in-the-results), [B.15](#b15-a-single-pipeline-item-silently-drops-out)).

</div>

---

## B.4 `parallel()` Passed Promises Instead of thunks

<div class="callout warn">

**Symptom**: several agents that should run concurrently behave serially — the total time approaches the sum of the agents rather than "the slowest one"; the concurrency-limit throttling and async-failure gathering (async reject / agent error becoming `null`) also don't work.

</div>

**Cause**: `parallel()` takes an **array of functions** (`Array<() => Promise>`, i.e., thunks). If you write `parallel([ agent(...), agent(...) ])`, then `agent(...)` **is called and starts executing immediately at the moment the array is constructed** — `parallel` receives Promises already running, so the call doesn't conform to the `parallel(thunks)` API and loses its error-gathering semantics (no way to converge a single reject into `null`). (Note: the concurrency limit is per-workflow regardless, not something `parallel()` itself toggles.)

```javascript
// ✗ Executes immediately; doesn't conform to parallel(thunks), loses async-failure gathering (async reject → null)
const r = await parallel([
  agent('task A', { schema: S }),
  agent('task B', { schema: S }),
])

// ✓ Pass thunks, let parallel control scheduling
const r = await parallel([
  () => agent('task A', { schema: S }),
  () => agent('task B', { schema: S }),
])
```

**Fix**: always wrap with `() => agent(...)`. Same when generating with `.map`:

```javascript
const r = await parallel(items.map(it => () => agent(prompt(it), { schema: S })))
```

> Real confirmation: `parallel-demo` (Run `wf_52957913-6d2`) measured 3 thunks at 8.4s ≪ 3×5.5s, concurrency genuinely in effect (data in the [primitives run record](#/en/p2-08)). This is exactly what the thunk form buys.

---

## B.5 `Date.now()` / `Math.random()` Throw

**Symptom**: the script throws at runtime, pointing to `Date.now()`, `Math.random()`, or arg-less `new Date()`.

**Cause**: these three break **replayability.** Resume (`resumeFromRunId`)'s premise is "the same script + the same input → the same execution path," so the runtime can judge which `agent()` calls are unchanged and can directly reuse the cache. Once the script has a nondeterministic source, replay can't be aligned, so the runtime **forbids** them outright.

**Fix**:

| You want | Use instead |
|---|---|
| A timestamp (naming/stamping) | Pass it in from outside via `args`: `args.runStamp`; or stamp it via the main loop after the workflow returns |
| Randomness/spreading | Vary the prompt using the agent's **index** (e.g., the `i` in `parallel(items.map((it,i)=>...))`), not true randomness |
| A unique ID | Concatenate from stable sources: item content, index, a seed passed in via `args` |

```javascript
// ✗ Throws at runtime
const ts = Date.now()

// ✓ The timestamp passed in from outside (caller: Workflow({ script, args:{ runStamp: '<synchronously stamped>' } }))
const ts = args.runStamp
```

> Standard JS built-ins (`JSON`/`Math`'s other methods/`Array`…) are still available — only these three nondeterministic sources are forbidden.

---

## B.6 An Infinite Loop Without a `budget` Guard

<div class="callout warn">

**Symptom**: the workflow won't stop, dispatching agents round after round, `budget.spent()` rising all the way, finally hitting the "1000-agent total per workflow" fallback cap, or hitting `budget.total` and throwing when the user set a target.

</div>

**Cause**: a dynamic loop ("loop-until-dry," "retry until pass," etc.), if it only checks the business condition and not the budget, iterates infinitely when the model repeatedly fails to give a convergent result. `budget` is a **hard cap**: calling `agent()` after `spent()` reaches `total` throws — but you shouldn't let it be the fallback; you should guard proactively.

**Fix**: write both the business criterion and the budget criterion in the loop condition. Note `budget.total` may be `null` (the user set no target, then `remaining()` is `Infinity`), so use a `budget.total &&` short-circuit guard, to avoid exiting early when "no target is set."

```javascript
let round = 0
const MAX_ROUNDS = 5
let done = false

while (!done && round < MAX_ROUNDS) {
  // Budget guard: only when the user set a target (total non-null) and there's less than one round left, stop early
  if (budget.total && budget.remaining() < 30_000) {
    log(`budget guard: ${budget.remaining()} left, stopping early`)
    break
  }
  const r = await agent(`round ${round} ...`, { schema: S })
  done = r.converged
  round++
}
```

> Dual guardrails: ① your own `MAX_ROUNDS` + budget guard (proactive, graceful exit); ② the runtime's 1000-agent fallback (passive, anti-runaway). Production scripts should close out by ①, not touch ②. See [Chapter 21 · Dynamic Budget & Scaling](#/en/p4-21).

---

## B.7 Resume Didn't Hit the Cache

**Symptom**: resuming with `resumeFromRunId`, you expected the earlier-run steps to return instantly (zero tokens), but they **re-executed**, costing time and tokens.

**Cause**: the conditions for a cache hit are strict; any one unmet re-runs the corresponding `agent()`:

| Condition | Description |
|---|---|
| The script is **unchanged letter-for-letter** | Changing the script (even one line of comment) re-executes the calls after it |
| The **same session** | Resume is valid only in the same session; cross-session the cache is unavailable |
| **Stop the previous run** first | Before resuming, `TaskStop` the previous Task, then resend with `resumeFromRunId` |
| The script is **replayable** | Containing `Date.now()` and other nondeterministic sources breaks alignment (see [B.5](#b5-datenow-mathrandom-throw)) |

**Fix**:

- To **reuse** earlier results (changing only the latter part): keep the earlier script letter-for-letter unchanged, with changes only after the position you want to re-run.
- To **force a re-run** of some segment: deliberately change it (the cache is judged by "whether the call changed").

> Real confirmation: an unchanged `hello-workflow` resumed with `resumeFromRunId` measured `total_tokens=0`, `tool_uses=0`, `duration_ms=8`, with a return value identical to the first (Run `wf_dacbd480-d5d` reused, Task `w7pxch4w6`). This is what a "hit" literally looks like — if your resume isn't this, check the table above item by item. See [Chapter 22 · Resume & Caching](#/en/p4-22).

---

## B.8 Nesting More Than One Level Throws

**Symptom**: inside a sub-workflow inline-called by `workflow()`, you call `workflow()` again, and the runtime throws.

**Cause**: nesting **allows one level only.** Parent → child is fine; child → grandchild throws. This is a deliberate guardrail to prevent runaway recursion (the sub-flow shares the parent's concurrency limit, agent count, abort signal, and token budget; infinite nesting would make these shared resources lose their bounds).

**Fix**:

- **Flatten** the "grandchild-level" logic into the sub-workflow itself (write `agent()`/`parallel()`/`pipeline()` directly, rather than another `workflow()`).
- If multi-level orchestration is genuinely needed, have the **main loop** chain multiple one-level nestings, rather than deep recursion inside the script.

```javascript
// ✗ Nesting again inside a sub-workflow → throws
// child.js: const x = await workflow({ scriptPath: './grandchild.js' })

// ✓ Flatten the logic into the sub-workflow
// child.js:
phase('Work')
const x = await agent('do the grandchild logic directly', { schema: S })
```

> Real confirmation: a parent workflow inline-ran a hello sub-flow via `workflow({scriptPath})` successfully, with the child agent counting toward the parent flow's `agent_count=1`/`total_tokens=26338` (Run `wf_85e22b38-126`) — this is **one** level, normal. See [Chapter 20 · Nested Workflows](#/en/p4-20).

---

## B.9 An Over-Strict `schema` Causes Repeated Retries

**Symptom**: some agent with a `schema` is slow to return, or noticeably long; on the progress view it looks "stuck."

**Cause**: a `schema`'s validation happens at the **tool-call layer** — the model must call the `StructuredOutput` tool and output a strict match to the schema, or **retry.** If the schema is over-strict (e.g., an incomplete `enum`, a `required` field the model can't reliably produce, a too-narrow numeric `pattern`/range), the model may need many tries to happen to hit it, showing as slowdown or near-giving-up.

**Fix**: make the schema "constrain the product's shape, but leave the model reasonable room to express."

- `enum` should cover all legal values the model might give; if unsure, run a round with `string` first to see the real output, then narrow.
- `required` should list only **genuinely necessary** fields; don't force optional info.
- Split complex nested structures into two stages (produce text first, then structure), which is steadier than one shot.
- A validation failure retries, so "occasional retries" are normal; only **persistent** retries indicate the schema needs loosening.

```javascript
// ✗ Over-strict: enum missing items + forcing the model to estimate a field it can't give accurately
schema: { type:'object', properties:{
  severity:{ type:'string', enum:['critical','high'] },   // missing medium/low
  exactLineNumber:{ type:'integer' },                      // the model often can't give accurately
}, required:['severity','exactLineNumber'] }

// ✓ Cover the full enum; force only necessary fields
schema: { type:'object', properties:{
  severity:{ type:'string', enum:['critical','high','medium','low'] },
  location:{ type:'string' },        // use a descriptive string, don't force an exact line number
}, required:['severity'] }
```

> Counter-reference: the `FINDINGS` schema used by `frontend-review` set `severity` as a four-value `enum` and the rest as `string`, and 4 agents smoothly produced 26 findings without stalling (Run `wf_4c5caabb-b73`). See [Chapter 7 · Structured Output & Schema](#/en/p2-07).

---

## B.10 The Misconception That Sandbox Writes Land on Disk

<div class="callout warn">

**Symptom**: you have an agent (or use `ctx_execute` / a Bash subprocess in analysis) "generate a file / write a result," then can't find it on disk, misjudging it as "it failed" or "the external model produced zero output."

</div>

**Cause**: **only the native Write/Edit tools land file writes on disk.** `ctx_execute` and Bash subprocesses run in a subprocess, discarded after use; their writes to the file system **don't persist** to the host. Likewise, the script body itself **has no file-system API** — its "product" is `agent()`'s **return value** (text or a structured object), not a disk file.

**Fix**:

- To land a file on disk: have the workflow **return content**, and let the main loop write it with Write/Edit; or explicitly ask the agent in its prompt to **call the Write tool** (agents have real tool permissions).
- Don't treat "the external model ran in the sandbox but there's no file on disk" as failure — first confirm whether its product was handed back as a **return value.**
- Using `ctx_execute` for analysis-type computation is fine (as long as you only `console.log` the conclusion), but don't expect the files it writes to still be there.

```javascript
// The workflow hands content back as a return value, the main loop is responsible for landing it on disk
phase('Generate')
const doc = await agent('Write the migration guide as markdown. Return the full text.',
  { schema:{ type:'object', properties:{ markdown:{type:'string'} }, required:['markdown'] } })
return doc            // ← the main loop gets doc.markdown and lands it with Write
```

---

## B.11 Unfiltered `null` in the Results

**Symptom**: the array returned by `parallel()` / `pipeline()` contains `null`, and the immediately following `.map(r => r.field)` throws `Cannot read properties of null`.

**Cause**: both primitives use `null` to express "this item has no valid result":

- `parallel`: a thunk's **asynchronous failure** (a returned promise rejecting, or an inner `agent()` erroring) → that position is `null`, and the call itself doesn't reject. Note: a **synchronous `throw` in the thunk body does NOT become `null`** — it rejects the whole call and crashes the workflow (see [B.17](#b17-a-synchronous-throw-in-a-parallel-thunk-body-crashes)).
- `pipeline`: an item **throws** at some stage (synchronously or asynchronously) → that item becomes `null` and skips the rest.
- `agent`: the user **skips** the agent midway → returns `null`.

**Fix**: always `.filter(Boolean)` before consuming the results.

```javascript
const results = (await parallel(thunks)).filter(Boolean)   // ✓ filter out null first
const titles = results.map(r => r.title)                   // now safe
```

> When merging across stages inside a `pipeline`, also defend: if the previous stage may give `null`, the next stage's callback should check for null first (or ensure it only continues on the filtered set). See [Chapter 8 · parallel vs pipeline](#/en/p2-08).

---

## B.12 The `phase()` Race Inside a Concurrency Block

**Symptom**: after using `parallel`/`pipeline`, agents in the progress tree group into the wrong phase, or phase labels look like they're "fighting" over each other.

**Cause**: the global `phase()` is **stateful** — it switches the "current phase," and subsequent `agent()` groups into that phase. But in `parallel`/`pipeline`, multiple agents run **concurrently**, and if they all rely on that global current phase, they race each other (the order of calls is indeterminate), and grouping gets scrambled.

**Fix**: inside `parallel`/`pipeline`, **always use `opts.phase` for explicit grouping**, don't rely on the outer `phase()`. The `opts.phase` string must match `meta.phases[].title` exactly.

```javascript
// ✓ Each concurrent agent carries its own phase, not contending for global state
const reviews = await parallel(dims.map(d => () =>
  agent(d.prompt, { label:`review:${d.key}`, phase:'Review', schema:FINDINGS })))
```

> The real scripts of `frontend-review` and `judge-panel` both write `phase:'Review'`/`phase:'Judge'` on each inside `parallel`, for exactly this. See [Chapter 5 · meta & phase](#/en/p2-05).

---

## B.13 `args` Not Passed or Field Misplaced

**Symptom**: reading `args.foo` in the script gives `undefined`, and the logic all takes the empty branch.

**Cause**: `args` is the value of the Workflow input `args`; **not passing it** means `undefined`. Common when: forgetting `args` at call time, mistyping the field name, or confusing the level of `args` with `name`/`script`.

**Fix**:

```javascript
// Caller: args is a top-level field of WorkflowInput
// Workflow({ script: '...', args: { target: 'src/auth', maxRounds: 3 } })

// In the script: provide a default fallback first, don't assume it exists
const target = args?.target ?? 'src'
const maxRounds = args?.maxRounds ?? 5
```

> `args` is especially suited to parameterizing a **named workflow** (`name` + `args`), reusing the same logic across different inputs. See [Appendix A](#/en/app-a).

---

## B.14 Mistaking the Async Receipt for the Result

**Symptom**: you expect the Workflow tool to return the workflow's "final result," but get `{ status, taskId, runId, ... }`, so you mistakenly think it didn't run or try to read the return value directly.

**Cause**: the Workflow tool is **always async.** It immediately returns a **receipt** (`status` will only be `"async_launched"` or `"remote_launched"`), and the workflow runs in the background. The **actual return value and usage statistics** (`agent_count`/`tool_uses`/`total_tokens`/`duration_ms`) arrive via the `<task-notification>` on completion.

**Fix**:

- Keep the `taskId`/`runId`: the former for tracking/stopping (TaskStop), the latter for resume (`resumeFromRunId`).
- To watch live progress, use the slash command `/workflows`.
- To get the result, **wait for the notification** — don't look for result fields in the receipt.

> Real form: all 10 completion records / 9 unique Run IDs had receipts giving `taskId`+`runId` first, with all usage numbers coming from the completion notification (see [Appendix E](#/en/app-e)).

---

## B.15 A Single pipeline Item Silently Drops Out

**Symptom**: `pipeline(items, ...)` passed N items, but finally `out.filter(Boolean).length < N`, some items "gone," yet no obvious error shown.

**Cause**: `pipeline`'s fault-tolerance granularity is **per item** — an item throwing at any stage immediately makes **that item** `null` and skips **all its remaining stages**, but other items are unaffected and keep flowing. This is a virtue (one bad item doesn't drag down the whole batch), but if you only look at the final count you'll think "data lost."

**Fix**:

- Accept this is designed behavior: understand `null` as "this item failed at some stage and was safely skipped."
- To know **why** it dropped: carry status in a structured return inside the stage, or have that stage's `agent` schema carry an `ok`/`reason` field, and tally afterward.
- If dropping items isn't allowed on the critical path, `try` within each stage and return a "degraded result" rather than throwing, keeping that item flowing onward.

```javascript
const out = await pipeline(items,
  (it) => agent(`stage1 ${it}`, { phase:'S1', schema:A }),
  (r, it) => agent(`stage2 ${it}`, { phase:'S2', schema:B }),
)
const ok = out.filter(Boolean)
log(`pipeline kept ${ok.length}/${items.length} items`)   // explicitly record dropouts
```

> Real confirmation: `pipeline-demo` 3 items × 2 stages all survived, `agent_count=6`, returning 3 (Run `wf_bf086b98-6ec`) — no dropouts because no stage threw. See [Chapter 8 · parallel vs pipeline](#/en/p2-08).

---

## B.16 Wanting to Use Node APIs in the Script Body

**Symptom**: writing `require(...)`, `fs.readFile`, `fetch(...)`, `process.env` in the script, and the runtime reports undefined or throws.

**Cause**: the script body is a **restricted `async` sandbox**: standard JS built-ins (`JSON`/`Math`/`Array`/`Object`/`Promise`…) are available, but there's **no** file system, network, `require`, or Node-global capability. A workflow's "side effects" are all done through the subagents dispatched by `agent()` — they (not the script body) hold real tool permissions.

**Fix**:

| You want to | In the script body | Correct approach |
|---|---|---|
| Read a file | ✗ `fs.readFile` | Have the agent read: `agent('Read src/x.ts and summarize ...')` |
| Network/fetch | ✗ `fetch` | Have the agent fetch with its tools, or pass the data in via `args` beforehand |
| Write a file | ✗ `fs.writeFile` | The agent calls the Write tool, or return content for the main loop to land (see [B.10](#b10-the-misconception-that-sandbox-writes-land-on-disk)) |
| Import a third-party library | ✗ `require('lodash')` | Implement with standard JS built-ins, or hand the computation to an agent |
| Read environment variables | ✗ `process.env` | Pass the needed values in explicitly via `args` |

```javascript
// ✗ The script body has no Node API
const src = require('fs').readFileSync('src/auth.ts', 'utf8')

// ✓ Have the subagent read, the script body only orchestrates
const review = await agent('Read src/auth.ts and list security issues.',
  { schema: FINDINGS })
```

---

## B.17 A Synchronous Throw in a `parallel` Thunk Body Crashes

<div class="callout warn">

**Symptom**: a `parallel()` call that should be "best-effort" instead **fails the whole workflow for no clear reason** — the receipt/notification shows status `failed`, `total_tokens=0`, a `duration_ms` of only tens of milliseconds, and almost no agent actually ran (a "`0 tokens` instant bailout"). You assumed "a thunk that throws merely becomes `null`," yet the whole batch crashed together.

</div>

**Cause**: this is the **sibling pitfall** of [B.4](#b4-parallel-passed-promises-instead-of-thunks) — B.4 is "passing the wrong type (Promises instead of thunks)," while this one is "passing thunks correctly, but throwing **synchronously inside the thunk body.**" `parallel()` **calls** the thunks one by one: if a thunk body has a synchronous `throw` (a bare `throw`, a failed `JSON.parse`, an assertion, an index out-of-bounds), the exception propagates upward **before** `parallel()` has obtained the promise, so it has **no chance to collect that slot into `null`**, and the whole `parallel()` call **rejects**; without an outer `try/catch`, the **workflow fails.** Note: the tool's line "a thunk that throws resolves to null" holds only for a **returned promise's async reject**, not for a **synchronous throw.**

```javascript
// ✗ Synchronous throw in the thunk body → the whole parallel() rejects → workflow fails (0-token instant bailout)
await parallel([
  () => agent('ok-1'),
  () => { throw new Error('boom') },                 // sync throw, pierces parallel
  () => agent('ok-2'),
])

// ✓ Move the risky logic inside the awaited agent() call (only the async path is collected into null)
await parallel([
  () => agent('ok-1'),
  () => agent('do the risky thing'),                  // risk on the async path → an error becomes null
  () => agent('ok-2'),
])

// ✓ Or try/catch it yourself, degrading a synchronous failure into a filterable null
await parallel([
  () => agent('ok-1'),
  async () => { try { return riskySync() } catch { return null } },
  () => agent('ok-2'),
])
```

**Fix**:

- **Move the risky synchronous logic into the async path of `agent()`** — `parallel()` only does the "→ `null`" gathering for an async reject.
- If you must do a synchronous computation in the thunk body, **`try/catch` it yourself** and return `null` (or a degraded value); don't let it throw bare.
- Always `.filter(Boolean)` before consuming results (see [B.11](#b11-unfiltered-null-in-the-results)) — but remember: `.filter(Boolean)` only removes the `null` produced by an **async reject**; it **cannot stop a synchronous throw** (by then the workflow has already crashed and never reaches the filter).

> Real confirmation: a script of merely `parallel([ok, () => { throw ... }, ok])` measured workflow status **failed**, `agent_count=1`, `total_tokens=0`, `duration_ms=26` (Run `wf_ed5e87f3-435`). The difference between a synchronous throw and an async reject was confirmed from the other side in Run `wf_74ebe5ac-2db` (async reject → that slot `null`, the rest survive, workflow completes). For the full contrast and the mechanism, see [Chapter 8 · §8.8 Error Semantics](#/en/p2-08).

---

## B.18 Troubleshooting Mantra (Closing)

Distill the above potholes into three transferable judgments:

1. **Did the failure happen "before launch" or "during execution"?** Before launch → check the `error` field (`meta`/syntax, [B.2](#b2-meta-rejected-for-not-being-a-pure-literal)/[B.3](#b3-a-syntax-error-lands-in-the-error-field)), costs nothing; during execution → check the completion notification and `null` ([B.5](#b5-datenow-mathrandom-throw)/[B.11](#b11-unfiltered-null-in-the-results)/[B.15](#b15-a-single-pipeline-item-silently-drops-out)).
2. **Did you mistake the "sandbox" for the "host"?** The script body has no Node API, and `ctx_execute`/subprocess writes don't land on disk — side effects and file operations all go through agents' real tools ([B.10](#b10-the-misconception-that-sandbox-writes-land-on-disk)/[B.16](#b16-wanting-to-use-node-apis-in-the-script-body)).
3. **Are you at odds with "replayability/determinism"?** Forbid nondeterministic sources, and resume hits strictly by "the script unchanged letter-for-letter + same session" — what this set of constraints buys is a deterministic skeleton and zero-cost caching ([B.5](#b5-datenow-mathrandom-throw)/[B.7](#b7-resume-didnt-hit-the-cache)).

> Companion reading: the checkable positive checklist is in [Appendix C · Best Practices](#/en/app-c); for unclear terms see [Appendix D · Glossary](#/en/app-d); for field semantics see [Appendix A · Full API Reference](#/en/app-a).

> Continue reading: [Appendix C · Best Practices](#/en/app-c)
