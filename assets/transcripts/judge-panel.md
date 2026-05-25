# 真实运行记录 · 评委面板配方（Judge Panel）

> 「评委面板」配方（第 14 章）的真实运行：先并发产出两份候选答案（不同视角），再派 3 名**独立评委**按 accuracy/clarity/completeness 打分并各自选优，最后计票定胜负。
> 环境：Claude Code v2.1.150，`CLAUDE_CODE_WORKFLOWS=1`，2026-05。

**Run ID**：`wf_f5b69668-b18` ｜ **Task ID**：`w7rykwriv`

## 脚本结构（Draft → Judge → Tally）

```javascript
export const meta = {
  name: 'judge-panel',
  description: 'A/B evaluation: two candidates scored by 3 independent judges, then tallied',
  phases: [{ title: 'Draft' }, { title: 'Judge' }, { title: 'Tally' }],
}
const q = 'When should you use parallel() vs pipeline() in a Claude Code Workflow?'
phase('Draft')
const [a, b] = await parallel([
  () => agent(`${q} ...beginner-friendly angle.`, { label:'draft:A', phase:'Draft', schema:{...answer} }),
  () => agent(`${q} ...performance-engineering angle.`, { label:'draft:B', phase:'Draft', schema:{...answer} }),
])
phase('Judge')
const SCORE = { /* scoreA{accuracy,clarity,completeness}, scoreB{...}, winner enum[A,B], reason */ }
const judges = await parallel([1,2,3].map(i => () =>
  agent(`Independently score A and B ... pick the better.\nA: ${a.answer}\nB: ${b.answer}`,
    { label:`judge:${i}`, phase:'Judge', schema:SCORE })))
phase('Tally')
const valid = judges.filter(Boolean)
const votesA = valid.filter(j=>j.winner==='A').length
const votesB = valid.filter(j=>j.winner==='B').length
return { votesA, votesB, winner: votesA>votesB?'A':'B', judgeReasons: valid.map(j=>j.reason) }
```

## 真实用量

`agent_count=5`（2 起草 + 3 评委）｜ `tool_uses=26` ｜ `total_tokens=201852` ｜ `duration_ms=79462`

## 真实产出

```json
{ "votesA": 0, "votesB": 3, "winner": "B", "judgeReasons": [ ... 三段详尽理由 ... ] }
```

**3 名评委一致（3:0）判 B 胜**：B（性能工程视角）在 completeness 上压倒性领先（含真实测量数据与「back-to-back parallel 屏障浪费」这一核心反模式），A（初学者视角）clarity 略胜但缺关键深度。

## 两个意外但有价值的观察（实证）

1. **评委会主动求证**：3 名评委在理由里都写明，它们**实际读取了 `docs/en/p2-08-parallel-vs-pipeline.md` 与 `assets/_grounding.md` 进行交叉核对**，逐条验证数字（8.4s/78844 token、26.7s/158982 token、3×5.5≈16.5s 基线、min(16, cores−2)、1000 上限）——结论是「zero factual errors，每个数字精确吻合」。这等于**顺带验证了本书 p2-08 章的真实数据全部准确**。
2. **独立评委收敛**：三名互不通信的评委独立得出一致结论（3:0），说明对「质量明显有别」的候选，评委面板能稳定收敛——这正是该配方的价值：用多个独立视角降低单评委偏差。

> **配方要点**：评委必须**独立**（用 `parallel` 各自打分，互不可见），打分要**有 rubric**（schema 把 accuracy/clarity/completeness 固化为数字），最后用**计票/聚合**而非让单个 agent「拍脑袋选」。
