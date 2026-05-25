# 真实运行记录 · 应用型配方重跑：Bug 猎手 on buggy-cart.js（Round 3 实测）

> 环境：Claude Code v2.1.150，`CLAUDE_CODE_WORKFLOWS=1`，subagent 默认模型（Opus 4.7）。靶子 `assets/samples/buggy-cart.js` 含 **5 个植入 bug**（已知 ground truth），用于复验「Bug 猎手」配方（[§15](#/zh/p3-15)）：**finder 并发发现 → 去重 → 对抗验证（refute-by-default）**。

## 运行
- Run `wf_f056e6f1-78c`（status: completed），agent_count=**14**，total_tokens=398,145，duration_ms=80,261，tool_uses=30。
- 结构：phase「Hunt」2 个 finder（`parallel`）→ 脚本内去重 → phase「Verify」对每条去重发现 1 个对抗验证者（`parallel`，默认 isReal=false 除非能据代码证实）。
- 返回（原始）：

  ```json
  {"finders":2,"rawFindings":13,"deduped":12,"verdicts":12,"confirmedReal":11,
   "confirmedTitles":["applyDiscount: Missing input validation …","cartTotal: Off-by-one …",
   "checkout: Missing await on async charge …","findItem: Loose equality (==) …",
   "mergeCarts: In-place mutation …","checkout: Cart emptied … before … charge settles",
   "checkout: Unhandled promise rejection from un-awaited charge() …", "… (含跨 finder 近重复)"]}
  ```

## 对照 ground truth（5 个植入 bug）
| 植入 bug | 是否命中 | 说明 |
|---|---|---|
| applyDiscount 无校验 percent（负价/NaN/字符串拼接） | ✅ | 命中 |
| cartTotal off-by-one（漏最后一项） | ✅ | 命中 |
| checkout 漏 await（charge 恒真） | ✅ | 命中，且额外拆出 2 个相关子问题（未处理 reject、未结算先清空购物车）|
| findItem `==` 松散比较 | ✅ | 命中 |
| mergeCarts 就地变更入参（共享引用） | ✅ | 命中 |

**召回率 5/5（100%）**；对抗验证 12 条中确认 11、证伪 1。

## 诚实观察（corner case）
- **简单去重不够**：脚本内去重键用 `fn + title 前 24 字`，导致两个 finder 对**同一 bug 的不同措辞**未被合并（如 cartTotal off-by-one、findItem `==`、mergeCarts 变更各出现两次）。`confirmedReal=11` 含这些跨 finder 近重复；**去重的去重质量取决于 key 设计**。生产中应按 `fn+line` 或语义相似度去重，或加一个「合并」阶段（屏障）。
- checkout 一个「漏 await」被合理拆成 3 个相关缺陷——说明 finder 粒度比 ground truth 标注更细，属正常且有价值。
- 14 agent = 2 finder + 12 验证者；token≈14×（每 agent 约 2.5–3 万）≈ 398K，符合经验法则。

**结论**：Bug 猎手配方（find → 去重 → 对抗验证）在 v2.1.150 真实复现，对已知 ground truth 达 100% 召回；对抗验证以「默认证伪」过滤，11/12 通过。复刻时务必强化去重键。
