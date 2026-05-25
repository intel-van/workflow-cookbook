# 附录 C · 最佳实践清单

> 本附录是一份**可勾选的清单**。每条给出「该怎么做」「为什么」「怎么落地」，并链到对应章节。设计/评审一个 Workflow 时，从头过一遍：能勾上的越多，脚本越确定、越省钱、越容易续传和观察。
>
> 所有论断的 API 依据见 [附录 A](#/zh/app-a)，行为依据见 [附录 E](#/zh/app-e) 的真实运行。配套的反向清单（踩坑与排错）见 [附录 B](#/zh/app-b)。

---

## C.1 怎么用这份清单

- 写脚本**前**：扫一遍 [C.2 结构与编排](#c2-结构与编排)、[C.3 schema 与产物](#c3-schema-与产物)，定好骨架。
- 写脚本**中**：对照 [C.4 可观测性](#c4-可观测性进度日志与标签)、[C.5 成本与规模](#c5-成本与规模)，边写边勾。
- 交付**前**：过 [C.6 韧性与验证](#c6-韧性与验证)、[C.7 迭代与续传](#c7-迭代与续传)、[C.8 隔离与嵌套](#c8-隔离与嵌套)，确认没漏。
- 拿不准某条 → 点链接回正文章节；术语不清 → 查 [附录 D](#/zh/app-d)。

> 图例：`[ ]` 待勾选；下方「**为什么**/**落地**」是判断依据。强约束（不照做会出错或浪费）标 ⚠️。

---

## C.2 结构与编排

- [ ] **多阶段默认用 `pipeline()`，不要用 `parallel()` 串联。** ⚠️
  - **为什么**：`parallel` 是**屏障**——它等一批全部完成才进下一步。把多阶段写成「`parallel` 接 `parallel`」会在每个阶段边界白白等最慢的一个。`pipeline` 让每个 item **独立**流过全部 stage，阶段间**无屏障**，墙钟 ≈ 最慢的单条链而非各阶段最慢之和。
  - **落地**：见 [第 8 章 · parallel vs pipeline](#/zh/p2-08)。只有「确实需要所有结果一起出现」时才用 `parallel`（如先 fan-out 再综合）。

- [ ] **`parallel()` 只传 thunk（`() => agent(...)`），绝不传 Promise。** ⚠️
  - **为什么**：传 `agent(...)`（Promise）会在数组构造时立即执行，不符合 `parallel(thunks)` 的 API、`parallel()` 无法按 thunk 管理它，并丢失「async reject / agent 出错 → `null`」的错误归集语义（并发上限的节流是**每工作流**统一施加的，不会被这样绕过）。
  - **落地**：`parallel(items.map(it => () => agent(prompt(it), { schema })))`。详见 [附录 B · B.4](#/zh/app-b)。

- [ ] **`meta` 写成纯字面量，首行就是 `export const meta = {…}`。** ⚠️
  - **为什么**：运行时在执行脚本前静态读取 `meta`；含变量/函数调用/展开/模板插值会被拒、工作流不启动。
  - **落地**：动态内容放脚本体里用 `log()`/`phase()` 表达。见 [第 5 章 · meta 与 phase](#/zh/p2-05)。

- [ ] **阶段先在 `meta.phases` 里声明，再在脚本里 `phase()`/`opts.phase` 引用。**
  - **为什么**：声明式 phase 让进度树结构清晰可预期；`phase()` 标题与 `meta.phases[].title` 按字符串精确匹配。
  - **落地**：见 [第 5 章](#/zh/p2-05)。

- [ ] **`parallel`/`pipeline` 内部用 `opts.phase` 显式归组，不靠全局 `phase()`。** ⚠️
  - **为什么**：全局 `phase()` 有状态，并发 agent 会竞争「当前阶段」导致归组错乱。
  - **落地**：每个并发 agent 自带 `phase:'Review'`。真实脚本 `frontend-review`/`judge-panel` 均如此。详见 [附录 B · B.12](#/zh/app-b)。

- [ ] **脚本体只做编排，副作用交给 agent。** ⚠️
  - **为什么**：脚本体是受限 `async` 沙箱，无文件系统/网络/`require`/Node 全局。读写文件、联网都得由 `agent()` 派出的 subagent（持真实工具权限）完成。
  - **落地**：要读文件就 `agent('Read x and ...')`；要数据就用 `args` 传入。详见 [附录 B · B.16](#/zh/app-b)。

---

## C.3 schema 与产物

- [ ] **关键产物用 `schema` 约束形状。** ⚠️
  - **为什么**：带 `schema` 时校验发生在**工具调用层**，模型不合规会**自动重试**到匹配，返回**已验证对象**——下游可直接 `.field` 取用，不必解析自由文本。
  - **落地**：`agent(prompt, { schema: { type:'object', properties:{…}, required:[…] } })`。见 [第 7 章 · 结构化输出与 Schema](#/zh/p2-07)。真实印证：`hello` 的 `sum` 严格为数字 `4`（Run `wf_dacbd480-d5d`）。

- [ ] **schema 约束形状，但给模型留表达空间（别过严）。**
  - **为什么**：`enum` 漏项、强制模型给它产不准的字段（如精确行号）会触发**持续重试**，拖慢甚至卡住。
  - **落地**：`enum` 覆盖全部合法取值；`required` 只列必要字段；精确位置用描述性 `string`。拿不准先用 `string` 跑一轮再收窄。详见 [附录 B · B.9](#/zh/app-b)。

- [ ] **复杂结构拆两阶段（先产文本，再结构化），别一步到位。**
  - **为什么**：深嵌套 schema 一次满足难度高；拆成「生成 → 结构化」更稳。
  - **落地**：用 `pipeline` 把「draft」与「extract」分两 stage。

- [ ] **跨 stage 需要原始输入时，用回调签名 `(prevResult, originalItem, index)`，别把它塞进上一阶段返回值穿线。**
  - **为什么**：`pipeline` 的每个 stage 都能直接拿到 `originalItem`，无需污染上一阶段的产物 schema。
  - **落地**：`(found, kind) => agent(\`verify ${kind}: ${found.example}\`)`。真实印证：`pipeline-demo` 的 stage2 签名即 `(found, kind)`（Run `wf_bf086b98-6ec`）。见 [第 8 章](#/zh/p2-08)。

---

## C.4 可观测性：进度、日志与标签

- [ ] **每个 agent 给描述性 `label`。**
  - **为什么**：`label` 是 `/workflows` 进度树和 transcript 里的显示名；`review:a11y` 比「agent #3」好定位、好搜索。
  - **落地**：`agent(prompt, { label: \`review:${d.key}\` })`。见 [第 6 章 · agent() 完全指南](#/zh/p2-06)。

- [ ] **在里程碑处 `log()`，把关键计数/决策写出来。**
  - **为什么**：`log()` 在进度树上方输出叙述行，是你回看「发生了什么」的主要线索（如「barrier released with 3/3 results」「pipeline kept N/M items」）。
  - **落地**：阶段切换、过滤后条数、提前退出原因都值得 `log`。真实脚本普遍这么做。见 [第 9 章 · 进度·日志·续传·预算](#/zh/p2-09)。

- [ ] **显式记录「掉队/降级」。**
  - **为什么**：`parallel`/`pipeline` 用 `null` 表示某项失败，只看最终条数会误以为丢数据。
  - **落地**：`log(\`pipeline kept ${ok.length}/${items.length}\`)`。详见 [附录 B · B.15](#/zh/app-b)。

- [ ] **把 `taskId`/`runId` 收好。**
  - **为什么**：`taskId` 用于追踪/停止（TaskStop），`runId` 用于续传（`resumeFromRunId`）。工作流**始终异步**，回执 ≠ 结果。
  - **落地**：结果等完成通知；实时进度看 `/workflows`。详见 [附录 B · B.14](#/zh/app-b)。

---

## C.5 成本与规模

- [ ] **派 agent 前先估成本：token ≈ agent 数 × 每 agent 上下文（约 2.5–3 万）。**
  - **为什么**：每个 agent 是独立上下文，成本近似线性叠加。真实印证：parallel 3 agent ≈ 78,844 ≈ 3×26,338（Run `wf_52957913-6d2`）。
  - **落地**：先算「这设计要派几个 agent」，再决定值不值。经验法则见 [primitives 运行记录](#/zh/p2-08)。

- [ ] **墙钟看关键路径，不看 agent 总数。**
  - **为什么**：并发把 N 个 agent 的时间压到「最慢的一个」。真实印证：3 并发 8.4s ≪ 3×5.5s。
  - **落地**：能并发的就并发；多阶段用 `pipeline` 让阶段重叠。见 [第 8 章](#/zh/p2-08)。

- [ ] **简单/机械的子任务用 `model: 'haiku'`。**
  - **为什么**：省略 `model` 会继承主循环模型（通常是强模型）；分类、抽取、格式化这类任务用轻模型即可，省 token 省时间。
  - **落地**：真正决定模型的是 `agent(prompt, { model: 'haiku' })` 里的 `opts.model`；`meta.phases[].model` 运行时是否生效本书未独立核实，当展示标签用、别单指望它。见 [第 6 章](#/zh/p2-06)、[第 21 章 · 动态预算与规模化](#/zh/p4-21)。

- [ ] **尊重并发上限，别指望无限并行。**
  - **为什么**：单工作流同时运行 `min(16, CPU核心数−2)` 个 agent，超出排队；单工作流 agent 总数硬上限 **1000**。
  - **落地**：超大批量分批/分片处理，而不是一次 fan-out 几百个。见 [第 21 章](#/zh/p4-21)。

---

## C.6 韧性与验证

- [ ] **重要产出加一道对抗验证（独立 agent「挑刺」）。**
  - **为什么**：第一版几乎总有盲区；换一个 agent、明确要求「找错」，能系统性暴露问题。真实印证：GCF 让对抗式 Critique 从一个看似简单的 `slugify` 揪出 **10 个真实缺陷**（Run `wf_7472ceac-daa`）。
  - **落地**：Generate → Critique → Fix 三阶段。见 [第 12 章 · 生成-批评-修复](#/zh/p3-12)、[第 17 章 · 对抗验证](#/zh/p4-17)。

- [ ] **需要降低单点偏差时，用独立评委 + rubric + 计票。**
  - **为什么**：多个互不通信的评委对「质量明显有别」的候选能稳定收敛；rubric（schema 把维度固化成数字）+ 计票比「单 agent 拍脑袋」更可靠。真实印证：judge-panel 3 名评委独立 3:0 收敛（Run `wf_f5b69668-b18`）。
  - **落地**：`parallel` 派多评委各自打分，最后 `votesA/votesB` 计票。见 [第 14 章 · 评委面板](#/zh/p3-14)。

- [ ] **消费 `parallel`/`pipeline` 结果前一律 `.filter(Boolean)`。** ⚠️
  - **为什么**：抛错/被跳过的位置是 `null`，不过滤会让后续 `.map(r => r.x)` 抛错。
  - **落地**：`(await parallel(thunks)).filter(Boolean)`。详见 [附录 B · B.11](#/zh/app-b)。

- [ ] **关键路径不允许丢项时，在 stage 内 `try` 住并返回降级结果，而非抛错。**
  - **为什么**：`pipeline` 里某 stage 抛错会让该 item 直接掉队、跳过其余 stage。
  - **落地**：catch 后返回 `{ ok:false, reason }` 让该项继续往下。详见 [附录 B · B.15](#/zh/app-b)。

- [ ] **「循环到干/重试到通过」要有收敛条件 + 轮次上限。**
  - **为什么**：纯靠业务判据可能永不收敛。
  - **落地**：`while (!done && round < MAX_ROUNDS)`。见 [第 18 章 · 循环到干与完整性批评](#/zh/p4-18)。

---

## C.7 迭代与续传

- [ ] **复杂脚本落盘成 `.js`，用 `scriptPath` 调用。**
  - **为什么**：脚本即文件，能用编辑器/工具先核查；Write/Edit 改后用同一 `scriptPath` 重跑，无需重发整段脚本。
  - **落地**：`Workflow({ scriptPath: '.../my-wf.js' })`。`scriptPath` 优先级最高。见 [附录 A · A.1](#/zh/app-a)。

- [ ] **想复用已跑成果，用 `resumeFromRunId` 续传，并保持前段脚本逐字不变。**
  - **为什么**：未改动的 `agent()` 续传时**零 token、零工具、约 8ms** 返回缓存结果。真实印证：hello 续传 `total_tokens=0`/`duration_ms=8`（Run `wf_dacbd480-d5d` 复用）。
  - **落地**：改动只发生在希望重跑的位置之后；续传**仅同会话**，且应先 `TaskStop` 上一次运行。见 [第 22 章 · 断点续传与缓存](#/zh/p4-22)。

- [ ] **保证脚本可重放：禁用 `Date.now()`/`Math.random()`/无参 `new Date()`。** ⚠️
  - **为什么**：不确定来源破坏续传所需的对齐（也会被运行时直接抛错）。
  - **落地**：时间戳用 `args` 传入或事后盖戳；随机性用 agent 下标变化提示词。详见 [附录 B · B.5](#/zh/app-b)。

- [ ] **想强制重跑某段，就故意改动它。**
  - **为什么**：缓存按「调用是否变化」判定；改了就重跑，没改就命中。
  - **落地**：见 [第 22 章](#/zh/p4-22)。

---

## C.8 隔离与嵌套

- [ ] **`isolation: 'worktree'` 仅在「并行 agent 改同一批文件会冲突」时用。** ⚠️
  - **为什么**：worktree 昂贵（约 200–500ms 启动 + 磁盘/agent 开销）；只读评审、纯分析、各写各文件都**不需要**它。无改动时自动清理。
  - **落地**：并行重构/并行打补丁才开；返回结果含路径与分支。见 [第 19 章 · Worktree 隔离](#/zh/p4-19)。

- [ ] **复用整段流程用 `workflow()` 内联，但记住嵌套仅一层。** ⚠️
  - **为什么**：子工作流共享父的并发上限/agent 计数/中止信号/token 预算；子里再调 `workflow()` 会抛错。
  - **落地**：把「孙级」逻辑展平进子工作流；多级编排由主循环串联。真实印证：父内联跑 hello 子流程，子 agent 计入父 `agent_count`（Run `wf_85e22b38-126`）。见 [第 20 章 · 嵌套 Workflow](#/zh/p4-20)。

- [ ] **用 `agentType` 复用已有 subagent 类型（可与 schema 组合）。**
  - **为什么**：`'Explore'`、`'code-reviewer'` 等自定义类型自带专门的系统提示；与 `schema` 组合时会追加 StructuredOutput 指令。
  - **落地**：`agent(prompt, { agentType: 'Explore', schema })`。见 [第 6 章](#/zh/p2-06)。

---

## C.9 预算守卫

- [ ] **动态循环用 `budget.total && budget.remaining() < 阈值` 守卫提前退出。** ⚠️
  - **为什么**：`budget` 是硬上限（`spent()` 达 `total` 后调 `agent()` 抛错）；`total` 可能为 `null`（未设目标，`remaining()` 为 `Infinity`），所以要 `budget.total &&` 短路，避免未设目标时误退。
  - **落地**：
    ```javascript
    if (budget.total && budget.remaining() < 30_000) {
      log(`budget guard: ${budget.remaining()} left, stopping`)
      break
    }
    ```
  - 详见 [第 21 章 · 动态预算与规模化](#/zh/p4-21)、[附录 B · B.6](#/zh/app-b)。

- [ ] **预算池是共享的——主循环 + 所有工作流（含嵌套子流程）共用一个池。**
  - **为什么**：`budget.spent()` 统计的是本回合全部 output token，嵌套子流程的消耗也计入。
  - **落地**：估算嵌套工作流成本时把子流程算进去。见 [第 20 章](#/zh/p4-20)。

---

## C.10 一页纸总览（撕下来贴墙上）

```text
编排
  □ 多阶段 → pipeline（非 parallel 串联）
  □ parallel 只传 thunk
  □ meta 纯字面量 + 首行 export
  □ 并发块内 opts.phase 显式归组
  □ 脚本体只编排，副作用交给 agent

产物
  □ 关键产物用 schema 约束
  □ schema 不过严（enum 全、required 精）
  □ 复杂结构拆两阶段
  □ 跨 stage 用 (prev, orig, i) 取原始输入

观测
  □ 描述性 label
  □ 里程碑 log + 记录掉队
  □ 收好 taskId / runId（结果等通知）

成本
  □ 先估 token（≈ agent 数 × 2.5–3 万）
  □ 墙钟看关键路径，能并发就并发
  □ 简单任务用 haiku
  □ 尊重并发上限 / 1000 兜底

韧性
  □ 重要产出加对抗验证
  □ 降偏差用独立评委 + rubric + 计票
  □ 结果 .filter(Boolean)
  □ 循环有收敛条件 + 轮次上限
  □ budget.total && 守卫

迭代
  □ 落盘 .js，用 scriptPath 重跑
  □ 续传保持前段逐字不变（同会话、先 TaskStop）
  □ 禁 Date.now/Math.random（保可重放）

隔离/嵌套
  □ worktree 仅并行改文件冲突时用
  □ workflow() 嵌套仅一层
```

> 配套阅读：反向清单（坑与排错）见 [附录 B · 陷阱与排错](#/zh/app-b)；字段语义查 [附录 A · API 完整参考](#/zh/app-a)；术语查 [附录 D · 术语表](#/zh/app-d)。

> 继续阅读：[附录 D · 术语表](#/zh/app-d)
