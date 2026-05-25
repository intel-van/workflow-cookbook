# 第 14 章 · 评委面板：A/B 评估

> 当你有两份（或 N 份）候选答案，怎么客观地选出更好的那个？最坏的做法是让**一个** agent「看看哪个好」——单一裁判既有偏好又有盲区。本章把现实世界的**评委面板**搬进 Workflow：**N 个候选 → 多名彼此独立的评委按同一套 rubric 打分 → 计票聚合定胜负**。配方用一次真实运行贯穿：两份候选答案，3 名独立评委，**3:0** 判出胜者——而且评委们做了一件意料之外却极有价值的事。

---

## 14.1 配方动机

「让 LLM 当裁判」（LLM-as-judge）本身不新鲜。问题在于**怎么当**才靠谱。单评委有三个硬伤：

- **偏好偏差**。单个 agent 对「啰嗦但全面」还是「简洁但浅」有自己的口味，它的一次裁决里混着这种偏好，你分不清「B 真的更好」还是「这个评委恰好喜欢 B 的风格」。
- **不稳定**。同一个评委对同一对候选，措辞稍变就可能翻盘——你无从知道结果有多稳。
- **不可计票**。一个评委只给一个结论，你拿不到「多大比例认为 B 更好」这种**置信度**信息。

评委面板用**多个互不通信的独立评委**直接解决这三点：

```mermaid
flowchart TB
  q["同一个问题 q"]
  q --> A["draft:A<br/>视角 A（如初学者友好）"]
  q --> B["draft:B<br/>视角 B（如性能工程）"]
  A & B --> BR{{"屏障：两份候选都就绪"}}
  BR --> J1["judge:1<br/>独立按 rubric 打分"]
  BR --> J2["judge:2<br/>独立按 rubric 打分"]
  BR --> J3["judge:3<br/>独立按 rubric 打分"]
  J1 & J2 & J3 --> T["Tally 计票<br/>votesA vs votesB"]
  T --> W["winner"]
```

三个关键设计——本章其余内容都是它们的展开：

1. **评委必须独立**：用 `parallel` 让每个评委**各自**打分，互相看不见对方的结论（否则会从众，退化成单评委）。
2. **打分要有 rubric**：用 `schema` 把评分维度（accuracy / clarity / completeness）**固化成数字**，逼评委结构化思考，而非给一句「我觉得 B 好」。
3. **聚合用计票，不用单 agent 拍板**：最后的胜负是**数票**数出来的，不是再派一个 agent「综合一下大家意见」——后者会把多评委的独立性又收敛回单点。

---

## 14.2 完整脚本

**（依据 transcript 骨架补全的示意脚本，未逐字实跑；本次真实运行的 Run ID 与用量见 14.3。）** 下面是这次真实运行的脚本（结构与 `assets/transcripts/judge-panel.md` 一致）。transcript 中 `answer` 与 `SCORE` 两处 schema 以 `{...}` 省略，此处**补全为可运行形态**并逐处标注「（示意补全）」；真实存在于 transcript 的部分（`meta`、`q`、`parallel` 起草、3 评委 `parallel` 打分、Tally 计票与 `return`）保持原样。

