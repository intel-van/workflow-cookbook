# 第 17 章 · 对抗验证

> 一句话：**让一个独立的 subagent 去「找茬」前一个 subagent 的产物——它的任务不是附和，而是尽力证伪。把这个证伪结果用 schema 收敛成一个可信的判决，你就得到了一条能自我纠错的流水线。**
>
> 这是进阶模式篇的第一章，也是后续所有「质量门」模式的母题。前面基础篇教会了你 `agent` / `pipeline` / `schema`；这一章把它们组合成一个工程上极有价值的结构——**生成与验证分离**。

---

## 17.1 为什么需要对抗验证：自我评估的根本缺陷

先从一个所有人都踩过的坑说起。

你让一个 subagent「找出这段代码的 bug」，它返回了三个。你顺手又问它「你确定这些都是真 bug 吗？」——它几乎总会回答「是的，我确认这些都是真实存在的问题」。

**问题在于：让同一个模型评估自己的产物，它有强烈的「确认偏误」。** 它刚刚生成了这些 bug，上下文里全是「这是 bug」的论证，再让它自我审视，它的立场早已被锚定。它会为自己辩护，而不是质疑自己。这不是模型「不够聪明」，而是**自我评估这个任务结构本身**就有缺陷——评估者和被评估者共享同一份上下文、同一个立场。

对抗验证的核心洞察是：**把验证者换成一个全新的、独立的 subagent，并且明确告诉它「你的职责是证伪」。**

- 它有**独立的上下文**：没有「我刚生成了这个」的包袱，看到的只是一个待核验的论断。
- 它有**对抗性的立场**：prompt 明确要求它当一个怀疑论者、找反例、挑漏洞，而不是附和。
- 它的判决是**结构化的**：用 schema 把「真/假/存疑」钉成枚举，而不是一段含糊的散文。

这三点叠加，就把「模型自我感觉良好」变成了「两个独立视角的对抗」——而对抗，正是逼近真相最古老也最可靠的方法。

<div class="callout info">

**这其实是 Workflow 在重写一个社区早已验证的智慧。** 据 `_grounding.md` D 节，superpowers 系统的精华之一就是「两段式评审闭环」（spec 合规 → code quality，各自循环到过），oh-my-claudecode 强调「独立 reviewer 签核」，oh-my-openagent 用「VERIFICATION_REMINDER 注入纠偏」。这些系统都在用提示词和 Hook **模拟**「生成与验证分离」。原生 Workflow 让你用 `pipeline` + `schema` 把它写成**确定性的、可复用的**结构——这正是本章要教的。

</div>

---

## 17.2 从真实运行看最小对抗验证骨架

理解对抗验证最快的方式，是看它**真的跑起来**是什么样。本书基础篇用过的 `pipeline-demo`（Run ID `wf_bf086b98-6ec`，`agent_count=6`）恰好就是一个最小的对抗验证：**Find 阶段产出一个候选 bug，Verify 阶段对抗性地核验它是不是真 bug。**

```javascript
const items = ['off-by-one', 'null-dereference', 'race-condition']
const out = await pipeline(
  items,
  // 阶段一 Find：生成一个候选
  (kind) =>
    agent(`Give a one-line code example of a ${kind} bug.`, {
      label: `find:${kind}`, phase: 'Find',
      schema: { type: 'object', properties: { example: { type: 'string' } }, required: ['example'] },
    }),
  // 阶段二 Verify：对抗性核验
  (found, kind) =>
    agent(
      `Is this genuinely a ${kind} bug? Example: "${found.example}". Reply boolean + short reason.`,
      {
        label: `verify:${kind}`, phase: 'Verify',
        schema: {
          type: 'object',
          properties: { real: { type: 'boolean' }, reason: { type: 'string' } },
          required: ['real', 'reason'],
        },
      }
    ).then((v) => ({ kind, ...found, ...v }))
)
return out.filter(Boolean)
```

它的**真实返回值**（来源：`assets/transcripts/primitives.md`，节选）：

