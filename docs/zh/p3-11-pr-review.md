# 第 11 章 · PR 多维 Review

> 一次像样的 Code Review，从来不是只看一个维度。安全工程师盯注入与 XSS，性能工程师盯阻塞与重排，可访问性专家盯焦点与对比度——他们**各看各的，互不干扰**，最后由一个人把所有意见**汇总、去重、排出修复顺序**。本章把这套人类协作搬进 Workflow：**parallel 多维度并发评审 → 一个 synthesize agent 综合成优先级清单**。贯穿案例是一次**真正的 dogfooding**——我们用这个配方审查了本书自己的前端 `index.html`，揪出 XSS、无焦点指示、重复 heading ID 等问题，并据此**真实修复了 16 项**。

---

## 11.1 配方动机

第 10 章的「分片代码审查」解决的是**单一维度、规模太大**的问题：一个 diff 几千行，切成片让多个 agent 分头看。本章解决的是**正交问题**——**同一份代码，多个维度**。

为什么不能让一个 agent「把所有维度一起看」？三个现实原因：

- **注意力稀释**。让同一个 agent 同时盯安全、性能、可访问性，它倾向于每个维度都浅尝辄止，给你一份「看起来全面、其实哪个都不深」的清单。把维度**拆给独立 agent**，每个 agent 带着单一视角深挖，发现密度显著更高。
- **天然可并发**。a11y 评审不依赖性能评审的结论，三个维度互不相关——这正是 `parallel()` 屏障的**教科书场景**：并发跑完，一起收。
- **汇总是一道独立工序**。三个维度各自产出的发现会**重叠**（比如「CDN 脚本阻塞渲染」既是性能问题、也可能被 a11y 评审顺带提到），也需要**跨维度排优先级**（一个 CRITICAL 的 XSS 必须排在一个 LOW 的文案问题前面）。这道「去重 + 排序」的工序，需要**一个能看到全部发现的 agent**来做——所以它必须在并发屏障**之后**。

于是配方是一个干净的两阶段结构：

```mermaid
flowchart TB
  subgraph R["① Review — parallel 屏障"]
    direction TB
    a["review:a11y<br/>可访问性视角"] --> B{{"屏障：等三维全部完成"}}
    p["review:perf<br/>性能视角"] --> B
    c["review:correct<br/>正确性视角"] --> B
  end
  B --> all["flatten + 打 dim 标签<br/>26 条原始发现"]
  all --> S["② Synthesize<br/>去重 · 按严重度排序 · 优先级清单"]
  S --> out["16 个问题<br/>1–5 阻断 / 6–11 建议 / 12–16 打磨"]
```

<div class="callout info">

**为什么这里该用屏障（`parallel`）而不是 `pipeline`？** 回顾第 08 章的判据：**多阶段默认 pipeline，只有当下一阶段需要前一阶段「全部」item 的结果时才用屏障。** synthesize 要做**全局去重和跨维度排序**——它必须等三个维度**都**交卷才能动手。这正是第 08 章列举的「正确使用屏障的真实形态：去重」。

</div>

---

## 11.2 完整脚本

**（依据 transcript 骨架补全的示意脚本，未逐字实跑；本次真实运行的 Run ID 与用量见 11.3。）** 下面是这次真实运行的脚本骨架（结构与 `assets/transcripts/frontend-review.md` 一致）。transcript 中三个维度的 `prompt` 与 synthesize 的 schema 以 `...`/`{...}` 省略，此处**补全为可直接运行的形态**并逐处标注「（示意补全）」；真实存在于 transcript 的部分（`meta`、`FINDINGS`、`parallel` 评审与 flatten、synthesize 调用、`return`）保持原样。