```javascript
export const meta = {
  name: 'judge-panel',
  description: 'A/B evaluation: two candidates scored by 3 independent judges, then tallied',
  phases: [{ title: 'Draft' }, { title: 'Judge' }, { title: 'Tally' }],
}

const q = 'When should you use parallel() vs pipeline() in a Claude Code Workflow?'

// 候选答案的 schema（示意补全：transcript 中以 {...answer} 省略）
const ANSWER = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
}

phase('Draft')
// 两份候选并发产出，刻意用不同视角，制造真实的质量差异
const [a, b] = await parallel([
  () => agent(`${q} Write a thorough answer from a beginner-friendly angle.`,
    { label: 'draft:A', phase: 'Draft', schema: ANSWER }),
  () => agent(`${q} Write a thorough answer from a performance-engineering angle.`,
    { label: 'draft:B', phase: 'Draft', schema: ANSWER }),
])

phase('Judge')
// rubric 固化为 schema：三个评分维度 + 胜者枚举 + 理由（示意补全 SCORE）
const SCORE = {
  type: 'object',
  properties: {
    scoreA: {
      type: 'object',
      properties: {
        accuracy: { type: 'number' },
        clarity: { type: 'number' },
        completeness: { type: 'number' },
      },
      required: ['accuracy', 'clarity', 'completeness'],
    },
    scoreB: {
      type: 'object',
      properties: {
        accuracy: { type: 'number' },
        clarity: { type: 'number' },
        completeness: { type: 'number' },
      },
      required: ['accuracy', 'clarity', 'completeness'],
    },
    winner: { type: 'string', enum: ['A', 'B'] },
    reason: { type: 'string' },
  },
  required: ['scoreA', 'scoreB', 'winner', 'reason'],
}

// 3 名评委各自独立打分：parallel 屏障，互不可见对方的裁决
const judges = await parallel(
  [1, 2, 3].map((i) => () =>
    agent(
      `Independently score answers A and B on accuracy, clarity, completeness (0-10 each), ` +
        `then pick the better overall.\nA: ${a.answer}\nB: ${b.answer}`,
      { label: `judge:${i}`, phase: 'Judge', schema: SCORE }
    )
  )
)

phase('Tally')
// 计票聚合：数票，不让某个 agent「综合大家意见」
const valid = judges.filter(Boolean)
const votesA = valid.filter((j) => j.winner === 'A').length
const votesB = valid.filter((j) => j.winner === 'B').length
return {
  votesA,
  votesB,
  winner: votesA > votesB ? 'A' : 'B',
  judgeReasons: valid.map((j) => j.reason),
}
```

注意这个结构和第 11 章 PR 多维 Review **形似而神不同**：两者都用 `parallel` 屏障并发，但——

- 第 11 章：每个 agent 看**不同**的维度（分工），最后**综合**它们的产出。
- 本章：每个评委看**同一对**候选（重复评判），最后**计票**它们的投票。

**「分工后综合」用 agent，「重复后计票」用代码。** 这是评委面板的灵魂——把聚合从「再叫一个 agent 拍板」降级成一段**确定性的数票代码**，从而保住每个评委的独立性。

---

## 14.3 真实运行结果

> **真实运行**：Run ID `wf_f5b69668-b18`，Task ID `w7rykwriv`。原始记录见 `assets/transcripts/judge-panel.md`。
> 真实用量：`agent_count=5`（2 起草 + 3 评委）｜ `tool_uses=26` ｜ `total_tokens=201852` ｜ `duration_ms=79462`。

### 计票结果：3:0 判 B 胜

脚本的真实返回值：

```json
{
  "votesA": 0,
  "votesB": 3,
  "winner": "B",
  "judgeReasons": [ "...三段详尽理由..." ]
}
```

**3 名评委一致（3:0）判 B 胜**。理由收敛得很清楚：B（性能工程视角）在 **completeness** 上压倒性领先——它包含了**真实测量数据**与「back-to-back parallel 屏障浪费」这一核心反模式（正是第 08 章的主题）；A（初学者视角）在 **clarity** 上略胜，但缺少决定性的深度。三个维度里，completeness 的差距盖过了 clarity 的小优势。

<div class="callout tip">

**注意 `agent_count=5` 对应脚本结构。** 2 份草稿 + 3 名评委 = 5 个 agent，与真实用量精确吻合（印证第 08 章「token ≈ agent 数 × 每 agent 上下文」的经验法则：`201852 / 5 ≈ 40K/agent`）。`tool_uses=26` 偏高，下一节揭示原因——评委做了额外的事。

</div>

### 两个意料之外、却极有价值的观察

这次运行最有意思的不是「B 赢了」，而是评委**怎么**得出这个判断的：

<div class="callout info">

