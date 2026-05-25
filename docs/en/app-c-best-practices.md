# Appendix C · Best Practices

> This appendix is a **checkable checklist.** Each entry gives "what to do," "why," and "how to land it," with a link to the corresponding chapter. When designing/reviewing a Workflow, go through it top to bottom: the more you can check off, the more deterministic, economical, resume-able, and observable your script.
>
> The API basis for all claims is in [Appendix A](#/en/app-a); the behavioral basis is in [Appendix E](#/en/app-e)'s real runs. The companion reverse checklist (pitfalls and troubleshooting) is in [Appendix B](#/en/app-b).

---

## C.1 How to Use This Checklist

- **Before** writing the script: scan [C.2 Structure & Orchestration](#c2-structure-orchestration) and [C.3 schema & Products](#c3-schema-products), settle the skeleton.
- **While** writing the script: check against [C.4 Observability](#c4-observability-progress-logs-and-labels) and [C.5 Cost & Scale](#c5-cost-scale), checking off as you go.
- **Before** delivery: go through [C.6 Resilience & Verification](#c6-resilience-verification), [C.7 Iteration & Resume](#c7-iteration-resume), [C.8 Isolation & Nesting](#c8-isolation-nesting), confirm nothing's missed.
- Unsure about an entry → click the link back to the body chapter; unclear term → check [Appendix D](#/en/app-d).

> Legend: `[ ]` to be checked; the "**Why**/**How**" below is the basis for judgment. Hard constraints (not following them errors or wastes) are marked ⚠️.

---

## C.2 Structure & Orchestration

- [ ] **Use `pipeline()` by default for multi-stage; don't chain `parallel()`.** ⚠️
  - **Why**: `parallel` is a **barrier** — it waits for a batch to all complete before the next step. Writing multi-stage as "`parallel` then `parallel`" wastefully waits for the slowest one at every stage boundary. `pipeline` lets each item flow **independently** through all stages, with **no barrier** between stages, wall clock ≈ the slowest single chain rather than the sum of each stage's slowest.
  - **How**: see [Chapter 8 · parallel vs pipeline](#/en/p2-08). Use `parallel` only when "all results genuinely need to appear together" (e.g., fan-out then synthesize).

- [ ] **Pass `parallel()` only thunks (`() => agent(...)`), never Promises.** ⚠️
  - **Why**: passing `agent(...)` (a Promise) executes immediately at array construction, doesn't conform to the `parallel(thunks)` API so `parallel()` can't manage it as a thunk, and loses the "async reject / agent error → `null`" error-gathering semantics (the concurrency cap is throttled uniformly **per workflow** and isn't bypassed this way).
  - **How**: `parallel(items.map(it => () => agent(prompt(it), { schema })))`. See [Appendix B · B.4](#/en/app-b).

- [ ] **Write `meta` as a pure literal, with the first line being `export const meta = {…}`.** ⚠️
  - **Why**: the runtime statically reads `meta` before executing the script; containing variables/function calls/spreads/template interpolation gets rejected and the workflow doesn't launch.
  - **How**: put dynamic content in the script body, expressed with `log()`/`phase()`. See [Chapter 5 · meta & phase](#/en/p2-05).

- [ ] **Declare phases in `meta.phases` first, then reference them in the script with `phase()`/`opts.phase`.**
  - **Why**: declarative phases make the progress tree structure clear and predictable; `phase()`'s title matches `meta.phases[].title` by exact string.
  - **How**: see [Chapter 5](#/en/p2-05).

- [ ] **Inside `parallel`/`pipeline`, use `opts.phase` for explicit grouping, not the global `phase()`.** ⚠️
  - **Why**: the global `phase()` is stateful; concurrent agents race the "current phase," scrambling grouping.
  - **How**: each concurrent agent carries `phase:'Review'`. The real scripts `frontend-review`/`judge-panel` both do this. See [Appendix B · B.12](#/en/app-b).

- [ ] **The script body only orchestrates; side effects go to agents.** ⚠️
  - **Why**: the script body is a restricted `async` sandbox, with no file system/network/`require`/Node global. Reading/writing files and networking must be done by the subagents dispatched by `agent()` (which hold real tool permissions).
  - **How**: to read a file `agent('Read x and ...')`; for data pass it in via `args`. See [Appendix B · B.16](#/en/app-b).

---

## C.3 schema & Products

- [ ] **Constrain the shape of key products with `schema`.** ⚠️
  - **Why**: with a `schema`, validation happens at the **tool-call layer**, the model **auto-retries** until it matches, returning a **validated object** — downstream can directly use `.field`, no need to parse free text.
  - **How**: `agent(prompt, { schema: { type:'object', properties:{…}, required:[…] } })`. See [Chapter 7 · Structured Output & Schema](#/en/p2-07). Real confirmation: `hello`'s `sum` is strictly the number `4` (Run `wf_dacbd480-d5d`).

- [ ] **The schema constrains the shape but leaves the model room to express (don't over-strict).**
  - **Why**: a missing `enum` item, or forcing the model to give a field it can't produce accurately (like an exact line number), triggers **persistent retries**, slowing or stalling it.
  - **How**: `enum` covers all legal values; `required` lists only necessary fields; use a descriptive `string` for an exact location. If unsure, run a round with `string` first, then narrow. See [Appendix B · B.9](#/en/app-b).

- [ ] **Split complex structures into two stages (produce text first, then structure), don't do it in one shot.**
  - **Why**: a deeply nested schema is hard to satisfy at once; splitting into "generate → structure" is steadier.
  - **How**: use `pipeline` to split "draft" and "extract" into two stages.

- [ ] **When a cross-stage needs the original input, use the callback signature `(prevResult, originalItem, index)`; don't thread it through the previous stage's return value.**
  - **Why**: each stage of `pipeline` can grab `originalItem` directly, with no need to pollute the previous stage's product schema.
  - **How**: `(found, kind) => agent(\`verify ${kind}: ${found.example}\`)`. Real confirmation: `pipeline-demo`'s stage2 signature is `(found, kind)` (Run `wf_bf086b98-6ec`). See [Chapter 8](#/en/p2-08).

---

## C.4 Observability: Progress, Logs, and Labels

- [ ] **Give every agent a descriptive `label`.**
  - **Why**: `label` is the display name in the `/workflows` progress tree and the transcript; `review:a11y` locates and searches better than "agent #3."
  - **How**: `agent(prompt, { label: \`review:${d.key}\` })`. See [Chapter 6 · The agent() Reference](#/en/p2-06).

- [ ] **`log()` at milestones, writing out key counts/decisions.**
  - **Why**: `log()` outputs a narration line above the progress tree, the main clue for reviewing "what happened" (like "barrier released with 3/3 results," "pipeline kept N/M items").
  - **How**: phase switches, post-filter counts, and early-exit reasons all deserve a `log`. Real scripts commonly do this. See [Chapter 9 · Progress, Logs, Resume, Budget](#/en/p2-09).

- [ ] **Explicitly record "dropouts/downgrades."**
  - **Why**: `parallel`/`pipeline` use `null` to mark an item's failure; looking only at the final count misreads it as data loss.
  - **How**: `log(\`pipeline kept ${ok.length}/${items.length}\`)`. See [Appendix B · B.15](#/en/app-b).

- [ ] **Keep the `taskId`/`runId`.**
  - **Why**: `taskId` is for tracking/stopping (TaskStop), `runId` for resume (`resumeFromRunId`). The workflow is **always async**, the receipt ≠ the result.
  - **How**: wait for the completion notification for the result; watch live progress with `/workflows`. See [Appendix B · B.14](#/en/app-b).

---

## C.5 Cost & Scale

- [ ] **Estimate cost before dispatching agents: token ≈ agent count × per-agent context (about 25k–30k).**
  - **Why**: each agent is an independent context, cost approximately linearly additive. Real confirmation: parallel 3 agents ≈ 78,844 ≈ 3×26,338 (Run `wf_52957913-6d2`).
  - **How**: first compute "how many agents this design dispatches," then decide if it's worth it. The rule of thumb is in the [primitives run record](#/en/p2-08).

- [ ] **Wall clock follows the critical path, not the agent total.**
  - **Why**: concurrency compresses N agents' time to "the slowest one." Real confirmation: 3 concurrent 8.4s ≪ 3×5.5s.
  - **How**: concurrent what can be concurrent; use `pipeline` for multi-stage to overlap stages. See [Chapter 8](#/en/p2-08).

- [ ] **Use `model: 'haiku'` for simple/mechanical subtasks.**
  - **Why**: omitting `model` inherits the main loop model (usually a strong model); tasks like classification, extraction, formatting do fine with a light model, saving tokens and time.
  - **How**: `agent(prompt, { model: 'haiku' })`, or mark `model` on a phase in `meta.phases`. See [Chapter 6](#/en/p2-06), [Chapter 21 · Dynamic Budget & Scaling](#/en/p4-21).

- [ ] **Respect the concurrency limit; don't expect infinite parallelism.**
  - **Why**: a workflow runs `min(16, CPU cores−2)` agents at once, the excess queues; the agent total hard cap per workflow is **1000**.
  - **How**: process very large batches in batches/shards, rather than fanning out hundreds at once. See [Chapter 21](#/en/p4-21).

---

## C.6 Resilience & Verification

- [ ] **Add a round of adversarial verification (an independent agent "picks holes") to important output.**
  - **Why**: the first version almost always has blind spots; switching to another agent and explicitly asking it to "find errors" systematically exposes problems. Real confirmation: GCF had adversarial Critique catch **10 genuine defects** from a seemingly simple `slugify` (Run `wf_7472ceac-daa`).
  - **How**: Generate → Critique → Fix three stages. See [Chapter 12 · Generate-Critique-Fix](#/en/p3-12), [Chapter 17 · Adversarial Verification](#/en/p4-17).

- [ ] **When you need to reduce single-point bias, use independent judges + a rubric + vote-tallying.**
  - **Why**: multiple non-communicating judges converge stably on candidates with "clearly differing quality"; a rubric (a schema solidifying dimensions into numbers) + tallying is more reliable than "a single agent's gut call." Real confirmation: judge-panel's 3 judges independently converged 3:0 (Run `wf_f5b69668-b18`).
  - **How**: dispatch multiple judges with `parallel` to each score, then tally `votesA/votesB`. See [Chapter 14 · Judge Panel](#/en/p3-14).

- [ ] **Always `.filter(Boolean)` `parallel`/`pipeline` results before consuming.** ⚠️
  - **Why**: a thrown/skipped position is `null`; not filtering makes the subsequent `.map(r => r.x)` throw.
  - **How**: `(await parallel(thunks)).filter(Boolean)`. See [Appendix B · B.11](#/en/app-b).

- [ ] **When the critical path can't drop items, `try` within the stage and return a degraded result rather than throwing.**
  - **Why**: a stage throwing in `pipeline` makes that item drop out directly, skipping the rest.
  - **How**: after catch, return `{ ok:false, reason }` to keep that item flowing onward. See [Appendix B · B.15](#/en/app-b).

- [ ] **"Loop-until-dry/retry-until-pass" needs a convergence condition + a round cap.**
  - **Why**: relying purely on a business criterion may never converge.
  - **How**: `while (!done && round < MAX_ROUNDS)`. See [Chapter 18 · Loop-Until-Dry & Completeness](#/en/p4-18).

---

## C.7 Iteration & Resume

- [ ] **Land complex scripts as `.js`, call with `scriptPath`.**
  - **Why**: the script is a file, checkable with an editor/tools; after Write/Edit, re-run with the same `scriptPath`, no need to resend the whole script.
  - **How**: `Workflow({ scriptPath: '.../my-wf.js' })`. `scriptPath` has the highest priority. See [Appendix A · A.1](#/en/app-a).

- [ ] **To reuse already-run results, resume with `resumeFromRunId`, and keep the earlier script letter-for-letter unchanged.**
  - **Why**: an unchanged `agent()` on resume returns the cached result in **zero tokens, zero tools, about 8ms.** Real confirmation: hello resume `total_tokens=0`/`duration_ms=8` (Run `wf_dacbd480-d5d` reused).
  - **How**: changes only after the position you want to re-run; resume is **same session only**, and you should `TaskStop` the previous run first. See [Chapter 22 · Resume & Caching](#/en/p4-22).

- [ ] **Keep the script replayable: forbid `Date.now()`/`Math.random()`/arg-less `new Date()`.** ⚠️
  - **Why**: nondeterministic sources break the alignment resume needs (and will throw at runtime directly).
  - **How**: timestamps via `args` or stamped after the fact; randomness via varying the prompt with the agent's index. See [Appendix B · B.5](#/en/app-b).

- [ ] **To force a re-run of some segment, deliberately change it.**
  - **Why**: the cache is judged by "whether the call changed"; changed re-runs, unchanged hits.
  - **How**: see [Chapter 22](#/en/p4-22).

---

## C.8 Isolation & Nesting

- [ ] **Use `isolation: 'worktree'` only when "parallel agents editing the same set of files would collide."** ⚠️
  - **Why**: worktree is expensive (about 200–500ms startup + disk/agent overhead); read-only review, pure analysis, and each writing its own file all **don't need** it. Auto-cleaned when no changes.
  - **How**: enable only for parallel refactor/parallel patching; the result returns the path and branch. See [Chapter 19 · Worktree Isolation](#/en/p4-19).

- [ ] **Reuse an entire flow with `workflow()` inline, but remember nesting is one level only.** ⚠️
  - **Why**: a sub-workflow shares the parent's concurrency limit/agent count/abort signal/token budget; calling `workflow()` again inside it throws.
  - **How**: flatten the "grandchild-level" logic into the sub-workflow; chain multi-level orchestration via the main loop. Real confirmation: a parent inline-ran a hello sub-flow, with the child agent counting toward the parent's `agent_count` (Run `wf_85e22b38-126`). See [Chapter 20 · Nested Workflows](#/en/p4-20).

- [ ] **Reuse an existing subagent type with `agentType` (combinable with schema).**
  - **Why**: custom types like `'Explore'`, `'code-reviewer'` carry their own specialized system prompt; combined with `schema`, the StructuredOutput instruction is appended.
  - **How**: `agent(prompt, { agentType: 'Explore', schema })`. See [Chapter 6](#/en/p2-06).

---

## C.9 Budget Guards

- [ ] **Guard dynamic loops with `budget.total && budget.remaining() < threshold` for an early exit.** ⚠️
  - **Why**: `budget` is a hard cap (calling `agent()` after `spent()` reaches `total` throws); `total` may be `null` (no target set, `remaining()` is `Infinity`), so use a `budget.total &&` short-circuit to avoid exiting wrongly when no target is set.
  - **How**:
    ```javascript
    if (budget.total && budget.remaining() < 30_000) {
      log(`budget guard: ${budget.remaining()} left, stopping`)
      break
    }
    ```
  - See [Chapter 21 · Dynamic Budget & Scaling](#/en/p4-21), [Appendix B · B.6](#/en/app-b).

- [ ] **The budget pool is shared — the main loop + all workflows (incl. nested sub-flows) share one pool.**
  - **Why**: `budget.spent()` counts all output tokens this turn, with nested sub-flows' consumption also counted.
  - **How**: when estimating a nested workflow's cost, include the sub-flows. See [Chapter 20](#/en/p4-20).

---

## C.10 One-Page Overview (Tear Off and Stick on the Wall)

```text
Orchestration
  □ Multi-stage → pipeline (not chained parallel)
  □ parallel takes only thunks
  □ meta a pure literal + first line export
  □ opts.phase explicit grouping inside concurrency blocks
  □ script body only orchestrates, side effects to agents

Products
  □ Constrain key products with schema
  □ schema not over-strict (full enum, lean required)
  □ Split complex structures into two stages
  □ Use (prev, orig, i) for the original input across stages

Observation
  □ Descriptive label
  □ Milestone log + record dropouts
  □ Keep taskId / runId (wait for the notification for the result)

Cost
  □ Estimate tokens first (≈ agent count × 25k–30k)
  □ Wall clock follows the critical path, concurrent what can be concurrent
  □ Simple tasks use haiku
  □ Respect the concurrency limit / 1000 fallback

Resilience
  □ Add adversarial verification to important output
  □ Reduce bias with independent judges + rubric + tallying
  □ .filter(Boolean) the results
  □ Loops have a convergence condition + round cap
  □ budget.total && guard

Iteration
  □ Land as .js, re-run with scriptPath
  □ Resume keeps the earlier part letter-for-letter unchanged (same session, TaskStop first)
  □ Forbid Date.now/Math.random (keep replayable)

Isolation/Nesting
  □ worktree only when parallel file edits collide
  □ workflow() nesting one level only
```

> Companion reading: the reverse checklist (pitfalls and troubleshooting) is in [Appendix B · Pitfalls & Troubleshooting](#/en/app-b); for field semantics see [Appendix A · Full API Reference](#/en/app-a); for terms see [Appendix D · Glossary](#/en/app-d).

> Continue reading: [Appendix D · Glossary](#/en/app-d)
