# 第 18 章 · 循环到干与完整性批评

> 一句话：**用一个普通的 JavaScript `while` 循环，反复「生成 → 问一句『还有遗漏吗』」，直到一个完整性 agent 判定『再也榨不出新东西了』为止——这就是『循环到干』（loop-until-dry）。**
>
> 上一章解决「产物**对不对**」（对抗验证），这一章解决「产物**全不全**」（完整性）。两者是质量门的两条正交轴：一个查真伪，一个查覆盖。

---

## 18.1 单次生成的天花板：模型会「早早收手」

先看一个真实而普遍的现象。

你让一个 subagent「列出这个模块所有的安全隐患」，它给了你 5 条，然后停下。它是真的只有 5 条吗？往往不是——模型倾向于在给出「一组看起来合理的答案」后就收手，因为对它而言，「列出几条」这个任务已经「完成」了。它不会主动追问自己「我是不是漏了什么」。

这是单次 `agent()` 调用的天花板：**它的产出是一次性的，没有『再想想』的机制。** 你可以在 prompt 里写「请尽可能详尽、列出全部」，能拉高一些数量，但仍是一锤子买卖——模型在某个它自己认为「够了」的点停下，而那个点几乎总是早于「真正穷尽」。

「循环到干」的思路，是把「再想想」这件事**从 prompt 的恳求，变成代码的循环**：

1. 生成一批结果。
2. 拿着「已有的结果」去问：**还有没有遗漏？**
3. 如果有，把新发现并入，回到第 2 步。
4. 如果「没有了」——**dry**——退出循环。

每一轮，模型看到的是「已经找到的 N 条」，被明确要求「找出**还没被提到**的新东西」。这个「已有清单」会逼它越过自己的舒适停止点，一轮轮把剩余的东西榨出来，直到真的榨干。

<div class="callout info">

**这是社区系统反复验证过的模式。** 据 `_grounding.md` D 节：superpowers 的精华之一是「两段式评审闭环，各自循环到过」；oh-my-claudecode 的招牌是「`Stop` 钩子持久循环——boulder never stops，让『是否允许停止』可编程」。它们都在用 Hook 和状态文件**模拟**「不到完整不罢休」。原生 Workflow 让你用一个 `while` 循环 + 一个 schema 化的「完整性判决」，把同样的逻辑写成**确定性的、自带刹车的**结构。本章就教这个。

</div>

---

## 18.2 核心结构：while 循环 + 完整性门控

「循环到干」的骨架，本质是一个由「完整性 agent 的布尔判决」驱动的 `while` 循环。先看最小形态：

```javascript
// （示意，未实跑）—— 循环到干的核心骨架
phase('Harvest')
let found = []          // 累积已发现的全部条目
let done = false        // 完整性门控
let round = 0

while (!done && round < 6) {   // 6 是防失控硬上限，见 18.3
  round++

  // 1) 生成：找出「还没被提到」的新条目
  const fresh = await agent(
    `目标：列出该模块所有安全隐患。\n` +
    `已经找到的（不要重复）：\n${found.map((f) => '- ' + f.title).join('\n') || '（暂无）'}\n` +
    `请只给出**新的、未被提及**的隐患。`,
    {
      label: `harvest:round-${round}`, phase: 'Harvest',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { title: { type: 'string' }, detail: { type: 'string' } },
              required: ['title', 'detail'],
            },
          },
        },
        required: ['items'],
      },
    }
  )

  found.push(...fresh.items)

  // 2) 完整性批评：还有遗漏吗？
  const critique = await agent(
    `已找到的隐患清单：\n${found.map((f) => '- ' + f.title).join('\n')}\n` +
    `你是完整性审查员。判断这份清单是否已经穷尽该模块的安全隐患。\n` +
    `若你能指出任何**仍被遗漏**的方向，则 done=false 并在 missing 里列出；\n` +
    `若确信已无遗漏，则 done=true。`,
    {
      label: `completeness:round-${round}`, phase: 'Harvest',
      schema: {
        type: 'object',
        properties: {
          done: { type: 'boolean' },
          missing: { type: 'array', items: { type: 'string' } },
        },
        required: ['done', 'missing'],
      },
    }
  )

  done = critique.done   // 布尔门控驱动循环
  if (!done) log(`第 ${round} 轮后仍有遗漏：${critique.missing.join('、')}`)
}

log(`循环到干：${round} 轮，共 ${found.length} 条`)
return found
```

这个骨架有三个关键角色，分别对应进阶篇要讲透的三件事：