```javascript
export const meta = {
  name: 'frontend-review',
  description: 'Multi-dimension review of index.html: a11y, performance, correctness',
  phases: [{ title: 'Review' }, { title: 'Synthesize' }],
}

const FILE = '/abs/path/to/index.html'  // 被评审的真实文件

// 所有维度共用同一套发现 schema：严重度 + 标题 + 细节 + 修复建议
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'title', 'detail', 'fix'],
      },
    },
  },
  required: ['findings'],
}

// 三个正交维度，每个带各自的视角化 prompt（示意补全：transcript 中以 ... 省略）
const dims = [
  {
    key: 'a11y',
    prompt:
      `You are an accessibility (a11y) reviewer. Read ${FILE} and find WCAG / keyboard / ` +
      `screen-reader / focus / contrast / landmark issues. Be specific with selectors and WCAG refs.`,
  },
  {
    key: 'perf',
    prompt:
      `You are a web performance reviewer. Read ${FILE} and find render-blocking resources, ` +
      `layout thrash, unthrottled handlers, oversized/eager assets, main-thread work. Be specific.`,
  },
  {
    key: 'correct',
    prompt:
      `You are a correctness/security reviewer. Read ${FILE} and find XSS sinks, race conditions, ` +
      `state desync, missing error handling, logic bugs. Be specific and show the offending code.`,
  },
]

phase('Review')
// 三维并发评审：每条 thunk 跑一个 agent，schema 强制结构化发现，再打上 dim 标签
const reviews = await parallel(
  dims.map((d) => () =>
    agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS })
      .then((r) => ({ dim: d.key, findings: (r && r.findings) || [] }))
  )
)
// 屏障释放后：过滤掉挂掉的维度，摊平成一条扁平发现流，每条带 dim 来源
const all = reviews.filter(Boolean).flatMap((r) => r.findings.map((f) => ({ ...f, dim: r.dim })))

phase('Synthesize')
// 综合 agent 看到全部发现：去重、按严重度排序、给出可执行的优先级清单
const SUMMARY = {  // 示意补全：transcript 中以 {...} 省略
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rank: { type: 'number' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          title: { type: 'string' },
          action: { type: 'string' },
          dims: { type: 'array', items: { type: 'string' } },  // 该问题被哪些维度命中
        },
        required: ['rank', 'severity', 'title', 'action'],
      },
    },
    blockers: { type: 'array', items: { type: 'number' } },  // 上线阻断项的 rank
  },
  required: ['issues'],
}
const summary = await agent(
  `These are ${all.length} findings (JSON): ${JSON.stringify(all)}. ` +
    `Dedup across dimensions, rank by severity, and produce a prioritized action list. ` +
    `Mark which ranks are release blockers.`,
  { label: 'synthesize', phase: 'Synthesize', schema: SUMMARY }
)

const byDimension = dims.reduce(
  (acc, d) => ({ ...acc, [d.key]: all.filter((f) => f.dim === d.key).length }),
  {}
)
return { rawCount: all.length, byDimension, ...summary }
```

三个值得记住的写法：

- **`schema` 复用**。三个维度共用同一个 `FINDINGS` schema——这保证不同视角的产出**结构齐整**，synthesize 阶段才能把它们当成同质数据流处理。schema 的强约束细节见第 07 章。
- **`.then()` 打标签**。每个评审 agent 返回后立刻 `.then((r) => ({ dim, findings }))`，把「这条发现来自哪个维度」**穿线**进结果。这正是第 08 章讲的 `.then()` 合并上下文惯用法。
- **`opts.phase` 显式归组**。在 `parallel` 内部，每个 `agent()` 都显式带 `phase: 'Review'`——避免并发的 agent 竞争全局 `phase()`（第 08/05 章的进度归组陷阱）。

---

## 11.3 真实运行结果

> **真实运行**：Run ID `wf_4c5caabb-b73`，Task ID `wss21eu0x`。原始记录见 `assets/transcripts/frontend-review.md`。
> 真实用量：`agent_count=4`（3 评审 + 1 综合）｜ `tool_uses=13` ｜ `total_tokens=221648` ｜ `duration_ms=272643`（约 4.5 分钟）。

### 从 26 条原始发现到 16 个问题

三个维度并发交卷，共产出 **rawCount = 26** 条原始发现：

| 维度 | 原始发现数 |
|---|---|
| a11y（可访问性） | 10 |
| perf（性能） | 6 |
| correct（正确性/安全） | 10 |
| **合计** | **26** |

synthesize agent 看到全部 26 条后，**跨维度去重并按严重度排序**，收敛成 **16 个明确问题**，并给出三档修复顺序：**1–5 上线阻断项、6–11 强烈建议、12–16 打磨**。

<div class="callout tip">

**26 → 16 这一步就是 synthesize 的全部价值。** 10 条 a11y 发现里，「无焦点指示」和「焦点不可见」其实是同一回事；perf 的「CDN 阻塞」和 correct 顺带提的「脚本加载方式」也有重叠。一个能看到**全部** 26 条的 agent，才能把它们合并、并判定「XSS 排第 1、文案问题排第 13」。这是单个维度评审 agent **做不到**的——它只看见自己那一摊。

</div>

### 上线阻断项（synthesize 真实判定的 top 5）

