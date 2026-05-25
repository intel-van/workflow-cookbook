# 真实运行记录 · PR 多维评审配方（frontend-review）

> 这是「PR 多维 Review」配方（第 11 章）的真实运行：用一个 Workflow 并发地从 **a11y / 性能 / 正确性** 三个维度评审本项目真实的 `index.html`，再综合去重成优先级清单。
> **这是一次真正的 dogfooding**：我们用 Workflow 特性自己审查了本书自己的前端，并据此修复。
> 环境：Claude Code v2.1.150，`CLAUDE_CODE_WORKFLOWS=1`，2026-05。

**Run ID**：`wf_4c5caabb-b73` ｜ **Task ID**：`wss21eu0x`

## 脚本结构（review → synthesize）

```javascript
export const meta = {
  name: 'frontend-review',
  description: 'Multi-dimension review of index.html: a11y, performance, correctness',
  phases: [{ title: 'Review' }, { title: 'Synthesize' }],
}
const FILE = '.../index.html'
const FINDINGS = { type:'object', properties:{ findings:{ type:'array', items:{ type:'object',
  properties:{ severity:{type:'string',enum:['critical','high','medium','low']}, title:{type:'string'}, detail:{type:'string'}, fix:{type:'string'} },
  required:['severity','title','detail','fix'] } } }, required:['findings'] }
const dims = [ {key:'a11y',...}, {key:'perf',...}, {key:'correct',...} ]

phase('Review')
const reviews = await parallel(dims.map(d => () =>
  agent(d.prompt, { label:`review:${d.key}`, phase:'Review', schema:FINDINGS })
    .then(r => ({ dim:d.key, findings:(r&&r.findings)||[] }))))
const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, dim:r.dim })))

phase('Synthesize')
const summary = await agent(`These are ${all.length} findings (JSON): ${JSON.stringify(all)}. Dedup, rank by severity, prioritized action list.`,
  { label:'synthesize', phase:'Synthesize', schema:{...} })
return { rawCount: all.length, byDimension:..., ...summary }
```

## 真实用量

`agent_count=4`（3 评审 + 1 综合）｜ `tool_uses=13` ｜ `total_tokens=221648` ｜ `duration_ms=272643`（约 4.5 分钟）

## 真实产出

- **rawCount = 26** 条原始发现：a11y 10、perf 6、correct 10。
- 综合 agent 去重为 **16 个明确问题**，并给出修复顺序：**1–5 上线阻断项、6–11 强烈建议、12–16 打磨**。

### 上线阻断项（综合 agent 真实判定的 top 5）

1. **CRITICAL · DOM XSS**：`marked.parse()` 直接 `innerHTML`，marked v12 无内置消毒（v5 起移除），`gfm:true` 放行原始内联 HTML → 同源 `.md` 里的 `<img onerror>` 等会执行脚本。修：引入 DOMPurify 包裹；mermaid 错误回退也要转义 `&`/`"` 而非仅 `<`。
2. **CRITICAL · 无焦点指示**：全局 `button{border:none}` 抹掉 outline，全表无一条 `:focus-visible` → 整页可 Tab 但不可见（WCAG 2.4.7）。修：加 `:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`，tint 背景上用深色 outline。
3. **HIGH · 重复 heading ID**：`enhance()` 纯按文本生成 id 且不去重 → 重复标题（如多个「示例」）碰撞，TOC/锚点恒跳到第一个；空/纯标点标题 → `id=''`。修：每次渲染用 slugger 去重 + 空值兜底 `section-<i>`。
4. **HIGH · 异步渲染竞态**：`renderChapter()` 的 `fetch` 无取消，快速 A→B 导航（或切语言）会让 A 的响应晚到覆盖 B。修：单调 `routeSeq` 令牌，await 后校验。
5. **HIGH · 强调橙小字对比度不足**：链接/内联 code/激活导航/`--ink-faint`/hljs 注释多处 < 4.5:1（WCAG 1.4.3）。修：文本用色加深（≥#B8430F），大字/规则/进度条保留亮橙。

### 强烈建议（6–11）

6. 三个 CDN 脚本渲染阻塞 + mermaid(~500KB) 在无图首页也加载 + `highlightAuto` 主线程跑 → `defer`、按需懒加载 mermaid、避免 highlightAuto、加 preconnect。
7. 单个未节流 scroll handler 每帧 2× querySelectorAll + 每标题 getBoundingClientRect → rAF 节流 + 缓存 NodeList + IntersectionObserver。
8. TOC 标签用 `hd.firstChild.textContent` → 含内联标记的标题被截断。修：`h.dataset.title=h.textContent.trim()`。
9. 移动抽屉无 `aria-expanded`/Esc/焦点管理；关闭态侧栏链接仍可 Tab。修：aria + Esc + 关闭时 `visibility:hidden`/`inert`。
10. 缺地标：无 `<main>`、无跳转链接、`<nav>` 无 aria-label、装饰 SVG 未 `aria-hidden`。
11. Copy 按钮假定 `navigator.clipboard` 存在且无 `.catch` → file://、不安全 http 下抛错/静默。修：特性检测 + `execCommand` 回退。

### 打磨（12–16）

12. 语言偏好 desync：裸 hash 把已存 `en` 重置回 `zh`。13. 语言切换/品牌 div/动态内容未暴露给 AT（aria-pressed/role/aria-live）。14. 平滑滚动不移焦点、无 `prefers-reduced-motion`。15. 锚点/copy 无意义 a11y 名（全是「#」「Copy」）。16. manifest 无错误处理（失败卡 spinner）、router 正则过严、mermaid render-id 碰撞、重复高亮不幂等。

> **处理**：以上 16 项已逐条落地到 `index.html`（详见 git 历史）。这次运行本身就是第 11 章「PR 多维 Review」的真实案例。