**角色一：生成者（Harvest agent）。** 每轮接收「已找到的清单」，被要求只产出**新增**条目。它的 schema 是一个数组（`items`），每项结构化——这正是第 07 章「数组模式」的应用。

**角色二：完整性批评者（Completeness agent）。** 它**不**生成新内容，只做一件事：判断「够了没有」。它的 schema 核心是 `done: boolean` 这个**门控字段**——`while (!done)` 直接读它来决定是否继续。

**角色三：循环本身（JS while）。** 这是 Workflow 的精髓——**控制流是真正的 JavaScript**。`while`、`round` 计数器、`found.push(...)` 都是普通代码。模型负责「判断」，代码负责「编排」，两者职责分明。

```mermaid
stateDiagram-v2
    [*] --> Harvest
    Harvest --> Critique: 生成新条目<br/>并入 found
    Critique --> CheckDone: 完整性 agent<br/>返回 { done, missing }
    CheckDone --> Harvest: done=false<br/>且 round<上限
    CheckDone --> Dry: done=true
    CheckDone --> Capped: round 达上限
    Dry --> [*]: 正常收口
    Capped --> [*]: 触顶兜底收口
```

<div class="callout tip">

**为什么把「生成」和「判完整」拆成两个 agent？** 同一个 agent 既生成又自评「够了没」，会回到第 17 章讲的自我评估陷阱——它刚生成完，倾向于说「够了」。拆成独立的完整性批评者（独立上下文、明确的「找遗漏」职责），判决才可信。**这与对抗验证同源：把评估者和被评估者分开。**

</div>

---

## 18.3 刹车：循环必须有界，这是纪律不是可选项

上一节的骨架里，`while` 条件是 `!done && round < 6`——那个 `round < 6` 不是装饰，是**安全带**。

「循环到干」最大的风险是**死循环**：如果完整性 agent 永远判 `done=false`（它可能总能「编」出一个看似遗漏的方向），循环就永不退出。而 Workflow 的每一轮都在真实地烧 token 和墙钟，失控的循环会迅速耗尽预算。

防失控必须**多重设防**：

**第一道：硬轮次上限。** `round < N`（如 6）。无论完整性 agent 怎么说，到顶就停。这是最简单也最可靠的刹车。

**第二道：budget 兜底。** 据 `_grounding.md`，`budget` 是**硬上限**——`spent()` 达 `total` 后再调 `agent()` 会抛错。所以即使你忘了设轮次上限，预算耗尽也会强制中止。更主动的做法是在循环里检查 `budget.remaining()`：

```javascript
// （示意，未实跑）—— 用 budget.remaining() 主动刹车
while (!done && round < 6) {
  // 估算单轮成本约 5 万 token（生成+批评两个 agent）；不够就提前收手
  if (budget.total !== null && budget.remaining() < 50_000) {
    log(`预算不足以再跑一轮（剩余 ${budget.remaining()}），提前收口`)
    break
  }
  round++
  // ... 生成 + 批评
}
```

**第三道：收益递减检测。** 如果连续两轮新增条目都是 0（或趋近 0），即便完整性 agent 嘴硬说还有遗漏，也可以主动退出——因为生成者已经榨不出东西了：

```javascript
// （示意，未实跑）—— 收益递减：连续空轮则停
let emptyStreak = 0
while (!done && round < 6) {
  round++
  const fresh = await agent(/* ... */)
  if (fresh.items.length === 0) {
    emptyStreak++
    if (emptyStreak >= 2) { log('连续两轮无新增，判定已干'); break }
  } else {
    emptyStreak = 0
    found.push(...fresh.items)
  }
  // ... 完整性批评
}
```

<div class="callout warn">

**永远不要写一个只靠模型判决退出的无界循环。** 模型的「done」是概率性的判断，可能因为它「想表现得彻底」而迟迟不给 done。`_grounding.md` 还给了一个全局兜底：单工作流生命周期 agent 总数上限 **1000**——这是最后的安全网，但你**绝不该**依赖它来终止业务循环。正确的纪律是：**每个循环都显式写出退出条件（轮次上限 + 收益递减），把 budget 当作最后防线，而不是唯一防线。**

</div>

---

## 18.4 完整性批评的两种形态：发散式 vs 收敛式

「完整性」在不同任务里含义不同，对应两种循环形态。

### 形态一：发散式——「还能找到更多吗」

这是 18.2 的形态：目标是**穷尽一个开放集合**（所有 bug、所有隐患、所有边界情况）。完整性 agent 的职责是「指出还有哪些**方向**没覆盖」。退出条件是「再也找不到新方向」。

