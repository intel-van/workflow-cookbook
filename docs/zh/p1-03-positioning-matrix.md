# 第 03 章 · 定位矩阵：五种扩展机制

> 上一章我们论证了「为什么需要确定性编排」。但 Workflow 并不是孤岛——它落在一个早已热闹的生态里：Subagents、Agent Teams、Skills、MCP，各有各的活儿。
>
> 初学者最大的困惑不是「Workflow 怎么用」，而是「**这么多机制，到底什么时候用哪个？它们会不会打架？**」这一章我们用一张定位矩阵把边界焊清楚，再告诉你一个更重要的事实：**它们是正交的、可组合的**——理解了边界，你才能把它们叠起来用。

---

## 3.1 五个名字，五个不同的问题

先把五个主角摆上台，每个用一句话点出它**回答的是哪个问题**。请记住这五个问题，它们是整章的骨架：

| 机制 | 它回答的问题 | 一句话定位 |
|---|---|---|
| **Subagents** | 「这一件事，能不能**派一个分身**去干、把结果拿回来？」 | 一次性 fork 出一个子 Agent，返回文本 |
| **Workflow** | 「**许多个**分身，按什么顺序/并行/验证地干？」 | 用代码**确定性地编排**多个 subagent |
| **Agent Teams** | 「一群分身能不能**像团队一样长期协作、互相喊话**？」 | 有状态、可通信、长期协作的多 Agent |
| **Skills** | 「干这件事需要的**专门知识**，怎么按需喂给 Agent？」 | 按需注入的提示词知识包 |
| **MCP** | 「Agent 怎么**连上外部的工具和数据**？」 | 连接外部工具/数据源的协议 |

这五个问题分属三个完全不同的层面，先建立这个宏观直觉，细节随后展开：

```mermaid
flowchart TD
    subgraph Orchestration["编排层：谁、按什么顺序干"]
        SA["Subagents<br/>一个分身"]
        WF["Workflow<br/>确定性编排多个"]
        AT["Agent Teams<br/>有状态团队协作"]
    end
    subgraph Cognition["认知层：Agent 怎么想"]
        SK["Skills<br/>注入知识"]
    end
    subgraph Connectivity["连接层：Agent 够得着什么"]
        MCP["MCP<br/>连外部工具/数据"]
    end
    style Orchestration fill:#eef
    style Cognition fill:#efe
    style Connectivity fill:#fee
```

<div class="callout info">

**为什么先分三层？** 因为「编排层」内部（Subagents / Workflow / Agent Teams）才是真正容易混淆、需要二选一的地方；而 Skills（认知层）和 MCP（连接层）跟它们**根本不在一个维度**，谈不上「二选一」——它们是叠加上去的。先把层分清，后面的取舍才不会拧巴。

</div>

---

## 3.2 Subagents：一次性的分身

### 它是什么

Subagent 是最基础的单位：**主循环 fork 出一个子 Agent，给它一段任务，它独立跑完，返回一段文本结果。** 在 Claude Code 里，你平时用 Task 工具派出去的那个「子任务」，本质就是一个 subagent。

它的特征非常鲜明：

- **一次性**：派出去、跑完、返回、结束。它不记得上一个 subagent 干了什么，下一个 subagent 也不知道它存在。
- **隔离上下文**：它有自己独立的上下文窗口，这正是它的价值——脏活累活在它那边干，原始材料不必塞回主循环（呼应第 02 章墙①）。
- **返回文本**：它交回来的是一段文字。

### 它和 Workflow 的关系：原子 vs 分子

这是最需要厘清的一对关系，因为 **Workflow 的 `agent()` 派发的，正是一个 subagent**。

可以这样理解：

> **Subagent 是「原子」，Workflow 是「分子」。** 单独一个 subagent 解决「派一个分身干一件事」；Workflow 用**代码**把许多 subagent 组装成结构——并行、流水线、循环、验证、汇总。

第 01 章那个 `hello-workflow` 只派了**一个** agent——那时 Workflow 退化成「就是一个 subagent」，没体现出编排价值。真正的威力在 `parallel` / `pipeline` 把 3 个、6 个、几十个 subagent 编排起来时才显现（回看第 02 章的真实数据：parallel 3 个、pipeline 6 个 agent）。

