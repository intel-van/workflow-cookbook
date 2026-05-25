# 应用级示例工作流真跑记录（R5）

> 本文件记录 R5 轮对 `assets/examples/` 三个**应用级**工作流脚本的**真实运行**（`CLAUDE_CODE_WORKFLOWS=1`，用 Workflow 工具）。每条都有可溯源的 Run ID、agent 数、token 用量与墙钟。第 29 章「示例画廊」据此写作。
>
> **环境**：Claude Code v2.1.150 · `CLAUDE_CODE_WORKFLOWS=1` · 主循环 Opus 4.7 (1M) · `CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-4-7[1m]`。
> **运行日期**：2026-05-25（R5）。
> **调用方式**：`Workflow({ scriptPath: '/Users/yangjunjie/Desktop/workflow-cookbook/assets/examples/<脚本>.js' })`，后台异步，完成时由 `<task-notification>` 回传 `usage`/`result`。

---

## 汇总表

| # | 脚本 | 模式 | Run ID | agent_count | total_tokens | tool_uses | duration_ms | 结果要点 |
|---|---|---|---|---|---|---|---|---|
| R5-1 | review-spa.js | pipeline + 对抗验证 | `wf_97b81e86-a0b` | 22 | 991,554 | 148 | 395,166 | 18 条确认（bugs 6 / sec 4 / a11y 8）；多条经验证降级为 latent |
| R5-2 | dead-code-scan.js | loop-until-dry | `wf_2283ab37-710` | 2 | 116,344 | 14 | 246,496 | 2 轮全干净、0 候选，DRY_STREAK 终止 |
| R5-3 | feedback-themes.js | parallel 屏障 | `wf_b3febb70-ad9` | 20 | 607,307 | 3 | 122,391 | 18 项 → 8 主题（按计数排序） |

> ⚠ **关键实测发现（成本）**：`feedback-themes` 脚本把 18 个摘要 agent 标了 `model:'haiku'`，但本会话 `CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-4-7[1m]` **覆盖了 per-call model**（见 `assets/_grounding.md` §A2、Run `wf_9c94951d-58c`），18 个「haiku」agent 实际全跑 Opus 1M → 单次 **607,307 token**。这印证了「一旦设置 `CLAUDE_CODE_SUBAGENT_MODEL`，脚本里的 `model` 选项被静默忽略」。**结论**：在设了该环境变量的会话里，`model:'haiku'` 省不了钱；要真省钱得由用户/CI 调该变量，脚本无法控制。

---

## R5-3 · feedback-themes.js（parallel 屏障：并行摘要 → 聚类）

- **Run ID**：`wf_b3febb70-ad9`（Task `wh31drag1`）
- **脚本**：`assets/examples/feedback-themes.js`
- **输入**：`assets/samples/feedback-sample.csv`（合成样本，18 行，列 `id,text`）
- **编排**：`phase('Load')` 单 agent 读 CSV → `parallel()` 屏障并发摘要每行（每行一个 agent）→ `phase('Cluster')` 单 agent 跨全集聚类。
- **用量**：agent_count **20**（= 1 load + 18 summarize + 1 cluster，与 18 行输入吻合）；total_tokens **607,307**；tool_uses **3**；duration_ms **122,391**（≈2.0 分钟）。
- **返回**：`{ itemCount: 18, themeCount: 8, themes: [...] }`。

**8 个主题（按 count 降序，引用真实聚类输出）**：

| 排序 | 主题 | count | 代表引用（节选） |
|---|---|---|---|
| 1 | Onboarding 体验摩擦（步骤不清、缺前置、价值兑现慢） | 4 | "the first-run experience requires reading three documentation pages before the app delivers any value." |
| 2 | 性能与加载速度（仪表盘 / 分析 / 图表渲染） | 3 | "the dashboard takes nearly 8 seconds to load, making the app feel sluggish" |
| 3 | 计费准确性与清晰度（定价定义、重复扣费、收件人配置） | 3 | "Customer was charged twice this month and waited four days for a support response" |
| 4 | 错误处理质量（提示无用、崩溃） | 2 | "error messages are too generic and unhelpful" |
| 5 | 功能请求（导出、高级用户导航） | 2 | "add an export-to-CSV button on the reports screen" |
| 6 | 无障碍与 UI 缺陷（对比度、Esc 关闭模态） | 2 | "Modal dialogs cannot be closed with the Escape key" |
| 7 | 文档缺口（失败/恢复场景） | 1 | "the lack of guidance on recovering from a failed migration." |
| 8 | 搜索国际化（非拉丁 / Unicode 支持） | 1 | "the search box fails to return any results for queries containing non-Latin characters (e.g., Japanese)" |

