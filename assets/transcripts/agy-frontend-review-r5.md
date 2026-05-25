# R5 · antigravity (agy) 跨模型前端对抗审查存证（Phase 5）

> 证据级别：第二路跨模型审查（antigravity `agy --print`，Google 模型族）。本文件留存 agy 的前端 finding + 主控（Claude）的研判与落实记录。

## 运行元信息 + 一个真实的「headless 挂起」诊断

- 审查器：`agy --print "<prompt>" --dangerously-skip-permissions --add-dir <repo>`（antigravity 1.0.2，通过 ccg 调用）。
- 范围：`index.html`（零构建 vanilla-JS SPA）的 a11y / UX / 视觉微调 / JS 健壮性。明确约束「只微调、不重设计、不改配色布局」，并把 R5 已应用的 a11y 修复列为「不要重复报」。
- **第一次运行挂起（真实坑，已诊断+修复）**：首次后台启动后跑满 **18 分 45 秒、0 字节输出、CPU 0%、STAT=S、无网络连接**，且超过其自带 `--print-timeout 280s` 达 4 倍。诊断：`fd 0`（stdin）是一个**未关闭的 unix socket 管道**——`agy --print` 在读 stdin 直到 EOF 才继续，而管道一直不关 → 经典 headless **stdin-EOF 死锁**（与 R4「agy headless 需交互登录」是同类的「等输入」症状）。
- **修复**：`kill` 挂起进程（exit 143 = SIGTERM，证实 0 字节产出），改用 `agy --print "..." < /tmp/agy-prompt.txt`（把 prompt 文件同时喂给 stdin，给足 EOF；兼容 agy 走 argv 或走 stdin 两种取 prompt 方式）。重启后 **正常产出 7851 字节**。
- 教训：headless 调 agy 必须重定向 stdin（`< 文件` 或 `< /dev/null`），否则会无限阻塞。

## agy 9 条 finding 与主控研判（8 采纳 / 1 否决）

| # | 级别 | 区域 | 主控判定 |
|---|------|------|----------|
| 1 | P1 | mermaid 异步竞态：切章后 `pre.parentNode` 为 null → `replaceChild` 崩溃 | ✅ 采纳：加 `if(!pre||!pre.parentNode) return;` |
| 2 | P1 | manifest 加载失败后 route() 空引用 | ✅ 采纳（部分纠偏）：见下 |
| 3 | P1 | 代码块 `:focus-visible` 外框被 `.code-card` 的 `overflow:hidden` 截断 | ✅ 采纳：`.code-card pre:focus-visible{outline-offset:-2px}` |
| 4 | P1 | `--accent-text` 小字对比度 4.47:1 < AA 4.5:1 | ✅ 采纳（已醒目标注用户）：`#B8430F`→`#AF3E0D`（≈4.96:1，肉眼无感） |
| 5 | P2 | 全局 `scroll-behavior:smooth` 致切章 `scrollTo(0,0)` 迟滞 | ✅ 采纳：移除全局 smooth（`jumpTo()` 显式 `behavior:'smooth'`，TOC 跳转不受影响） |
| 6 | P2 | scroll-spy 在页面底部/短章无法高亮最后一项 TOC | ✅ 采纳：到底部时强制 `cur=最后一个标题` |
| 7 | P2 | 移动端触摸热区 < 44px | ❌ **否决**：见下 |
| 8 | P3 | `.ch-nav a` 键盘聚焦缺少 hover 的位移反馈 | ✅ 采纳：`:hover,:focus-visible` 合并 |
| 9 | P3 | 语言切换非活动按钮无 hover 反馈 | ✅ 采纳：加 `:not(.on):hover` 样式 |

### 对 #2 的纠偏
agy 称「manifest 失败后用户滚动/切 hash 会触发 route() 崩溃」。**经核实其触发前提不成立**：`boot()` 在 manifest 失败的 catch 分支里 `return`，`bindEvents()` 在成功路径之后才执行——失败时 hashchange/scroll 监听**根本未绑定**，route() 不会被触发。但在 route() 入口加一行 `if(!S.manifest) return;` 是零风险的稳健化（防未来重构），故仍采纳。

### 对 #7 的否决（保守，符合「微调不大改」）
- WCAG **2.5.8 Target Size (Minimum) AA 阈值是 24px**；44px 是 **2.5.5 (Enhanced) AAA** 级。实测 lang-toggle(~34px)/code-copy(~26px) **均已满足 AA 最小值**，不构成 AA 失败。
- agy 的 `::after` 透明热区方案在相邻按钮间存在**点击区重叠**风险（可能误吞邻键点击）。
- 综合：非 AA 必需 + 有引入交互 bug 的风险 → **暂不应用**，记录在案；若将来要做，需逐一测试避免重叠。

## 落实
8 条由主控直接编辑 `index.html`（单文件单写者），全部为微调级、不改设计观感；改后跑 anchor-audit + 真实浏览器（Playwright）验证 console/路由/渲染，再提交。