```mermaid
flowchart LR
    subgraph SubAlone["单独用 Subagent"]
        M1[主循环] -->|Task| S1[一个 subagent]
        S1 -->|文本| M1
    end
    subgraph InWorkflow["在 Workflow 中"]
        WF[Workflow 脚本] -->|agent| s1[subagent]
        WF -->|agent| s2[subagent]
        WF -->|agent| s3[subagent]
        s1 & s2 & s3 -->|结构化产物| WF
    end
    style SubAlone fill:#fef
    style InWorkflow fill:#eef
```

<div class="callout tip">

**什么时候只用 Subagent、不用 Workflow？** 当你只需要**派一个分身干一件相对独立的活**——「帮我把这个目录探索一下并总结」「读这份长文档抽取要点」。一个 Task 子任务就够了，套个 Workflow 是杀鸡用牛刀。**当分身变成「多个」且它们之间有「顺序 / 并行 / 依赖 / 验证」关系时，才升级到 Workflow。**

</div>

---

## 3.3 Agent Teams：有状态的协作团队

### 它是什么

Agent Teams 由实验性标志 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 门控（本书写作的会话环境中**该标志已开启**，与 `CLAUDE_CODE_WORKFLOWS=1` 并存——见 `_grounding.md` A 节实测）。它是一种**根本不同的协作范式**：

> 一组 Agent 组成**团队**，**有状态**、**可以互相通信**、进行**长期协作**。它们不是「派出去就结束」，而是像一个真实团队那样持续在场，通过消息互相喊话、分工、协调。

<div class="callout info">

**你正在见证它。** 本书的写作本身就跑在 Agent Teams 上——你读到的这一章，是「织经」写作团队里一个特约作者 Agent 完成的，它通过消息机制与 team-lead 协调任务、汇报进度。这种「有状态 + 互相通信 + 长期在场」的体感，正是 Agent Teams 与一次性 subagent 的本质差别。

</div>

### 它和 Workflow 的关系：有状态团队 vs 无状态流水线

这是另一对**极易混淆**的概念，因为两者都「涉及多个 Agent」。但它们的内核截然相反：

| 维度 | **Agent Teams** | **Workflow** |
|---|---|---|
| 状态 | **有状态**——成员持续在场，记得上下文 | **无状态**——脚本跑完即结束，不留团队 |
| 通信 | 成员之间**可互相通信**、喊话、协商 | subagent 之间**不通信**，只通过脚本变量传值 |
| 时间性 | **长期协作**，可持续多轮 | **一次性**流水线，一跑到底 |
| 控制方式 | 涌现式——成员各自决策、动态协调 | **确定性**——由代码精确规定顺序与并行 |
| 可复现性 | 协作过程依赖运行时动态，不保证复现 | 同脚本 + 同 args → 可复现（甚至缓存命中） |

一句话切开：

> **Agent Teams 像一个『长期在职、随时沟通』的项目组**；**Workflow 像一条『按图纸一次性跑完、不留人』的自动化流水线**。

```mermaid
flowchart TD
    subgraph Teams["Agent Teams：有状态团队"]
        direction LR
        L((Lead))
        A((成员A))
        B((成员B))
        L <-->|消息| A
        L <-->|消息| B
        A <-->|消息| B
        Note1["持续在场 · 互相通信 · 长期协作"]
    end
    subgraph WF["Workflow：无状态流水线"]
        direction LR
        s1[stage1] --> s2[stage2] --> s3[stage3]
        Note2["一次跑完 · 不通信 · 确定可复现"]
    end
    style Teams fill:#fff3e0
    style WF fill:#e8f5e9
```

### 怎么选

- **选 Workflow**：任务能画成一张「先做什么 → 再做什么 → 哪些并行」的**固定流程图**，且你想要**可复现、可测试、可分享**。比如「分片审查 → 对抗复核 → 汇总」。
- **选 Agent Teams**：任务**开放、需要随机应变、成员要边干边商量**，且没有一张事先画死的流程图。比如「几个角色围绕一个模糊需求持续讨论、动态分工地推进」（就像本书的写作）。