这是综合 agent 排出的、必须先修的 5 项（均为真实产出，节选其判定与修复建议）：

| # | 严重度 | 问题 | 真实判定与修复 |
|---|---|---|---|
| 1 | CRITICAL | **DOM XSS** | `marked.parse()` 结果直接 `innerHTML`；marked v12 无内置消毒（v5 起移除），`gfm:true` 放行原始内联 HTML → 同源 `.md` 里的 `<img onerror>` 会执行脚本。**修**：引入 DOMPurify 包裹；mermaid 错误回退也要转义 `&`/`"` 而非仅 `<`。 |
| 2 | CRITICAL | **无焦点指示** | 全局 `button{border:none}` 抹掉 outline，全表无一条 `:focus-visible` → 整页可 Tab 但焦点不可见（WCAG 2.4.7）。**修**：加 `:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`。 |
| 3 | HIGH | **重复 heading ID** | `enhance()` 纯按文本生成 id 且不去重 → 重复标题碰撞，TOC/锚点恒跳到第一个；空/纯标点标题 → `id=''`。**修**：每次渲染用 slugger 去重 + 空值兜底 `section-<i>`。 |
| 4 | HIGH | **异步渲染竞态** | `renderChapter()` 的 `fetch` 无取消，快速 A→B 导航会让 A 的响应晚到覆盖 B。**修**：单调 `routeSeq` 令牌，await 后校验。 |
| 5 | HIGH | **强调橙对比度不足** | 链接/内联 code/激活导航等多处 < 4.5:1（WCAG 1.4.3）。**修**：文本用色加深（≥`#B8430F`），大字/进度条保留亮橙。 |

<div class="callout warn">

**注意第 3 项的来龙去脉。** 这个「重复 heading ID + 空值兜底」问题，与第 12 章 GCF 配方在 `slugify` 上揪出的教训**同源**——都是「按文本生成 id 不去重、不处理空/astral 字符」。两次独立的 Workflow 运行（一次 GCF 推演 slugify、一次本章多维评审真实文件）指向同一个 bug 类，最终一起落地到 `index.html` 的 heading-ID 生成逻辑里。**这就是 dogfooding 的复利**：配方跑得越多，越能交叉印证同一类缺陷。

</div>

### 强烈建议与打磨（6–16，节选）

- **6**（perf）：三个 CDN 脚本渲染阻塞 + mermaid（~500KB）在无图首页也加载 + `highlightAuto` 跑主线程 → `defer`、按需懒加载、加 `preconnect`。
- **7**（perf）：未节流的 scroll handler 每帧 2× `querySelectorAll` + 每标题 `getBoundingClientRect` → rAF 节流 + 缓存 NodeList + `IntersectionObserver`。
- **9**（a11y）：移动抽屉无 `aria-expanded`/Esc/焦点管理；关闭态侧栏链接仍可 Tab。
- **11**（correct）：Copy 按钮假定 `navigator.clipboard` 存在且无 `.catch` → `file://`、不安全 http 下抛错/静默。
- **12–16**：语言偏好 desync、动态内容未暴露给 AT、缺 `prefers-reduced-motion`、锚点无意义 a11y 名、manifest 无错误处理等打磨项。

### 评审产物如何直接驱动修复

这次运行**不是演示**——它的产物是一份**可执行的修复工单**：

```mermaid
flowchart LR
  W["Workflow 返回<br/>{rawCount:26, issues:[16 项,带 rank/severity/action]}"]
  W --> B1["阻断项 1–5<br/>先修，逐条对照 action 落地"]
  W --> B2["建议 6–11<br/>同一轮跟进"]
  W --> B3["打磨 12–16<br/>排期处理"]
  B1 --> H["16 项全部落地到 index.html<br/>（详见 git 历史）"]
  B2 --> H
  B3 --> H
```

之所以能「直接驱动」，关键在 schema：每个 issue 都带 `rank`（修复顺序）、`severity`（紧急度）、`action`（具体怎么改）。这不是一段「读起来挺全面」的散文，而是**结构化、可逐条勾选**的清单——人或下游 agent 都能照着改。这 16 项**已逐条落地**到本书前端 `index.html`。

---

## 11.4 设计要点

**① 维度即视角，且可自由替换。** 本例用了 a11y / perf / correctness 三维，但维度集合**完全是你定义的**。把 `dims` 数组换成下面任意一组，脚本主体一行都不用改：