**观察 1 · 评委会主动求证。** 3 名评委在各自的理由里都写明：它们**实际读取了 `docs/en/p2-08-parallel-vs-pipeline.md` 和 `assets/_grounding.md` 进行交叉核对**，逐条验证候选答案里的数字——`8.4s / 78844 token`、`26.7s / 158982 token`、`3×5.5≈16.5s` 基线、`min(16, cores−2)` 并发上限、`1000` agent 兜底。三名评委的独立结论都是「zero factual errors，每个数字精确吻合」。

这解释了为什么 `tool_uses=26` 这么高：评委没有「凭印象打分」，而是**真的去读了事实源**。**副作用**：这等于**顺带验证了本书 p2-08 章的全部真实数据准确无误**——一次评委面板运行，附赠了一次事实核查。

**观察 2 · 独立评委收敛。** 三名**互不通信**的评委，独立得出完全一致的结论（3:0）。这正是评委面板的核心价值兑现：对「质量明显有别」的候选，多个独立视角会**稳定收敛**；而如果候选质量接近，你会看到 2:1 甚至分裂的打分——那本身就是「这俩差不多」的信号。

</div>

这两个观察共同说明：**结构化的 rubric（schema）会引导评委去做严肃的求证，而不是给客套话。** 当 schema 要求它为 `accuracy` 打一个具体数字时，一个尽责的评委自然会去核对事实——这是 schema 约束的「副作用红利」。

---

## 14.4 设计要点

**① 评委独立是不可妥协的红线。** 用 `parallel` 让评委**并发且互不可见**对方的裁决。一旦你写成「评委 2 看着评委 1 的打分再打」，面板就退化成「一个评委 + 几个附和者」，多视角降偏差的价值归零。

<div class="callout warn">

**反例**：不要这样串行喂结论——

```javascript
// ✗ 错：评委 2/3 看得到前面的裁决 → 从众，独立性丧失
let prev = null
for (const i of [1, 2, 3]) {
  prev = await agent(`Previous judge said: ${JSON.stringify(prev)}. Now you score...`, { schema: SCORE })
}
```

正确写法就是脚本里的 `parallel([1,2,3].map(...))`——三个评委同时跑，谁也看不见谁。

</div>

**② rubric 必须用 schema 固化成数字。** 让评委对 `accuracy / clarity / completeness` 各打一个 `number`，比让它写一段「总体感觉」强得多：数字可比较、可解释（你能看出「B 赢在 completeness」）、可加权（变体 B）。schema 在工具调用层校验（第 07 章），评委不合规会被要求重打——这把「打分」从软性建议变成硬性结构。

**③ 聚合用计票，绝不用「综合 agent」。** 最后的 `Tally` 阶段是**纯 JavaScript**——`filter` + 数票。**别**在这里再插一个 agent「综合三位评委的意见给出最终结论」：那会把三个独立信号又压成一个单点判断，前面辛苦保住的独立性付诸东流。**计票是确定性的、可复现的、零额外 token 的**——这正是 Workflow 「确定性骨架」该承担的部分（呼应第 02 章）。

**④ 候选要制造真实差异。** 本例刻意让 A 走「初学者视角」、B 走「性能工程视角」,从而产生可被区分的质量差。如果两份候选几乎一样，评委只能在噪声里硬选，结果不具参考价值。候选可以来自**不同 prompt、不同模型、不同温度，或同一 prompt 的多次采样**。

**⑤ 评委数取奇数。** 3、5、7……奇数评委避免平票。本例 3 名足以在「质量明显有别」时稳定收敛；若候选势均力敌或赌注很高，加到 5 名能进一步降低单评委噪声（代价是线性增长的 token，但墙钟仍受屏障约束、不随评委数线性增长）。

---

## 14.5 变体

<div class="callout info">

**变体 A · N 候选锦标赛**：候选不止两份时，schema 的 `winner` 从 `enum:['A','B']` 扩成 `enum:['A','B','C',...]`，评委直接选最优；或让每个评委对全部候选**排序**（返回一个 ranking 数组），Tally 阶段用 Borda 计数等排序聚合法定胜负。

