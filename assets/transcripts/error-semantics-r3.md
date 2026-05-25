# 真实运行记录 · 错误处理语义（Round 3 实测）

> 环境：Claude Code v2.1.150，`CLAUDE_CODE_WORKFLOWS=1`，subagent 模型 haiku（失败语义与模型无关）。本组实验用于**精确确定** `parallel()` / `pipeline()` 的失败语义——这是工具定义文字未完全说清、必须实测的 corner case。

## 实验一：parallel 中「同步 throw」直接让 workflow 失败

- Run ID: `wf_ed5e87f3-435`（status: **failed**）
- 脚本要点：`parallel([好agent, () => { throw new Error('deliberate failure inside a parallel thunk') }, 好agent])`
- 结果：workflow 立即失败，`Error: deliberate failure inside a parallel thunk`，agent_count=1，total_tokens=0，duration_ms=26。
- 结论：thunk **函数体内的同步 throw** 不会被 `parallel()` 吞掉，而是向上抛出、令整个 workflow 失败。

## 实验二：区分「同步 throw」与「返回 reject 的 promise」

- Run ID: `wf_74ebe5ac-2db`（status: completed）
- 返回：`{"syncThrowRejectsWorkflow":true,"asyncReject":{"length":3,"nulls":1,"survivors":2,"becomesNull":true}}`
- 运行注记（task-notification `<failures>`）：`parallel[1] failed: Error: returned-promise rejection, no synchronous throw`
- agent_count=3，total_tokens=78,432，duration_ms=5,325。
- 结论：
  - 阶段 1（try/catch 包裹的同步 throw）：`parallel()` **reject**（捕获到 → `syncThrowRejectsWorkflow=true`）——印证实验一。
  - 阶段 2（`() => Promise.reject(...)` 异步 reject）：该位置变为 **null**，其余 2 个存活（`becomesNull=true`），**workflow 正常完成**；失败被单独记录在运行的 `<failures>` 注记里。

## 实验三：pipeline 阶段「同步 throw」只丢弃该 item

- Run ID: `wf_f5f5b422-a4f`（status: completed）
- 脚本要点：`pipeline(['ok','boom','ok2'], stage1[boom 同步 throw], stage2)`，外层 try/catch
- 返回：`{"crashed":false,"length":3,"nulls":1,"survivors":2,"itemDroppedToNull":true}`
- 运行注记：`pipeline[1] failed: Error: stage-1 synchronous throw for "boom"`
- agent_count=**4**，total_tokens=104,657，duration_ms=12,019。
- 结论：
  - `pipeline()` 对每个 item 的每个 stage 做了 per-item 包裹：`boom` 在 stage1 同步 throw → 该 item 变 **null** 并跳过后续 stage，`ok`/`ok2` 不受影响、正常走完 2 个 stage（`crashed=false`）。
  - agent_count=4 = `ok`(2 stage) + `ok2`(2 stage) + `boom`(0，stage1 即 throw)，**精确印证「抛错跳过该 item 剩余 stage」**。

## 汇总：失败语义对照（实测）

| 场景 | `parallel()` | `pipeline()` |
|---|---|---|
| thunk/stage **同步 throw** | **reject 整个调用**（不 try/catch 则 workflow 失败） | 仅该 **item 变 null**，其余存活 |
| 返回的 promise **异步 reject** / agent 出错 | 该位置 **null**，调用本身不 reject | 仅该 item 变 null |
| 失败如何呈现 | 运行完成/失败均在 `<failures>` 注记中列出 | 同左 |

**实战法则**：在 `parallel()` 里，**绝不要把有风险的同步逻辑放在 thunk 函数体**——把它放进被 `await` 的 `agent()` 调用里（只有异步路径才会被归集为 `null`）；用结果前永远先 `.filter(Boolean)`。`pipeline()` 的 stage 容错更强（同步 throw 也只丢该 item），但同样要 `.filter(Boolean)`。