| 评审场景 | 建议维度 |
|---|---|
| 后端 PR | 安全（注入/认证）· 并发（竞态/死锁）· 错误处理 · API 契约 |
| 前端 PR（本章） | 可访问性 · 性能 · 正确性/安全 |
| 数据管道 | 正确性 · 幂等性 · 可观测性 · 成本 |
| 文档 PR | 准确性 · 完整性 · 一致性 · 可读性 |

维度的**正交性**越强（彼此越不重叠），并发收益和发现密度越高。

**② 用统一 schema 约束所有维度。** 不同视角产出**同构**的 `{severity, title, detail, fix}`，是 synthesize 能把它们当成单一数据流处理的前提。若每个维度各返回各的格式，综合阶段就得先做一轮格式归一——白白增加复杂度和出错面。

**③ synthesize 必须在屏障之后、且看到全部发现。** 把 `JSON.stringify(all)` 整个喂给综合 agent，让它**全局**去重和排序。这与第 12 章 GCF 的「Fix 逐条对账」异曲同工：**给后置 agent 完整上下文，它才能做出全局最优决策**。

**④ 给发现「打来源标签」，让综合可解释。** 每条发现带 `dim` 字段、最终 issue 带 `dims` 数组——这样你能回答「这条是谁提的」「哪些是被多个维度同时命中的（往往更该优先）」。可观测性不只对生产代码重要，对**评审产物本身**也重要。

<div class="callout tip">

**成本直觉**：`agent_count=4`，`total_tokens≈221K`，符合第 08 章的经验法则（token ≈ agent 数 × 每 agent 上下文）。注意这次单 agent 上下文偏高（≈55K/agent），因为每个评审 agent 都**真实读取了整个 `index.html`**——读文件的 token 进了上下文。维度越多、被评文件越大，成本越高，但**墙钟不随维度数线性增长**（屏障下，3 个维度只花「最慢的那个」的时间）。

</div>

---

## 11.5 变体

<div class="callout info">

**变体 A · 评审 → 验证 → 综合（三阶段）**：在 Review 和 Synthesize 之间插一个「对抗验证」阶段，让独立 agent 逐条确认每个发现**真的成立**（剔除误报），再综合。此时前两阶段可改用 `pipeline`（每条发现独立流过「提出→验证」），最后一个屏障做综合。详见第 17 章对抗验证。

**变体 B · 多文件 PR**：真实 PR 往往改了多个文件。用 `pipeline(files, reviewAllDims, synthesizePerFile)` 让每个文件独立流过「多维评审 → 单文件综合」，最后再加一个跨文件的总综合。注意每个文件的多维评审内部仍是 `parallel`——这是 `pipeline` 套 `parallel` 的常见组合。

**变体 C · 维度加权计分**：不止排序，给每个维度配权重（如安全 ×3、文案 ×1），让 synthesize 产出一个量化的「PR 健康分」，用于 CI 门禁——低于阈值则阻断合并。这把本章的「优先级清单」升级成「可自动化的质量闸」。

**变体 D · 评审 + 自动修复**：把本章（产出工单）与第 12 章 GCF（据工单修复）串成嵌套 Workflow（第 20 章）——上层评审产出 issues，下层对每个 issue 跑「修复 → 验证」。即「评审产物直接驱动修复」的全自动版。

</div>

---

## 11.6 本章小结

- PR 多维 Review = **parallel 多维度并发评审**（每维一个独立视角的 agent）+ **一个 synthesize agent 综合去重排优先级**。
- 用屏障（`parallel`）而非 `pipeline`：因为综合阶段需要**全部**维度的发现才能做全局去重和排序——这是第 08 章「正确使用屏障」的真实形态。
- 真实运行（dogfooding 本书前端 `index.html`）：`agent_count=4`、`total_tokens=221648`、`duration_ms=272643`；**26 条原始发现 → 16 个问题**，top 5 含 DOM XSS、无焦点指示、重复 heading ID 等，**16 项已全部真实落地修复**。
- 关键：维度**正交且可替换**、用**统一 schema** 约束、综合 agent 看**全部发现**、给发现**打来源标签**让结果可解释。
- 评审产物因为是**结构化工单**（带 rank/severity/action），能**直接驱动修复**，而非一段读完即忘的散文。

下一章我们换一种协作形态：不再是「多视角看同一份代码」，而是「一个写、一个挑刺、一个据刺重写」的**生成-批评-修复循环**。

> 继续阅读：[第 12 章 · 生成-批评-修复循环](#/zh/p3-12)