**变体 B · 加权 rubric**：不同维度配权重（如 `accuracy×3 + completeness×2 + clarity×1`），在 Tally 阶段对每个评委的 `scoreA/scoreB` 加权求和再比大小——把「投票」升级成「加权计分」，适合维度重要性不均的场景。

**变体 C · 评委 + 一票否决**：给 schema 加一个 `disqualify: boolean` 字段（如「含事实错误」「越权」）。Tally 时任一评委否决即直接淘汰该候选——把「打分」和「红线检查」分离，呼应第 17 章对抗验证。

**变体 D · 接在 GCF / 生成之后（N 选优）**：这正是第 12 章 GCF「变体 C」的落点——Generate 阶段用 `parallel` 产出 N 个候选，**用本章的评委面板选出最佳**，再对胜者跑 Critique→Fix。评委面板是任何「先发散、后收敛」流水线的**收敛闸**。

**变体 E · 嫁接式综合（不丢落选者的好点子）**：更强的收敛不止「选出胜者」，而是**以胜出候选为主干，把落选候选里独有的好点子嫁接进来**。落选≠全盘皆输——一个总分第二的候选，可能恰好在某个维度（如某个被胜者漏掉的边界条件、一句更精准的措辞）上更好。做法是：计票选出胜者后，**再加一个综合 agent**，喂给它「胜者全文 + 各落选者，以及评委指出的各自亮点」，让它产出一份「以胜者为骨架、择优吸收落选者长处」的最终稿。

```javascript
// （示意，未实跑）—— 计票选出胜者后，嫁接式综合
const winnerDraft = votesA > votesB ? a.answer : b.answer
const final = await agent(
  // 以胜者为主干综合，并把落选候选里独有的好点子嫁接进来——别浪费落选者里的真知灼见
  `以下方为主干改写出最终答案：\n${winnerDraft}\n\n` +
    `从以下落选候选中，仅吸收其独有的、胜者缺失的优点（如遗漏的边界情形、更准的措辞）：\n${votesA > votesB ? b.answer : a.answer}`,
  { label: 'synthesize', phase: 'Tally', schema: ANSWER }
)
```

注意这个综合 agent **加在计票之后**，不替代计票——胜负仍由 14.4 节「③ 聚合用计票」那段确定性代码定出，综合只发生在「主干已定」之后，因此不破坏评委独立性。它和「让一个 agent 综合大家意见来决定胜负」（那条红线）有本质区别：**前者用 agent 拼装文本、后者用 agent 拍板胜负。**

</div>

---

## 14.6 本章小结

- 评委面板 = **N 个候选 → 多名独立评委按同一 rubric 打分 → 计票聚合**，用多视角降低单评委的偏好偏差与不稳定。
- 三条红线：评委**独立**（`parallel` 各自打分、互不可见）、rubric **用 schema 固化成数字**、聚合**用计票代码**而非「综合 agent」拍板。
- 与第 11 章形似神不同：PR 评审是「分工后综合（用 agent）」，评委面板是「重复后计票（用代码）」。
- 真实运行：`agent_count=5`、`total_tokens=201852`、`duration_ms=79462`；2 候选、3 评委、**3:0 判 B 胜**。
- 两个实证观察：评委**主动读 `docs/en/p2-08` 与 `_grounding.md` 交叉核对**（`tool_uses=26` 的来由，副带验证了本书 p2-08 数据全对）；三名互不通信的评委**独立收敛一致**。
- 变体：N 候选锦标赛、加权 rubric、一票否决、接在生成/GCF 之后做 N 选优、**嫁接式综合**（以胜者为主干、把落选者独有的好点子吸收进来，不浪费落选稿里的真知灼见）。

下一章进入「Bug 猎手」配方：自繁殖的 finder 池流入对抗验证，把一条分支的潜在缺陷高精度地挖出来。

> 继续阅读：[第 15 章 · Bug 猎手](#/zh/p3-15)