<div class="callout warn">

**不要把 Agent Teams 的开放协作硬塞进 Workflow。** 如果你的任务里充满「视情况而定」「成员之间要边干边对齐」，强行用确定性脚本编排会很别扭——那是 Agent Teams 的主场。反过来，一个形状固定、追求复现的流水线，用 Agent Teams 去跑则浪费了「有状态团队」的能力，还失去了确定性。**边界就是这句话：流程图能画死 → Workflow；要随机应变 → Agent Teams。**

</div>

---

## 3.4 Skills：注入的知识，改变 Agent「怎么想」

### 它是什么

Skills 是**按需注入的提示词知识包**。当某种任务出现，对应的 Skill 把一套专门知识（领域规范、方法论、最佳实践、操作步骤）**注入到 Agent 的上下文里**，从而改变它「**怎么想**」这件事。

注意这个动词——Skill 改变的是 Agent 的**认知**，不是它的**控制流**。它让 Agent「懂得多一点、想得专业一点」，但**不决定**「先做什么、后做什么」。

### 它和 Workflow 的关系：怎么想 vs 怎么排

这一对是**正交**的典范，第 01 章已点过这句话，这里讲透：

> **Skills 决定 Agent「怎么想」（认知）；Workflow 决定「按什么顺序做」（控制流）。** 一个管脑子里的知识，一个管步骤的衔接——它们在两个不同的轴上，根本不冲突。

正因为正交，它们**可以叠加**。`agent()` 有一个 `agentType` 选项（`_grounding.md` B 节），可以指定 subagent 使用某种自定义类型（如 `'Explore'`、`'code-reviewer'`）；而一个具备特定 skill 的 Agent，在 Workflow 的某个步骤里被派出去时，**既受 Workflow 的控制流编排，又带着 skill 注入的知识去思考**。

```mermaid
flowchart LR
    WF["Workflow<br/>（控制流：怎么排）"] -->|agent, 第2步| Step["一个 subagent"]
    SK["Skill<br/>（认知：怎么想）"] -.注入知识.-> Step
    Step -->|带着专业知识、<br/>在既定步骤里执行| Out["结构化产物"]
    style WF fill:#eef
    style SK fill:#efe
```

<div class="callout tip">

**类比：** Workflow 是**剧本**（规定第几幕、谁先上场、几条线并行）；Skill 是**演员的专业训练**（让演员演医生时真懂医学术语）。剧本不会因为演员更专业就改变幕次，演员也不会因为剧本固定就忘了专业——两者各管一摊，合起来才是一场好戏。

</div>

---

## 3.5 MCP：连接外部世界的协议

### 它是什么

MCP（Model Context Protocol）是**连接外部工具和数据源的协议**。它让 Agent 能够够得着「自己之外」的东西——一个数据库、一个搜索引擎、一个浏览器、一个公司内部 API。第 01 章已明确：**MCP 是连接外部工具/数据源的协议；Workflow 是编排内部 subagent 的引擎。**

### 它和 Workflow 的关系：对外连接 vs 对内编排

这一对几乎不可能真正混淆，但值得用一句话锚定方向：

> **MCP 是『向外』的——把 Agent 连到外部世界；Workflow 是『向内』的——把内部的 subagent 编排起来。** 一个解决「够得着什么」，一个解决「怎么组织自己人」。

它们同样**可组合**：Workflow 里的某个 subagent，完全可以在执行它那一步时，调用一个 MCP 工具去抓外部数据，再把结果作为结构化产物交回流水线。比如一个「深度研究」流水线（第 13 章），其中的「检索」步骤就可能让 subagent 通过 MCP 调用搜索引擎。

```mermaid
flowchart LR
    subgraph Inside["Workflow：对内编排"]
        WF[流水线] -->|agent| St[检索步骤 subagent]
    end
    St -->|经 MCP 协议| Ext[(外部世界<br/>搜索引擎 / DB / API)]
    Ext -->|数据| St
    St -->|结构化产物| WF
    style Inside fill:#eef
    style Ext fill:#fee
```