```json
[
  {
    "kind": "off-by-one",
    "example": "for i in range(len(arr)): print(arr[i+1])  # off-by-one: ...out of bounds",
    "real": true,
    "reason": "Genuine off-by-one bug... at i=2 it accesses arr[3]=arr[len(arr)], raising IndexError..."
  },
  {
    "kind": "null-dereference",
    "example": "int *p = NULL; *p = 5;",
    "real": true,
    "reason": "...Dereferencing a NULL pointer is undefined behavior and crashes (segfault)..."
  }
]
```

这个骨架已经包含了对抗验证的全部要素，我们逐一拆解：

**第一，验证者是一个全新的 agent。** Verify 阶段的 `agent()` 调用，与 Find 阶段是**两个完全独立的 subagent**——独立上下文、独立 token 预算（真实数据印证：3 项 × 2 阶段 = `agent_count=6`）。Verify 看到的不是「我生成的 bug」，而是「一个待核验的论断 `found.example`」。

**第二，验证者被要求做判断，而不是复述。** prompt 问的是「Is this genuinely a ... bug?」——一个是非问题，逼它表态。

**第三，判决被 schema 收敛。** `real: boolean` 是一个**门控字段**：它把「这是不是真 bug」从一段可能含糊的话，钉成了一个 `true`/`false`。编排脚本据此就能 `filter`——这是「生成-验证分离」能落地为确定性流程的关键。

```mermaid
flowchart LR
    subgraph item["每个候选独立流过两阶段"]
        direction LR
        I["待验证主题<br/>'off-by-one'"] --> S1["Find（生成者）<br/>agent + schema"]
        S1 --> P1["候选产物<br/>{ example }"]
        P1 -->|"found.example<br/>作为'证据'交给验证者"| S2["Verify（对抗验证者）<br/>独立 agent + schema"]
        S2 --> V["判决<br/>{ real, reason }"]
        V --> M["合并记录<br/>{ kind, example, real, reason }"]
    end
```

<div class="callout tip">

**注意 `pipeline` 在这里的妙用**：据 `_grounding.md`，pipeline 阶段间**无屏障**——某个候选还在 Verify 时，另一个可能还在 Find。对抗验证天然适合 pipeline，因为「生成→验证」就是一条天然的两阶段链，而你往往要对**多个**候选并行跑这条链。墙钟时间约等于「最慢的一条 Find→Verify 链」，而不是所有 Find 之和加所有 Verify 之和。

</div>

---

## 17.3 把判决升级：从 boolean 到三态枚举

`real: boolean` 够用于最简单的场景，但生产级的对抗验证往往需要**三态**，因为真实世界里除了「是」和「否」，还有大量「证据不足，无法判定」的情况。强迫验证者在信息不全时二选一，会逼它瞎猜——这恰恰违背了对抗验证「严谨」的初衷。

用 `enum` 把判决升级为三态：

```javascript
// （示意，未实跑）—— 三态判决 schema：对抗验证的标准形态
const verdictSchema = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: ['confirmed', 'refuted', 'uncertain'],
      description:
        'confirmed=证据充分，确属真实问题；refuted=确认是误报，给出反例或理由；' +
        'uncertain=现有证据不足以判定，需要更多信息',
    },
    confidence: {
      type: 'number',
      description: '0 到 1 的小数，表示你对该判决的把握程度',
    },
    reasoning: {
      type: 'string',
      description: '一句话给出关键理由或反例；若 refuted，必须指出为何不成立',
    },
  },
  required: ['verdict', 'confidence', 'reasoning'],
}
```

三个字段各司其职：

| 字段 | 类型 | 作用 |
|---|---|---|
| `verdict` | enum 三态 | 核心判决，钉死取值，下游据此做状态机分流 |
| `confidence` | number | 把握度，可用于「低置信度的二次验证」或加权 |
| `reasoning` | string | 让判决可审计——尤其 `refuted` 时必须给反例，逼验证者真的去想 |

`enum` 在这里是命脉。回顾 `_grounding.md`：schema 在工具调用层校验，`enum` 限定的字段若不在取值集合内会触发重试。这意味着你下游可以**绝对放心**地写：

