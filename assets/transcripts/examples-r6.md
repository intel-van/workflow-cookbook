# R6 真实运行与 dogfooding 证据 · examples-r6.md

> R6 重跑三个应用级工作流（用户授权「重跑应用级示例」），全部经 Workflow 工具真实运行；每条数据可追溯到 Run ID。真值原则同全书。
> 会话 `bcde76fb-7e37-4363-8568-85a856c0a735`；Claude Code v2.1.150；实测环境变量 `CLAUDE_CODE_WORKFLOWS=1`、`CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-4-7[1m]`、`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。

## 1. 三个工作流真实运行（2026-05-25）

| 脚本 | 模式 | Run ID | agent | total_token | 墙钟(ms) | 结果 |
|---|---|---|---|---|---|---|
| `review-spa.js` | pipeline + 对抗验证 | `wf_ca7aa11f-6fb` | 18 | 789,482 | 244,897 | 14 条确认（bugs5 / sec4 / a11y5） |
| `dead-code-scan.js` | loop-until-dry | `wf_ccda2a68-fab` | 2 | 118,280 | 111,770 | 2 轮全干净，DRY_STREAK 终止，0 死代码 |
| `feedback-themes.js` | parallel 屏障 | `wf_0771c834-a9f` | 20 | 613,112 | 59,250 | 18 项 → 6 主题 |

**合计 ≈ 152.1 万 token**，与 R5 三跑（≈171.5 万）同量级。

### 与 R5 对照（同脚本）
| 脚本 | R5（agent / token / ms / 结果） | R6（agent / token / ms / 结果） | 说明 |
|---|---|---|---|
| review-spa | 22 / 991,554 / 395,166 / 18 条 | 18 / 789,482 / 244,897 / 14 条 | SPA 已经 R5 修过一轮，可报项更少 → agent/findings 下降；pipeline+对抗验证机制一致 |
| dead-code | 2 / 116,344 / 246,496 / 2 轮干净 | 2 / 118,280 / 111,770 / 2 轮干净 | 高度一致 |
| feedback | 20 / 607,307 / 122,391 / 8 主题 | 20 / 613,112 / 59,250 / 6 主题 | agent/token 一致；主题数 8→6 属聚类粒度的正常 run 间差异 |

### 成本真相（实测，重要）
`CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-4-7[1m]` **覆盖**脚本里的 `model:'haiku'`（review-spa 的 Verify 阶段、feedback 的 Summarize 阶段都标了 haiku，但实跑 Opus）。它是用户/CI 旋钮、脚本无法控制；一旦设置，工作流里的 `model` 选项被静默忽略。故三跑按 Opus 计费 ≈152 万 token。**省钱办法**：在会话级把该变量设为 haiku 类模型，而不是指望脚本里的 `model:'haiku'`。

## 2. review-spa dogfooding：14 条确认发现 → 处置（9 修 / 5 驳回或记录）

review-spa 真实审了本书自己的 `index.html`（修复前版本），经**对抗验证**（每条由独立 agent 尝试证伪，存活才计入）确认 14 条。主窗口**逐条交叉核对**后处置（R5 教训：审查器会误判，落实前必核对）。

### 已修复（9，均在本轮 commit；修复后经 Playwright 复验 6/6 PASS，见 §4）
| 维度/严重度 | 发现 | 修法 |
|---|---|---|
| bugs/medium | `slugify` 去重只登记 base slug：「Setup 1」与两个「Setup」去重生成的 `setup-1` 撞车 → 重复 DOM id、TOC/锚点都指向第一个 | 改 `slugify`：生成 `base-N` 时跳过任何已占用 slug，并登记每个**实际使用**的 slug，自然/生成命名空间不再重叠 |
| bugs/medium | 内文锚点点击里 `decodeURIComponent(href.slice(1))` 遇畸形 `%`（如 `#100%-done`）抛 URIError；`preventDefault` 已执行 → 链接变死链且报错 | try/catch，解码失败回退原始片段，退化为 `getElementById` 直查而非死链 |
| bugs/low | `\|\| ('section-'+i)` 是死代码（`slugify` 因 `if(!id) id='section'` 永不返回 falsy） | 删除不可达分支 |
| bugs/low | `renderToc` 早返回只清 `tocLinks` 未清 `headEls`，破坏二者同步不变量（当前有 `if(!tocLinks.length) return` guard 不崩，属潜在风险） | 早返回同时 `headEls=[]` |
| sec/**high** | 4 个 CDN 脚本（含 DOMPurify 这个 XSS 控制本身）无 SRI `integrity`；CDN 投毒/被污染版本可静默替换 sanitizer | 4 个脚本加 `integrity="sha384-…" crossorigin="anonymous"`（含动态 `loadScript` 加载的 mermaid）；哈希见 §3，已浏览器验证不破坏加载 |
| sec/medium | `target=_blank` 仅对 http(s) 链接加 `rel=noopener`；协议相对链接（`//host`）保留 target 却漏防 → 反向 tabnabbing | `enhance()` 末尾对**任何** `target=_blank` 兜底补 `rel=noopener noreferrer` |
| sec/low | `manifest.site.repo` 直接赋给可见链接 `href`，无协议白名单（manifest 若被污染可成 `javascript:`） | 赋值前用 `/^https?:\/\//i` 白名单校验，否则回退 `#` |
| a11y/low | 初次自动 boot 即把焦点抢到 `h1`，干扰键盘/屏幕阅读器用户 | 引入 `setH1Focus`：首屏不抢焦点，仅用户发起的路由才聚焦 |
| a11y/low | GitHub 链接默认 `href="#"`（manifest 加载前/失败时是死链/跳顶） | HTML 默认 href 改为真实仓库 URL |

### 驳回 / 记录（5，附理由）
| 维度/严重度 | 发现 | 处置与理由 |
|---|---|---|
| bugs/low | 语言深链不持久化（`switchLang` 存储、`route()` 不存储），跨会话 toggle 与 URL 可能不一致 | **驳回**：`route()` 不持久化是**有意设计**（代码注释明确「深链不应覆盖用户已保存的偏好」）。改了反而引入覆盖。对抗验证器也确认这是 intentional。 |
| sec/medium | mermaid 渲染的 SVG 经 `innerHTML` 注入、未再过 DOMPurify | **驳回**：① SRI（已修）已封堵 CDN 投毒这个根因；② 图源是同源、作者可控的本书 markdown；③ mermaid `securityLevel:'strict'` 已是内置 sanitizer；④ 再套 DOMPurify-SVG profile 有破坏图渲染的实测风险。综合后残余风险可忽略。 |
| a11y/low | 语言切换用 `aria-pressed` 表达互斥单选，更宜 `radiogroup` + 方向键 | **驳回**：发现本身承认 `aria-pressed` 按钮组「acceptable」、控件可操作；改 radiogroup 需新增方向键交互，收益低、复杂度增。 |
| a11y/medium | mermaid figure 用 `role=img` + 通用 aria-label，图内节点文字对 SR 不可见（WCAG 1.1.1 内容等价缺口） | **记录待办（不乱补）**：正确修法需逐图人工撰写描述；自动塞 mermaid 源码或去 `role=img` 可能让 SR 体验更糟。诚实记录为已知 a11y 缺口，留待后续按图补描述。 |
| a11y/low（信息性） | 亮橙 `#F05C00`（3.37:1）若用于小字不过 4.5:1 | **信息性，无需改**：发现自评「未找到实际违规」——`#F05C00` 仅用于大字号/装饰；小字一律用更深的 `--accent-text #AF3E0D`（5.7:1，过 AA）。唯一的 `.dateline .sep` ◆ 是装饰分隔符，WCAG 1.4.3 豁免。 |

## 3. SRI 哈希（用 Node `crypto` 真实计算，可复现）

对 4 个固定版本 URL：`crypto.createHash('sha384').update(buf).digest('base64')`（buf = 该 URL 的真实响应字节）：

| 库 | 字节数 | integrity |
|---|---|---|
| marked@12.0.0 | 35,159 | `sha384-NNQgBjjuhtXzPmmy4gurS5X7P4uTt1DThyevz4Ua0IVK5+kazYQI1W27JHjbbxQz` |
| dompurify@3.0.9 | 21,105 | `sha384-3HPB1XT51W3gGRxAmZ+qbZwRpRlFQL632y8x+adAqCr4Wp3TaWwCLSTAJJKbyWEK` |
| highlight.js@11.9.0 | 121,727 | `sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp` |
| mermaid@10.9.1 | 3,335,717 | `sha384-WmdflGW9aGfoBdHc4rRyWzYuAjEmDwMdGdiPNacbwfGKxBW/SO6guzuQ76qjnSlr` |

> 复算方式：用 Node `fetch(url)` 取字节 → `crypto.createHash('sha384')`。**未给 Google Fonts CSS 加 SRI**：其响应随 User-Agent 变化、哈希不稳定，是已知不适用 SRI 的情形。

## 4. 修复后浏览器复验（Playwright，子路径 `/workflow-cookbook/`，6/6 PASS）

- **章节渲染正常**（marked+dompurify+highlight 的 SRI 哈希正确）：p1-01 的 `#content h2`=8、正文 9840 字、无「加载失败」占位。
- **0 console 错误/警告**：无任何「Failed to find a valid digest in the 'integrity' attribute」或 CSP 拦截；marked/DOMPurify/hljs/mermaid 四个全局对象均已加载。
- **mermaid 出图**：p2-08 渲染出 2 个 `.mermaid-fig svg`（mermaid SRI 正确）。
- **hljs 高亮生效**：p1-01=101、p2-08=299 个 hljs span。
- **锚点 + scroll-padding**：第 3 个 h2 id 有意义、`scrollIntoView()` 后 `top≈64.2` 不被顶栏遮挡、**页面重复 id=0**（slugify 改动未破坏既有锚点）。
- **GitHub 链接**：`ghLink` href = 真实 https 仓库 URL（非 `#`）。

## 5. R6 二轮：mermaid a11y 修复 + review-spa 复验（验证 9 修已消失）

### 5.1 mermaid 逐图可访问名（index.html）
- 问题（上轮 review-spa finding #13，medium）：所有 mermaid 图共用泛化 `role=img` + aria-label「流程图示（含义见正文描述）」，图内文字对屏幕阅读器不可见。
- 修法（**非逐图手写**——160 张图手写描述极易沦为 AI 套话；改为从图的**真实渲染标签**自动派生专属名）：渲染后从 `foreignObject`（flowchart htmlLabels）+ `text`（sequence/state 图）两类元素提取真实标签 → 「图示，含：<标签…>。关系见正文。」。
- ⚠ **首修失效→修正**：初版用 `querySelectorAll('text')` 取到 0 个（误判 `securityLevel:'strict'` 渲为 SVG `<text>`；实测 flowchart 标签在 `foreignObject/span` 里）。Playwright 验证抓出，改 `foreignObject, text` 双路后复验 **5/5 PASS**：zh/en 各 80 张图泛化占位清零、均含真实标签、sequence 图 `text` 回退生效、0 console 错误。

### 5.2 review-spa 复验真跑（验证修复）
- Run ID `wf_f1b6bf8b-2f4`：16 agent / 752,345 token / 341,389ms，**确认 10 条**（上轮 14 → 10）。
- **9 个 Phase B 修复确认消失**：重跑不再报 slugify 碰撞 / SRI 缺失 / decodeURIComponent / renderToc 等；反而 #2 专门 stress-test 确认 **slugify 重写正确、原型名安全、0 重复 id**，#3 确认 **4 脚本已带 SRI**，#6 确认 **mermaid/highlight innerHTML 安全**。这是对 Phase B 修复的强验证。
- 新出 10 条处置：
  - **修 3 项**：#1 语言正则丢 `+`/`#`（c++/c#/f# 标签+高亮错）→ 正则改 `[\w+#-]`；#10 章节加载无 SR 播报（medium a11y）→ `#live` 播报「加载中」；#3 无 CSP（medium sec）→ 加源白名单 CSP（DOMPurify+SRI 之上的纵深防御；`'unsafe-inline'` 因单文件内联脚本必需、GitHub Pages 无法用 nonce；Playwright 实测 **0 条 CSP 拦截**）。
  - **正面确认（无需改）**：#2 slugify/router/anchor 正确、#6 innerHTML sink 安全。
  - **可接受/固有/已缓解（记录不改）**：#4 `ADD_ATTR:['target']`——已由 enhance() 对任意 `target=_blank` 兜底加 `rel=noopener`（Phase B），安全；#5 `docs/*.md` 信任边界——markdown 即内容、DOMPurify 兜底，属固有；#7 语言切换 aria-pressed in `role=group`——可操作、改 radiogroup 需方向键交互、收益低（同 Phase B 决定）；#8 `pre`/`table` `tabindex=0` 增加 tab stop——是 WCAG 2.1.1「可滚动区域可键盘聚焦」的推荐做法、属可接受权衡。
  - **#9 mermaid 自动 aria-label 偏长/无关系（medium）**：本书的取舍——自动派生给出图的**真实元素**（合规的 WCAG 1.1.1 文本替代），**关系交给相邻正文**（aria-label 明示「关系见正文」）；逐图手写 160 条 prose 是 AI-slop 陷阱，故不做。视为已 honest 缓解、非追求完美。

### 5.3 二轮审查门与收尾
- 二轮 index.html 改动（mermaid a11y + 语言正则 + aria-busy 播报 + CSP）经 Playwright 复验全 PASS、**0 CSP 拦截**。
- **审查门**：二轮对抗审查由 **review-spa 真跑**（本书自带的对抗审查配方、经真实 Workflow 工具，`wf_f1b6bf8b-2f4`）+ Playwright 浏览器验证承担；codex 因 Phase C 卡死未再跑（3 处新修复均小且已浏览器验证、主窗口交叉核对）。
- **复验循环到此为止**：14→10 且修复项清零、新项均为低危/正面确认/可接受/纵深防御，再跑只会 surface 递减的低危项。
