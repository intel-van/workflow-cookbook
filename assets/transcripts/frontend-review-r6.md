# 前端对抗审查记录 · R6（Phase A 门）

> 本文件是 R6 Phase A「前端打磨」的审查证据。真值原则同全书：每条结论可追溯到真实运行/审查。

## 运行元信息（真实，可追溯）

- **首选审查器 = antigravity（agy）**：尝试 `agy --print "<审查提示>" < /dev/null`（stdin 重定向，规避 R5 记录的 stdin-EOF 死锁）。
- **结果 = 未认证、未跑成**：agy 要求 Google OAuth 登录（`accounts.google.com/.../antigravity.google/oauth-callback`），headless 环境下 `Waiting for authentication (timeout 30s)...` → `Error: authentication timed out.`，进程 exit 0（**假成功**：退出码为 0 但实际未产出任何审查内容）。
- **fallback = Claude agent**（按用户指令「antigravity 不可用时 fallback 到 claude」）：general-purpose 子代理，独立、无前文上下文，通读 `index.html` + `manifest.json` 做对抗审查。用量 60,617 token / 5 tool_uses / 68s。
- 主窗口对每条 finding **交叉核对后**决定采纳/驳回（R5 教训：审查器会把真实事实误判为问题，落实前必须核对）。

## 被审对象

`index.html`（零构建单文件 SPA），含本轮 Phase A 已做的 3 处打磨：
1. `html{scroll-padding-top:64px}`（移动端 80px）——锚点跳转后标题不被 sticky `.topbar` 遮挡。
2. `refreshFades()` + resize 处理器——代码块右缘横向滚动渐隐提示在 resize 时重算。
3. `.code-lang` 省略号截断守卫 + `.code-copy{flex-shrink:0}`——防长语言名挤压 copy 按钮。

**审查器结论：上述 3 处改动「correct and bug-free，未引入新 bug」。**（另：Playwright 真浏览器子路径测试 5/5 PASS、0 console 错误、scroll-padding 实测 top=64.04。）

## Findings 与处置（2 采纳 / 2 驳回）

| # | 严重度 | Finding | 处置 | 理由 |
|---|---|---|---|---|
| 1 | P1 | `doCopy`→`fallback`：`execCommand` 路径 `ta.select()` 夺走焦点，移除临时 textarea 后焦点落到 `<body>`，键盘用户丢失位置 | **采纳** | 真实 corner case（仅 `navigator.clipboard` 不可用时触发，如 `file://`/不安全上下文）。修法低风险：`fallback` 内存下 `document.activeElement`，`finally` 还原。 |
| 2 | P2 | 截断后的 `.code-lang` 无 `title`，长语言名被省略号裁掉后不可恢复 | **采纳** | 补全本轮新加的截断守卫。1 行：`ls.title=lang`。本书语言标签都很短、实际不会触发截断，但补全更稳妥。 |
| 3 | P2 | 焦点陷阱入口不一致：开抽屉聚焦首个 `.np-item`，但 Tab 陷阱以 `#brandHome` 为 `first` | **驳回** | 审查器自述「mild UX seam, not a true escape」。开抽屉聚焦首个导航项是有意为之、UX 更好；陷阱仍正确包住焦点（`#brandHome` 可 Shift+Tab 到达），无真实逃逸。 |
| 4 | P2 | mermaid CDN 加载失败时 `ensureMermaid().catch(()=>{})` 静默 | **驳回（无需改）** | 审查器自述「none required」：每图的 `.catch` 已在**渲染**失败时回退为 `<pre>` 文本；**加载**失败是可接受降级。 |

## 审查器确认的「非问题」（勿再追）

- `fallback` 的 `ta` 在 `try` 前声明，`finally` 引用在作用域内——无 ReferenceError。
- `refreshFades` 与 `onScroll` 用各自的 tick 标志（`fadeTick` / `ticking`），resize 同触两者不互相饿死。
- stale-fetch 守卫（`my!==routeSeq`）覆盖网络 catch 与 await 后渲染两路；mermaid/`pre` detach 检查覆盖加载中切章。
- 子路径部署：所有 fetch（`manifest.json`、`ch.file[...]`）相对、hash 路由路径无关——无绝对路径地雷。
- 对比度：`--accent-text:#AF3E0D`（paper 上）、内联代码 `#9A3D12`（`#F1ECDF` 上）均过 WCAG AA。

## 落实

采纳 #1、#2，已改 `index.html`（`doCopy`/`fallback` 焦点还原；`enhance()` 加 `ls.title=lang`）。#3、#4 驳回（理由见上）。本轮前端无 P0 阻断项。