```javascript
// （示意，未实跑）—— 据三态判决分流
const confirmed = results.filter((r) => r.verdict === 'confirmed')
const needsReview = results.filter((r) => r.verdict === 'uncertain')
// refuted 的直接丢弃，不再污染下游
```

不必担心模型这次返回 `'Confirmed'`、`'真'`、`'I think it is confirmed'`——运行时担保了它只会是那三个值之一。**枚举把对抗验证的输出，变成了可靠的状态机迁移。**

---

## 17.4 对抗者 prompt 的写法：如何「逼」出怀疑精神

对抗验证成败的另一半，不在 schema，在**验证者的 prompt**。schema 保证判决结构正确，但「验证者是否真的在对抗」取决于你怎么给它定角色。

一个常见的失败是 prompt 写得太温和：「请检查这个发现是否正确」——模型会礼貌地点头。要逼出真正的对抗，prompt 需要做三件事：

**其一，赋予对抗角色。** 明确告诉它「你是一个怀疑论者 / 红队 / 找茬专家」，它的成功标准是「找出这个论断站不住脚的地方」。

**其二，要求举证，而非表态。** 不要只问「对不对」，要求它「如果认为是误报，必须给出一个反例或具体理由」。举证义务会逼模型真的去推敲，而不是凭感觉投票。

**其三，提供原始证据，不提供原作者的论证。** 只把「待验证的结论 + 必要的原始材料」交给它，**不要**把生成者「为什么我觉得这是 bug」的那套论证也喂进去——否则验证者会被原作者的思路带跑，对抗性荡然无存。

```javascript
// （示意，未实跑）—— 一个有对抗性的验证者 prompt
const verify = (claim, evidence) =>
  agent(
    '你是一名严格的代码审查红队成员。你的职责不是附和，而是尽力**证伪**下面这条论断。\n' +
    '只有当你无法找到任何反例、且证据确凿时，才判 confirmed。\n' +
    '若你能构造一个反例、或论断依赖未经证实的假设，判 refuted 并说明。\n' +
    '若现有证据不足以判定，判 uncertain，不要猜测。\n\n' +
    `待验证论断：${claim}\n` +
    `相关代码证据：\n${evidence}`,
    { schema: verdictSchema, label: 'adversary' }
  )
```

注意这里**没有**把生成者的推理过程传进去——`claim` 是结论，`evidence` 是原始代码，验证者必须**自己**重新判断。

<div class="callout warn">

**对抗不等于抬杠。** 一个常见的过度矫正是把验证者调得过于多疑，导致它把真 bug 也判成 refuted（假阴性）。平衡的关键在 `confidence` 与 `reasoning`：要求它 refuted 时**必须给出具体反例**。如果它给不出反例只是「感觉不太对」，那它其实应该判 `uncertain`。用举证义务约束对抗的强度，避免从「确认偏误」滑向「否认偏误」。

</div>

---

## 17.5 完整骨架：生成 → 对抗验证 → 收口

把前面几节合起来，得到一个生产可用的对抗验证流水线。它对一组待审查项，每项独立地「生成候选发现 → 独立验证者证伪 → 据判决收口」。

```javascript
// （示意，未实跑）—— 完整对抗验证流水线
export const meta = {
  name: 'adversarial-review',
  description: '对每个目标生成发现，再由独立验证者对抗性核验，仅保留确认项',
  phases: [
    { title: 'Find', detail: '生成候选发现' },
    { title: 'Verify', detail: '独立验证者证伪' },
  ],
}

const verdictSchema = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  },
  required: ['verdict', 'confidence', 'reasoning'],
}

const targets = args.targets // 由调用方传入的待审查目标列表

const reviewed = await pipeline(
  targets,
  // 阶段一：生成者
  (target) =>
    agent(
      `审查目标「${target}」，找出其中最可疑的一个问题，给出 claim（结论）与 evidence（支撑证据）。`,
      {
        label: `find:${target}`, phase: 'Find',
        schema: {
          type: 'object',
          properties: { claim: { type: 'string' }, evidence: { type: 'string' } },
          required: ['claim', 'evidence'],
        },
      }
    ),
  // 阶段二：独立对抗验证者
  (found, target) =>
    agent(
      '你是严格的红队审查者，职责是证伪以下论断。能给出反例则判 refuted；' +
      '证据确凿无法反驳才判 confirmed；证据不足判 uncertain。\n' +
      `论断：${found.claim}\n证据：${found.evidence}`,
      { label: `verify:${target}`, phase: 'Verify', schema: verdictSchema }
    ).then((v) => ({ target, ...found, ...v }))
)

// 收口：滤掉被跳过的 null，按判决分类
const valid = reviewed.filter(Boolean)
const confirmed = valid.filter((r) => r.verdict === 'confirmed')
const uncertain = valid.filter((r) => r.verdict === 'uncertain')
log(`确认 ${confirmed.length} 项，存疑 ${uncertain.length} 项，已剔除误报 ${valid.length - confirmed.length - uncertain.length} 项`)
return { confirmed, uncertain }
```