**要点**：①`parallel()` 是真屏障——聚类需要**全部**摘要到齐才能跑，这正是「屏障而非 pipeline」的正确场景（对照 §A2 与第 8 章）。②token ≈ agent 数 × 每 agent 上下文，20 agent × ~30k ≈ 600k，与实测吻合。③成本被 Opus 覆盖放大（见上方警告）。

---

## R5-2 · dead-code-scan.js（loop-until-dry：逐轮扫描直到连续干净）

- **Run ID**：`wf_2283ab37-710`（Task `w4ii328zm`）
- **脚本**：`assets/examples/dead-code-scan.js`
- **目标**：`index.html`（SPA 的内联 vanilla JS）
- **编排**：`while (emptyRounds < DRY_STREAK && round < MAX_ROUNDS)`，每轮 1 个 finder agent 扫 `index.html` 找「定义了但全文未被引用」的符号；`DRY_STREAK=2`、`MAX_ROUNDS=5`；**只报告、不改文件**。
- **用量**：agent_count **2**；total_tokens **116,344**；tool_uses **14**（finder 多次 Read/grep 同一文件）；duration_ms **246,496**（≈4.1 分钟）。
- **返回**：`{ rounds: 2, candidateCount: 0, candidates: [] }`。

**要点**：①两轮均 0 候选 → 连续 2 个空轮触发 `DRY_STREAK` → 循环正常终止（**没有**跑满 5 轮上限）。agent_count=2 印证「2 轮 × 1 finder」。②**0 个未引用符号**——这是 `index.html` 的一份「干净体检」，也说明 loop-until-dry **即使零发现也能正确收敛**。③report-only 非破坏性：演示了「扫描类大扫除默认先报告、人审后再改」的安全姿态（对照第 16 章、第 18 章）。

---

## R5-1 · review-spa.js（pipeline 多维审查 + 对抗验证）

- **Run ID**：`wf_97b81e86-a0b`（Task `wq64i8tjl`）
- **脚本**：`assets/examples/review-spa.js`
- **目标**：`index.html`（~600 行 vanilla-JS SPA）
- **编排**：`pipeline(DIMENSIONS, 审查, 验证)`。3 个维度（bugs/security/a11y）各 1 个 reviewer（`schema=FINDINGS`）；某维度审完即对其每条发现 `parallel()` 扇出 1 个 `model:'haiku'` 的 verifier（`schema=VERDICT`，被要求**尽力 refute**，refute 不掉才算真）。pipeline 让「本维度审完就验」，不等最慢维度。
- **用量**：agent_count **22**；total_tokens **991,554**；tool_uses **148**；duration_ms **395,166**（≈6.6 分钟）。
- **返回**：`{ confirmedCount: 18, confirmed: [...] }`——18 条经对抗验证存活、`verdict.isReal=true` 的发现。

### 18 条确认发现（按维度）

**bugs（6）**

| sev | 标题 | index.html 行 | 核心缺陷 |
|---|---|---|---|
| high | slugify 去重用裸 `{}` | 322, 521 | `seen={}` 继承 `Object.prototype`，标题 "constructor" 得到 id `constructor-NaN`（`++function=NaN`）。修：`Object.create(null)` |
| high | 锚点无法解析 NaN/后缀 id | 316, 514, 516, 524 | 赋 id 时带 `seen` map，resolver 却用**无 map** 的 slugify 重算，`#constructor` 找不到 `constructor-NaN` |
| medium | dedup 后缀与数字结尾标题撞车 | 317, 322, 584, 596 | `['Setup','Setup 1','Setup']`→两个 `setup-1`，重复 DOM id，jumpTo 落错 |
| medium | route() 覆盖已存语言偏好 | 313, 350, 408, 411 | 深链 `#/zh/...` 让 EN 用户的 localStorage 被静默改成 zh |
| low | manifest 加载错误硬编码中文 | 343, 349, 475 | catch 用 `I18N.zh.loaderr`，EN 用户看到中文报错 |
| low | scroll/resize 共用 `ticking` 标志 | 303, 393, 601 | scroll 占 rAF 时 resize 被丢（单帧、瞬态） |

**security（4，均潜在/供应链，无攻击者输入）**

| sev | 标题 | index.html 行 | 核心缺陷 |
|---|---|---|---|
| medium | mermaid SVG 绕过 DOMPurify | 486, 537-545 | `fig.innerHTML=svg` 在 sanitize 之后注入，仅靠 `securityLevel:'strict'` 兜底 |
| medium | 4 个 CDN 脚本无 SRI | 295-297, 328 | 无 `integrity`/CSP，CDN 被投毒即整层失守 |
| low | ghLink.href 无 scheme 校验 | 283, 347 | manifest `site.repo` 若为 `javascript:` 成为可点执行链接 |
| low | manifest 字段转义不一致 | 311, 443 | `c.num` 未 esc 与 `esc(c.title)` 并排（维护性隐患） |