典型场景：Bug 猎手（第 15 章）、安全隐患排查、测试用例枚举。这类任务**没有预先已知的『全集』**，只能靠反复逼问来逼近完整。

### 形态二：收敛式——「这份清单都核对过了吗」

另一种「完整」是**逐项核对一个已知清单**：比如「这份 spec 的每一条需求，代码都实现了吗」。这里全集是已知的（spec 条目），完整性 agent 的职责是**逐项打勾**，找出未满足项。

```javascript
// （示意，未实跑）—— 收敛式：逐项核对已知清单
const checklist = args.requirements   // 已知的需求清单
const review = await agent(
  `逐条核对以下需求是否在实现中被满足：\n${checklist.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n` +
  `对每一条给出 satisfied 布尔与证据。`,
  {
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              requirement: { type: 'string' },
              satisfied: { type: 'boolean' },
              evidence: { type: 'string' },
            },
            required: ['requirement', 'satisfied', 'evidence'],
          },
        },
      },
      required: ['items'],
    },
  }
)
const unmet = review.items.filter((i) => !i.satisfied)
// unmet 非空 → 进入修复循环；为空 → dry
```

收敛式往往不需要 `while` 反复榨取，而是「核对 → 修复未满足项 → 再核对」的闭环，直到 `unmet` 为空。**这正是 superpowers「spec 合规循环」的结构**（`_grounding.md` D 节）。

| | 发散式 | 收敛式 |
|---|---|---|
| 全集 | 未知，开放 | 已知（spec/清单） |
| 完整性 agent 职责 | 指出遗漏的**方向** | 逐项**打勾**找未满足 |
| 退出条件 | 找不到新方向（dry） | 未满足项清空 |
| 典型场景 | Bug 猎手、隐患枚举 | spec 合规、迁移核对 |

<div class="callout tip">

**两种形态可以串联。** 真实的质量门常常是：先**发散**地把所有问题找干（loop-until-dry），再对每个问题**对抗验证**（第 17 章）判真伪，最后**收敛**地核对「所有确认的问题是否都已修复」。三者组合，就是一条能自我纠错、又能自证完整的流水线。

</div>

---

## 18.5 生产骨架：找干 → 去重 → 验证 → 收口

把发散式找干与去重、验证组合，得到一个生产可用的完整骨架。注意循环到干会产生**重复或近似**的条目（不同轮次的生成者可能从不同角度提到同一个问题），所以收口前需要去重。

```javascript
// （示意，未实跑）—— 完整生产骨架
export const meta = {
  name: 'loop-until-dry-review',
  description: '反复榨取问题直到完整性 agent 判干，去重后逐项验证，收口',
  phases: [{ title: 'Harvest', detail: '循环到干' }, { title: 'Verify', detail: '逐项核验' }],
}

const MAX_ROUNDS = 6
let found = []
let done = false
let round = 0
let emptyStreak = 0

phase('Harvest')
while (!done && round < MAX_ROUNDS) {
  round++
  if (budget.total !== null && budget.remaining() < 60_000) {
    log(`预算告急，提前收口`); break
  }

  const fresh = await agent(
    `目标：${args.goal}\n已找到（勿重复）：\n` +
    `${found.map((f) => '- ' + f.title).join('\n') || '（暂无）'}\n只给新增条目。`,
    {
      label: `harvest:${round}`, phase: 'Harvest',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { title: { type: 'string' }, detail: { type: 'string' } },
              required: ['title', 'detail'],
            },
          },
        },
        required: ['items'],
      },
    }
  )

  if (fresh.items.length === 0) {
    if (++emptyStreak >= 2) { log('连续两轮无新增，判干'); break }
  } else {
    emptyStreak = 0
    found.push(...fresh.items)
  }

  const critique = await agent(
    `已找到：\n${found.map((f) => '- ' + f.title).join('\n')}\n` +
    `你是完整性审查员，确信无遗漏则 done=true，否则 done=false 并列出 missing。`,
    {
      label: `completeness:${round}`, phase: 'Harvest',
      schema: {
        type: 'object',
        properties: { done: { type: 'boolean' }, missing: { type: 'array', items: { type: 'string' } } },
        required: ['done', 'missing'],
      },
    }
  )
  done = critique.done
}

// 去重：用 title 归一化（小写去空格）做键
const seen = new Set()
const unique = found.filter((f) => {
  const key = f.title.toLowerCase().replace(/\s+/g, ' ').trim()
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
log(`找干结束：${round} 轮，原始 ${found.length} 条，去重后 ${unique.length} 条`)

// 逐项对抗验证（复用第 17 章的 verdictSchema 思想）
phase('Verify')
const verified = await pipeline(
  unique,
  (item) =>
    agent(
      `证伪以下论断，能给反例判 refuted，证据确凿判 confirmed，不足判 uncertain。\n` +
      `论断：${item.title}\n细节：${item.detail}`,
      {
        label: `verify:${item.title.slice(0, 20)}`, phase: 'Verify',
        schema: {
          type: 'object',
          properties: {
            verdict: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
            reasoning: { type: 'string' },
          },
          required: ['verdict', 'reasoning'],
        },
      }
    ).then((v) => ({ ...item, ...v }))
)

const confirmed = verified.filter(Boolean).filter((v) => v.verdict === 'confirmed')
return { rounds: round, total: unique.length, confirmed }
```

这个骨架把进阶篇前两章拧成了一股绳：**循环到干**（本章）保证「找全」，**对抗验证**（第 17 章）保证「找对」，中间用普通 JS 做**去重**。三者各司其职。

<div class="callout warn">

**去重为什么必须用代码做、而不是再开一个 agent？** 因为去重是一个**确定性**操作——同样的输入必然产生同样的输出。用 `Set` + 归一化键，零成本、可重放、无歧义。而如果你再开一个 agent「帮我去重」，不仅多烧 token，还引入了不确定性（模型可能漏判或误判重复）。**凡是能用确定性代码做的（去重、计数、过滤、排序、聚合），就不要交给 agent**——这是 Workflow「代码编排、模型判断」分工的核心纪律。

</div>

---

## 18.6 反模式与最佳实践速查

| 反模式 | 后果 | 正确做法 |
|---|---|---|
| 无界 `while`（只靠模型 done 退出） | 死循环，烧光预算 | 必加轮次上限 + 收益递减 + budget 兜底 |
| 生成者不知道「已找到什么」 | 反复产出重复条目 | 每轮把已有清单注入 prompt，要求只给新增 |
| 同一 agent 既生成又判完整 | 确认偏误，过早 done | 完整性批评必须是独立 agent |
| 用 agent 做去重/计数 | 浪费 token + 不确定 | 用 JS（Set/filter/reduce）做确定性操作 |
| 完整性判决用自由文本 | 无法驱动 while | `done: boolean` 门控字段 + `required` |
| 把 budget 当唯一刹车 | 退出时机不可控，体验差 | budget 是最后防线，业务退出靠显式条件 |
| 每轮全量重新生成 | token 随轮次平方增长 | 每轮只产**增量**，累积在 JS 数组里 |

<div class="callout info">

**成本直觉**：循环到干的 token 成本约等于「轮数 × 每轮（生成 + 批评两个 agent）」。参考真实单 agent 约 2.6 万 token（hello `wf_dacbd480-d5d`），一轮约 5 万、跑 4 轮约 20 万 token——与真实 pipeline-demo 的 `158982` 量级相当。所以轮次上限不只是防死循环，也是**成本闸门**：把它设在「边际收益已很低」的轮数（经验上 3–6 轮足以覆盖绝大多数发散任务）。

</div>

---

## 18.7 本章小结

- **循环到干（loop-until-dry）= 用 JS `while` 反复「生成增量 → 完整性批评」，直到判干。** 它突破了单次 `agent()` 「早早收手」的天花板，把「再想想」从 prompt 恳求变成代码循环。
- 三角色分工：**生成者**（每轮产新增条目，数组 schema）、**完整性批评者**（独立 agent，`done: boolean` 门控）、**循环本身**（真正的 JS while + 计数器）。
- **刹车是纪律**：必须多重设防——轮次硬上限、收益递减（连续空轮）、`budget.remaining()` 兜底。绝不写只靠模型判决退出的无界循环（全局 1000 agent 上限是安全网，不是业务退出机制）。
- 两种形态：**发散式**（穷尽未知开放集，找遗漏方向）与**收敛式**（逐项核对已知清单，找未满足项，对应 spec 合规循环）；可串联。
- 生产骨架把三章拧成一股：**循环到干**保证找全、**对抗验证**保证找对、**JS 去重**保证不重复——确定性操作交给代码，判断交给 agent。

下一章，我们处理一个并行写文件时绕不开的问题：当多个 agent 要同时修改代码，怎样让它们互不踩踏——`isolation: 'worktree'`。

> 继续阅读：[第 19 章 · Worktree 隔离](#/zh/p4-19)