几处工程细节值得强调：

- **`.filter(Boolean)` 不可省。** 据 `_grounding.md`，用户中途跳过某 agent 会让该调用返回 `null`；pipeline 某阶段抛错也会让该 item 变 `null`。消费前必须先滤掉。
- **`phase` 显式标注。** 在 pipeline 内部，给每个 `agent()` 传 `phase: 'Find'` / `'Verify'`，避免它们竞争全局 `phase()`，让进度树清晰分组。这是 `_grounding.md` 明确建议的做法。
- **三态收口。** `confirmed` 直接采纳，`refuted` 丢弃，`uncertain` 单独留出——交给人复核或进入二次验证（见下节）。

```mermaid
flowchart TD
    T["targets[]"] --> P{"pipeline 每项独立"}
    P --> F["Find: 生成者<br/>{ claim, evidence }"]
    F --> V["Verify: 独立验证者<br/>{ verdict, confidence, reasoning }"]
    V --> D{"verdict?"}
    D -->|confirmed| C["采纳"]
    D -->|uncertain| U["留待复核 / 二次验证"]
    D -->|refuted| X["剔除（误报）"]
    C --> R["收口：{ confirmed, uncertain }"]
    U --> R
```

---

## 17.6 进阶：多验证者投票与置信度加权

单个验证者已经远胜自我评估，但它仍是**一个**视角。当判决的代价很高（比如决定是否阻断一次发布），可以让**多个独立验证者**各自投票，再用代码聚合——这就从「对抗」升级为「陪审团」。

机制很简单：对同一个 claim，用 `parallel` 扇出 N 个验证者，每个独立判决，最后多数表决。

```javascript
// （示意，未实跑）—— 多验证者投票
const jurors = await parallel(
  [0, 1, 2].map((i) => () =>
    agent(
      // 用下标 i 微调视角，避免完全同质（呼应「禁用 Math.random，用 index 制造差异」）
      `你是第 ${i + 1} 位独立审查者，从${['可利用性', '影响面', '复现难度'][i]}角度证伪以下论断。\n` +
      `论断：${claim}\n证据：${evidence}`,
      { label: `juror:${i}`, schema: verdictSchema }
    )
  )
)

const votes = jurors.filter(Boolean)
const confirmedVotes = votes.filter((v) => v.verdict === 'confirmed').length
// 多数确认才算确认；置信度可取均值
const finalVerdict = confirmedVotes > votes.length / 2 ? 'confirmed' : 'refuted'
const avgConfidence = votes.reduce((s, v) => s + v.confidence, 0) / votes.length
```

<div class="callout tip">

**推荐的可复用默认规则：默认判 `refuted`，除非「多数」独立验证者（如 3 票里至少 2 票）投 `confirmed`。** 换句话说，一条论断**只有在多数验证者主动确认时才得以存活**；平票或「证据不足」一律默认证伪。上面那行 `confirmedVotes > votes.length / 2` 正是这条规则的代码化——3 票需 ≥2、5 票需 ≥3 才算 `confirmed`，否则收口为 `refuted`。把它当成对抗验证的默认收口姿势：**举证责任在「确认」一方，沉默与分歧都倒向证伪。** 这与本章 17.3 节「`uncertain` 不当 `confirmed` 采纳」的口径一致——存疑不等于通过。