**a11y（8）**

| sev | 标题 | index.html 行 | 核心缺陷 |
|---|---|---|---|
| high | 整章注入 `aria-live` 区 | 289, 488 | `#content` 带 `aria-live=polite`，每次导航朗读全章 |
| medium | 激活项无 `aria-current` | 416, 610 | 当前章节仅靠颜色，屏幕阅读器无程序化提示 |
| medium | 移动抽屉背景未 inert | 270, 399 | 仅 Tab 陷阱；虚拟光标仍可达背景 `.shell` |
| medium | 首页切换不移焦点 | 447, 492 | renderChapter 移焦 h1，renderHome 不移 |
| medium | mermaid SVG 无替代文本 | 537-547 | 115 处图无 `role=img`/`aria-label` |
| medium | 代码块不可键盘滚动 | 136, 550-570 | `pre` 无 `tabindex`，键盘用户无法滚动溢出代码 |
| low | 品牌分隔符暴露给 AT | 261, 358, 432 | `·`/`.` 无 `aria-hidden`，被读作"中点" |
| low | `--accent #F05C00` 对比 3.22:1 | 24 | 不达 AA 正文阈值（当前仅用于大字号，故 latent） |

### 对抗验证的价值（关键教学点）

验证阶段不仅判真伪，还**纠正了 reviewer 的夸大**——这正是「对抗验证」（第 17 章）的意义，`verdict.reason` 的精度澄清本身是产物：

- **#1/#2 标题夸大**：标题列举 `constructor/valueOf/toString/...` 多个原型键，实测**仅 `constructor` 可触发**（其余被 `.toLowerCase()` 打平为 `valueof`/`tostring` 等而 miss）；且 grep 全仓库**无 "constructor" 标题** → 实为 **latent**，high severity 偏高。
- **#2 一处假子主张**：称 `#overview-1` 这类普通 dedup 锚点不可达——实测**正常 dedup（`-1`/`-2`）主查找即命中、完全可达**，只有 `constructor-NaN` 这一特例坏。
- **#3 措辞误差**：把"第 3 个 `Setup`"说成"第 2 个"（机制仍成立）。

**因此：发现存活 ≠ 全盘照收**。下面的 Phase 5 清单据 `verdict` 把 latent/供应链/瞬态项与「今天就触发」项分开。

### Phase 5 可落地清单（供前端打磨 index.html）

排除：纯 latent（裸 `{}`/锚点/撞车三项今天无 "constructor"/数字撞车触发）、供应链/维护性（SRI/scheme/转义，无攻击者输入）、瞬态（ticking）、装饰性 latent（对比度当前 PASS）。

**★ 高优先（`isReal=true`、非 latent、今天就触发）**

- **a11y/high — L289**：删除 `#content` 的 `aria-live="polite"`（保留 `#live` 状态通道 + 现有 h1 移焦）。每次导航都触发。
- **a11y/medium — L537-547**：mermaid `figure` 加 `role="img"`+`aria-label`（仓库 115 处图全受影响）。
- **a11y/medium — L550-570**：溢出 `pre`/`.code-card` 加 `role=region`+`tabindex=0`+`aria-label`（复用表格 L533 现成写法）。
- **a11y/medium — L416 & L610**：active 切换时同步 `aria-current`（侧栏 + TOC scroll-spy 两处）。
- **a11y/medium — L399**：抽屉打开给 `.shell` 设 `inert`/`aria-hidden`，关闭移除（≤920px）。
- **a11y/medium — L447**：renderHome 给 masthead h1 加 `tabindex=-1` 并 `.focus()`，对齐 chapter 路径。
- **bugs/medium — L411**：route() 删 `saveLang(lang)`，只更新 `S.lang`；仅 switchLang() 显式切换才持久化（否则跨语言深链误改偏好）。

**普通优先（真实、今天触发、影响小）**

- **bugs/low — L343**：catch 改 `I18N[getSavedLang()||'zh']`，勿硬编码 `.zh`。
- **a11y/low — L358 & L432**：`.dot` 分隔符 span 加 `aria-hidden="true"`（注意 applyLangChrome 在 L358/432 重写 L261 静态标记，须改这两处）。

**可选/防御性（latent，纳入「硬化」时再做）**：ghLink href 加 `^https?:` 校验；4 个 CDN script 补 `integrity`+`crossorigin`；`c.num` 统一 `esc()`。