---

## 3.6 决策矩阵：一表厘清五种机制

把五个机制按几个关键维度横向铺开，这是本章的核心速查表：

| 维度 | Subagents | **Workflow** | Agent Teams | Skills | MCP |
|---|---|---|---|---|---|
| **解决什么** | 派一个分身干活 | **确定性编排多个 subagent** | 有状态团队长期协作 | 注入领域知识 | 连接外部工具/数据 |
| **所属层面** | 编排层 | **编排层** | 编排层 | 认知层 | 连接层 |
| **Agent 数量** | 一个 | **多个** | 多个 | 不涉及 | 不涉及 |
| **状态** | 一次性 | **无状态** | 有状态 | 注入即生效 | 连接态 |
| **成员间通信** | 无 | **无（靠脚本变量传值）** | 有 | 不适用 | 不适用 |
| **控制方式** | 主循环直接派 | **确定性代码** | 涌现式协调 | 提示词注入 | 协议调用 |
| **可复现** | 单次 | **是（同脚本+args 可缓存）** | 否 | 是（知识固定） | 取决于外部 |
| **门控标志** | 内置 | `CLAUDE_CODE_WORKFLOWS` | `..._AGENT_TEAMS` | 内置/技能系统 | MCP 配置 |
| **典型场景** | 探索/总结一件事 | **分片审查、对抗验证、流水线** | 开放式多角色协作 | 给某步注入专业规范 | 抓外部数据 |

> 表中 `CLAUDE_CODE_WORKFLOWS` 与 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 两个标志，本书写作会话中均经实测确认存在（`_grounding.md` A 节）。

---

## 3.7 决策流程图：到底该用哪个

把上面的取舍编成一棵决策树。遇到一个任务，从顶上往下走，落到哪个叶子就用哪个机制：

```mermaid
flowchart TD
    Start{"我要解决<br/>什么问题？"}

    Start -->|"我要连外部<br/>工具/数据"| MCP["用 MCP<br/>（可叠加在任意机制上）"]
    Start -->|"我要给 Agent<br/>注入专业知识"| SK["用 Skill<br/>（可叠加在任意机制上）"]
    Start -->|"我要让 Agent<br/>干活（编排层）"| Q1{"涉及<br/>几个 Agent？"}

    Q1 -->|"就一个"| SA["用 Subagent<br/>（一个 Task）"]
    Q1 -->|"多个"| Q2{"能画成固定流程图<br/>（先A后B、哪些并行）吗？"}

    Q2 -->|"能，且要<br/>可复现/可测试/可分享"| WF["用 Workflow"]
    Q2 -->|"不能，要开放协作、<br/>边干边商量"| AT["用 Agent Teams"]

    style WF fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style AT fill:#ffe0b2,stroke:#f57c00
    style SA fill:#e1bee7,stroke:#8e24aa
    style SK fill:#b3e5fc,stroke:#0288d1
    style MCP fill:#ffcdd2,stroke:#e53935
```

这棵树的关键分叉，是最后那一道判断——**「能不能画成固定流程图」**：

- **能画死** → Workflow。比如「五维审查 → 逐条复核 → 去重汇总」，每一步都明确，顺序和并行都确定。
- **画不死** → Agent Teams。比如「几个角色围绕一个模糊目标持续讨论、视进展动态分工」。

<div class="callout warn">

**最常见的两个误判，记牢：**

1. **「多个 Agent」就立刻想到 Agent Teams** —— 错。多个 Agent 但**流程固定**，该用 Workflow。Agent Teams 的门票是「需要有状态地互相通信、随机应变」。
2. **「Workflow / Skill / MCP 三选一」** —— 错。它们不在一个维度上，**根本不是互斥关系**。一个 Workflow 步骤里的 subagent，完全可以同时带着 Skill 的知识、调用 MCP 的工具。下一节专讲这个。

</div>

---

## 3.8 诚实地说：它们是正交的、可组合的