</div>

这里有两个细节呼应了全书的硬约束：

**用 `index` 制造视角差异，而非随机。** 据 `_grounding.md`，脚本禁用 `Math.random()`（破坏可重放性 → 续传失效）。要让多个验证者不完全同质，正确做法是**用下标 `i` 去变化 prompt**——比如让第 0 位看可利用性、第 1 位看影响面。这既制造了多样性，又保持了确定性。

**`parallel` 是屏障，等齐所有票再聚合。** 这正是投票场景需要的——你必须拿到全部选票才能计票。代价是 token 随陪审团规模线性增长：参考真实数据，3 个并发 agent 约 `78844` token（`wf_52957913-6d2`），约为单 agent 的 3 倍。验证者越多越可靠，但也越贵——用判决的代价来决定陪审团的规模。

<div class="callout tip">

**这就是第 14 章「评委面板」与本章的连接点。** 评委面板把这个「多独立评估者 + 投票聚合」的模式用于 A/B 方案评估；本章用于真伪判定。它们共享同一个底层结构：**独立视角 + 结构化判决 + 代码聚合**。掌握了对抗验证，评委面板只是换个评估对象。

</div>

---

## 17.7 反模式：对抗验证用错的几种姿势

最后，列出几个会让对抗验证「形似而神不至」的常见错误：

| 反模式 | 问题 | 正确做法 |
|---|---|---|
| 验证者和生成者共享上下文 | 退化为自我评估，确认偏误 | 验证者必须是独立 `agent()` 调用，只给结论+原始证据 |
| 把生成者的推理喂给验证者 | 验证者被带跑，丧失独立性 | 只传 claim + evidence，让验证者自己重新判断 |
| 验证者 prompt 太温和 | 模型礼貌点头，不真对抗 | 赋予红队角色 + 举证义务（refuted 须给反例） |
| 判决用自由文本 | 无法可靠分流，又回到解析地狱 | 用 `enum` 三态 + `required` 钉死判决 |
| 对每个微小产物都跑陪审团 | token 爆炸，得不偿失 | 单验证者为默认；仅高代价判决才上多投票 |
| 忘记 `.filter(Boolean)` | 跳过/出错的 `null` 让收口崩盘 | 消费判决前一律先滤 null |

<div class="callout warn">

**对抗验证不是免费的——它至少让 agent 数翻倍。** 一条「生成 + 验证」流水线，agent 数是纯生成的 2 倍（真实印证：pipeline-demo 3 项两阶段 = 6 个 agent，`158982` token）。再加陪审团就是数倍。所以对抗验证要用在**判错代价高**的地方：决定是否合并、是否发布、是否上报安全漏洞。对于「拿来参考一下」的低风险产物，单次生成可能就够了。把验证的强度，匹配到判错的代价。

</div>

---

## 17.8 本章小结

- **对抗验证 = 生成与验证分离。** 让一个**独立**的 subagent 去证伪前一阶段的产物，规避「同一模型自我评估」的确认偏误。
- 最小骨架就是真实 `pipeline-demo`（Run `wf_bf086b98-6ec`）：Find 阶段生成候选、Verify 阶段用独立 agent 对抗核验、`real: boolean` 门控收口。
- 生产级判决用 **`enum` 三态**（`confirmed` / `refuted` / `uncertain`）+ `confidence` + `reasoning`，把判决变成可靠的状态机迁移；`refuted` 必须给反例。
- 对抗者 prompt 三要素：**赋予红队角色、要求举证、只给结论+原始证据**（不给原作者的推理）。
- 高代价判决可升级为**多验证者投票**（`parallel` 屏障聚合），用**下标 `index`**（而非 `Math.random`）制造视角差异以保持可重放性。
- 代价意识：对抗验证至少让 agent 数翻倍（token 同步翻倍），把验证强度匹配到判错代价。

下一章，我们把「验证」从「判真伪」推向「判完整」——如何用一个循环，让流水线**反复生成-批评**，直到一个完整性 agent 判定「再也榨不出新东西」为止。

> 继续阅读：[第 18 章 · 循环到干与完整性批评](#/zh/p4-18)
