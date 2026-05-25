# R7 Phase 0 — 真值锚定与实测证据

> 2026-05-25/26。本轮（R7）开工前的地基核实。所有结论可回溯到 ① 实测会话环境变量 ② 探针 workflow `wf_e8cb23ff-829`。承 `examples-r6.md`。

## 1. 会话环境变量（直接 `env` 实测，非第三方说法）

```
AI_AGENT=claude-code_2-1-150_agent
CLAUDE_CODE_WORKFLOWS=1
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-4-7[1m]
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-opus-4-7[1m]
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-opus-4-7[1m]
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-6[1m]
CLAUDE_CODE_EFFORT_LEVEL=max
```

要点：
- **`CLAUDE_CODE_WORKFLOWS=1` 实证存在** —— 坐实「门控环境变量」之说（§A 此前已记，R7 再次直接 env 实证）。
- **模型覆盖是两层，不止一层**（净新发现）：除已记录的 `CLAUDE_CODE_SUBAGENT_MODEL`，还有 `ANTHROPIC_DEFAULT_HAIKU_MODEL/SONNET/OPUS` 把**模型别名**整体重映射到 Opus。这更精确地解释「脚本写 `model:'haiku'`、实跑却是 Opus」的成本真相——两层旋钮叠加，不能只归因前者。
- `AI_AGENT=claude-code_2-1-150_agent` 印证版本 v2.1.150。

## 2. 探针 workflow `wf_e8cb23ff-829`（4 agent / 93,026 token / 15,032ms）

脚本三阶段，`meta.phases` 用了 `{title, detail}` 与 `{title, model}` 两种形态、成功提交运行 → 旁证 phases 项支持 `detail`/`model`。原始返回：

```json
{
  "budget": {"total": null, "spent": 57671, "remaining": null},
  "smoke": "PROBE_OK",
  "schemaNaming": {
    "okField": {"ok": false, "reason": "...the capital is Canberra..."},
    "explicitField": {"draftIsFactuallyCorrect": false, "reason": "...the capital is Canberra..."}
  },
  "agentType": "THREW: agent({agentType}): agent type 'nonexistent-agent-xyz-123' not found. Available agents: claude, claude-code-guide, codex:codex-rescue, Explore, general-purpose, get-current-datetime, init-architect, Plan, planner, statusline-setup, team-architect, team-qa, team-reviewer, ui-ux-designer"
}
```

逐项结论：
- **budget**：`total===null`（本会话未给 `+Nk` 指令）、`spent()` 正常累加（探针中途 = 57,671）。**JSON 序列化陷阱**：`remaining()` 运行时是 `Infinity`，但放进对象 `JSON.stringify` 后变 `null`（旧探针 `wf_fd09a6ed-38a` 曾用 `String()` 显式捕获到 `"Infinity"`）。**要在日志/返回里展示 remaining，得 `String(budget.remaining())`，否则看到的是 `null`。** 再次确认 §C 的 budget 行为。
- **agentType**：未知值在生成模型前抛错并列出 14 个可用 agent —— 与 §A2（`wf_a222f20f-0f5`）一致，R7 复测稳定复现。
- **schemaNaming（关键负结果）**：对一个**明确错误**的草稿（"澳洲首都是悉尼"），字段名 `ok` 与显式名 `draftIsFactuallyCorrect` **都正确返回 `false`**。**未复现**第三方所述「`ok` 被误解致崩」。结论：不写成硬 bug，仅作「字段命名清晰度」建议，并标注「第三方报告、我方简单 A/B 未复现」。
- **smoke**：schema-less agent 返回纯文本 `"PROBE_OK"`，`model:'haiku'` 经两层覆盖实跑 Opus。

## 3. 对 R7 文档的影响
- **净新增写入**：`ANTHROPIC_DEFAULT_*_MODEL` 两层覆盖（→ `app-a` 模型覆盖段 + `app-d` 术语表 + grounding §A/§A2）。
- **负结果写入**：schema 字段命名作为软建议（→ `p2-07`）。
- **再确认（无需改）**：agentType 校验、budget.total=null/remaining=Infinity、512KB、phases[].detail/model、激活开关——均已在书中覆盖。这本身印证全书事实层之扎实。
