# 真实运行记录 · 深度研究配方（Deep Research）

> 「深度研究」（第 13 章）的真实运行：多角度并发检索 → 交叉验证（核对一致性 + 信源质量）→ 综合出带引用的答案。**subagent 进行了真实网络检索并溯源到一手资料。**
> 研究问题（特意选可验证的）：零构建客户端 Markdown 站点如何防 XSS？marked v12 是否内置消毒？
> 环境：Claude Code v2.1.150，`CLAUDE_CODE_WORKFLOWS=1`，2026-05。

**Run ID**：`wf_6090decc-8a5` ｜ **Task ID**：`wva3qtdps`

## 脚本结构（Research → Verify → Synthesize）

```javascript
phase('Research')
const findings = await parallel(angles.map((a,i) => () =>
  agent(a, { label:`research:${i}`, phase:'Research', schema:{ claim:string, sources:string[] } })))
phase('Verify')
const verify = await agent(`Cross-verify these findings for consistency + source quality. Flag unsupported claims. ${JSON.stringify(valid)}`,
  { label:'cross-verify', phase:'Verify', schema:{ consistent:boolean, notes:string } })
phase('Synthesize')
const ans = await agent(`Synthesize a cited final answer ... ${JSON.stringify(valid)}`,
  { label:'synthesize', phase:'Synthesize', schema:{ answer:string, sources:string[] } })
return { findings: valid, crossCheck: verify, answer: ans.answer, sources: ans.sources }
```

## 真实用量

`agent_count=4`（2 检索 + 1 交叉验证 + 1 综合）｜ `tool_uses=31` ｜ `total_tokens=148975` ｜ `duration_ms=298530`（约 5 分钟——含真实网络检索，比纯推理慢）

## 真实产出（核心结论，均经一手源核实）

- **marked v12 不消毒**：官方 README 第 53 行原文「Marked does not sanitize the output HTML... use a sanitize library, like DOMPurify (recommended)...」。
- **`sanitize`/`sanitizer` 选项**：v0.7.0（2019-07-06）**弃用**（PR #1504「Sanitize hardening」，因发现绕过），v8.0.0（2023-09-03）**移除**。
- **共识最佳实践**：用 DOMPurify（cure53，allowlist 安全默认）消毒，且**必须在 parse 之后**：`DOMPurify.sanitize(marked.parse(input))`——先消毒后 parse 会被两库解析差异绕过。

## 关键观察：交叉验证 agent 的「逐源核实 + 揪出失效链接」（实证）

交叉验证 agent 没有只看检索 agent 的转述，而是**用 GitHub API 直接拉取各版本 `src/defaults.ts` 源码核对**：

> "src/defaults.ts @ v7.0.0 — CONTAINS `sanitize: false`... @ v8.0.0 — NO sanitize/sanitizer keys (grep exit 1)... => 「present through v7.0.0, absent from v8.0.0 onward」is EXACTLY correct."

并主动**标记了信源缺陷**：

> "DEAD CITATION #1232: GitHub API returns HTTP 410 'This issue was deleted'... should be DROPPED. NOTE: harmless because the real PR is #1504, which IS cited and verified."

`crossCheck.consistent = true`，但备注里精确指出了两处非承重的失效引用。

## 双重收获

1. **配方价值**：多源检索 + 独立交叉验证，把一个技术问题查到**一手源、逐版本核实**的程度——远胜单 agent「我记得好像是……」。
2. **顺带验证了本书前端**：结论 `DOMPurify.sanitize(marked.parse(input))` **正是**本书 `index.html` 在 frontend-review（第 11 章）后落地的 XSS 修复——一次独立的深度研究反过来印证了那次修复的正确性。

> **配方要点**：①检索角度要**正交**（不同子问题，`parallel` 并发）；②**交叉验证是独立阶段**，要求它核对一致性**与信源质量**，而非复述；③综合阶段**只用已验证发现并强制带 source**；④网络检索比纯推理慢（本例约 5 分钟），用 `log` 让等待可见。