前面为了讲清边界，把五个机制「切开」来谈。但真实世界里最强的用法，恰恰是**把它们叠起来**。这一节必须诚实地补上：**这些机制不是竞争关系，而是正交、可组合的**——理解边界是为了更好地组合，不是为了二选一。

Workflow 处在编排层的中心，它天然就是其他机制的**载体**：

```mermaid
flowchart TD
    WF["Workflow<br/>（确定性编排骨架）"]
    WF -->|"agentType 调用<br/>自定义 agent"| C1["某步用专门的<br/>code-reviewer subagent"]
    WF -->|"步骤内 agent<br/>触发 Skill"| C2["该 agent 带着<br/>领域知识思考"]
    WF -->|"步骤内 agent<br/>调用 MCP"| C3["该 agent 抓<br/>外部数据"]
    WF -->|"workflow() 内联<br/>调用子工作流"| C4["复用另一个<br/>已沉淀的 Workflow"]
    style WF fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
```

具体的组合点，都有 API 依据（`_grounding.md` B 节）：

- **Workflow + 自定义 Agent**：`agent()` 的 `agentType` 选项可指定 subagent 类型（如 `'Explore'`、`'code-reviewer'`），且**可与 schema 组合**——既用专门 agent，又强制结构化输出。
- **Workflow + Skill**：被 Workflow 派出去的 subagent，在它那一步执行时可以触发 / 携带 skill 的知识——Workflow 管「这一步什么时候做」，skill 管「这一步怎么想得专业」。
- **Workflow + MCP**：流水线里的某个 subagent 在执行时通过 MCP 够到外部数据（如「深度研究」的检索步骤）。
- **Workflow + Workflow**：`workflow(name, args?)` 可内联调用另一个已沉淀的具名工作流（**嵌套仅一层**，子工作流里再调会抛错），让验证过的流水线成为可复用积木——这是第五部「构建你自己的库」与第 20 章「嵌套 Workflow」的基础。

一句话收束这个组合观：

> **Workflow 是编排层的『骨架』；Skill 给骨架上的每个关节注入『专业判断』，MCP 让关节够得着『外部世界』，自定义 agentType 让关节是『对口的专家』。** 它们不抢戏，它们合演。

<div class="callout tip">

**这正是「织经」隐喻在生态层面的回响。** Workflow 是经线（确定的结构骨架），而 Skill / MCP / 自定义 agent 是穿梭其间的纬线（每一步的智能与连接）。经定其形，纬成其华——五种机制不是五选一的单选题，而是一套可以经纬交织的工具箱。

</div>

---

## 3.9 本章小结

- 五种扩展机制分属三层：**编排层**（Subagents / Workflow / Agent Teams）、**认知层**（Skills）、**连接层**（MCP）。容易混淆、需要取舍的，只在编排层内部。
- **Subagents vs Workflow**：原子 vs 分子。一个分身 → Subagent；多个分身要按顺序/并行/验证地组织 → Workflow。
- **Workflow vs Agent Teams**：无状态确定性流水线 vs 有状态可通信团队。**流程图能画死 → Workflow；要开放协作、随机应变 → Agent Teams**。两个标志（`CLAUDE_CODE_WORKFLOWS`、`..._AGENT_TEAMS`）本机均已开启。
- **Skills**（怎么想）与 **MCP**（够得着什么）跟 Workflow（按什么顺序做）**正交**，谈不上二选一——它们是叠加上去的。
- 最强用法是**组合**：Workflow 作骨架，用 `agentType` 调专家 agent、步骤内 agent 触发 skill / 调 MCP、`workflow()` 内联复用子流程（嵌套仅一层）。
- 一句话边界：**能画成「先做什么 → 再做什么 → 哪些并行」的流程图，就用 Workflow；开放式对话、随机应变，则不是它的主场。**

至此，认知篇三章铺完：你知道了 Workflow **是什么**（第 01 章）、**为什么需要它**（第 02 章）、以及它在生态里的**位置**（本章）。接下来进入第二部「基础篇」，我们卷起袖子，从零跑通第一个真正属于你的 Workflow。

> 继续阅读：[第 04 章 · 第一个 Workflow](#/zh/p2-04)
