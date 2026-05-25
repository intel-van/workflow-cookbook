# 真实运行记录 · Round 3 基线复验（v2.1.150）

> 环境：Claude Code v2.1.150，`CLAUDE_CODE_WORKFLOWS=1`。本组用于复验「第一部/第二部」描述的原语行为在当前版本仍成立；subagent 多为 haiku（结构性行为与模型无关）。原始 opus 记录见 `primitives.md` / `advanced.md`，本组为 round-3 复跑。

## hello 冒烟（schema 强制类型）
- Run `wf_2e7d82d6-d13`（completed）
- 返回：`{"message":"The Claude Code Workflow runtime is operational and this smoke test executed successfully.","sum":4,"runtimeConfirmed":true}`
- agent_count=1，total_tokens=26,328，duration_ms=5,702。
- 复验：`sum` 为数字 `4`（非字符串）——schema 在工具调用层强制类型；与原始记录（`wf_dacbd480-d5d`，26,338 token / 5,506ms）几乎一致。

## parallel（屏障 + 真并发）
- Run `wf_3b5bbac7-e96`（completed）
- 返回：3 个颜色对象（red `#FF0000` / green `#008000` / blue `#0000FF`）。
- agent_count=**3**，total_tokens=78,586，duration_ms=7,483。
- 复验：屏障等齐 3 个并发 agent；token≈3× 单 agent；与原始记录（`wf_52957913-6d2`，78,844 token / 8,395ms）几乎一致。

## pipeline（3 item × 2 stage）
- Run `wf_58225d5c-1e8`（completed）
- 返回：3 个 `{module, severity}`；stage2 成功引用 stage1 的风险笔记（`(prev, orig, i)` 签名生效）。
- agent_count=**6**，total_tokens=180,152，duration_ms=60,883，tool_uses=35。
- 复验：agent_count=6 = 3×2，印证「每 item 独立流过 2 个 stage、阶段间无屏障」。耗时随运行波动（原始 `wf_bf086b98-6ec` 为 26,743ms），agent_count 为稳定结构指标。

## budget API 探针
- Run `wf_fd09a6ed-38a`（completed）
- 返回：`{"totalIsNull":true,"spentIncreased":true,"remainingBefore":"Infinity","remainingAfter":"Infinity","guardRounds":0,"note":"..."}`
- agent_count=1，total_tokens=26,211，duration_ms=6,933。
- 复验：未设 `+Nk` 目标时 `budget.total===null`、`budget.remaining()===Infinity`；`budget.spent()` 随 agent 递增；`while(budget.total && budget.remaining()>N)` guard 因 total 为 null 而执行 **0 轮**——证明 loop-until-budget 必须 `guard on budget.total`，否则会一路跑到 1000 agent 兜底上限。
