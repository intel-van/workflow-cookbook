# Session R5 交接文档 · workflow-cookbook

> 写给下一个接手的 session。本文件**已脱离 `.gitignore` 黑名单**（末尾 `!SESSION-R5-HANDOFF.md`），随 `main` 一并提交、推送、部署。前一轮见 `SESSION-R4-HANDOFF.md`（已入库）。

## 0. 一句话状态

R5 完成 **Phase 3**（深化实战食谱 + 新增第六部·创作篇 3 章 + 真跑 3 个应用级工作流 + MCP 降为诚实小节）与 **Phase 5**（前端微调 + 真浏览器验证 + 两路跨模型对抗审查并落实）。两路审查：**codex** 审 Phase 3 文档事实（5 CRITICAL + 2 WARNING 全修）、**agy/antigravity** 审前端（9 条，8 采纳 / 1 否决）。anchor-audit **0 问题**，全部 push 部署。**全书规划范围已基本完成**，事实层经两轮跨模型审查；R6 主要是维护与新需求。

## 1. 权威事实（git / 线上，可复核）

- **HEAD ≈ 本交接提交**（叠加在 `53499f6` 之上）。
- **R5 提交**（旧→新）：
  - `e442edd` feat(r5): 深化第三部食谱 + 新增第六部·创作篇（真跑驱动）
  - `9f04c59` fix(r5): 前端 a11y + 正确性打磨（review-spa 真跑驱动）
  - `e496bcd` fix(r5): 按 codex 审查修正第三部夸大的权威/schema 语义
  - `53499f6` fix(r5): 落实 agy 前端跨模型审查（a11y/UX 微调）
  - （+ 封面统计修正 `26→29 章 / 6 附录` + 本交接提交）
- **线上**：<https://agi-is-going-to-arrive.github.io/workflow-cookbook/> 分支部署（`build_type=legacy`，源 `main`/root）。⚠ **切勿改回 Actions Pages**——账号 Actions 被计费封禁。
- **结构**：**29 章**（含第六部 27/28/29）**+ 6 附录（A–F）+ 序**；`manifest.json` 含 `part-6`×zh/en；anchor-audit：**72 文档 / 811 链接 / 0 问题**。

## 2. R5 主要产出

### 2.1 Phase 3 — 内容
- 深化薄弱章 **p3-10/12/13/15/16**（zh/en 对照，引真实 Run ID）。
- 新增**第六部·创作篇**：**ch27 工作流创作流程**（含 MCP 诚实小节，引 `wf_d8aa0772-ced`）、**ch28 校验与调试**（据 `validator-r4.md`）、**ch29 示例画廊**（由下方 3 个真跑驱动）。
- **真跑 3 个应用级工作流**（证据 `assets/transcripts/examples-r5.md`）：

  | 脚本 | 模式 | Run ID | agent | token | 墙钟 | 结果 |
  |---|---|---|---|---|---|---|
  | review-spa.js | pipeline + 对抗验证 | `wf_97b81e86-a0b` | 22 | 991,554 | 395,166ms | 18 条确认(bug6/sec4/a11y8) |
  | dead-code-scan.js | loop-until-dry | `wf_2283ab37-710` | 2 | 116,344 | 246,496ms | 2 轮全干净，DRY_STREAK 终止 |
  | feedback-themes.js | parallel 屏障 | `wf_b3febb70-ad9` | 20 | 607,307 | 122,391ms | 18 项→8 主题 |

  ⚠ **成本教训**：`CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-4-7[1m]` **覆盖**了脚本里的 `model:'haiku'`（如 feedback-themes 的 18 个 summarize agent 实跑 Opus），3 次真跑合计 **≈171.5 万 token**（远超 30–45 万预估）。已如实写进 examples-r5.md / ch29——「设了该环境变量时 `model:'haiku'` 省不了钱」。

### 2.2 Phase 5 — 前端（用户「比较满意」，只微调不大改）
- **真浏览器验证**（Playwright，本地 `python3 -m http.server 8765`）：首页 / 章节 / mermaid（2 图渲染为 SVG）/ 代码卡片 / 路由 / 焦点全部正常，**0 console 错误**。
- ⚠ **缓存坑**：Playwright 浏览器会缓存 `index.html`，验证改动须用查询串绕缓存（如 `http://localhost:8765/?r5fresh=1#/zh/home`），否则看到旧文件。

### 2.3 两路跨模型对抗审查（本轮新做，均经主窗口逐条验证后落实）
- **codex（Phase 3 文档事实｜read-only 沙箱｜默认模型｜214,286 token）**：5 CRITICAL + 2 WARNING，**0 个虚构 Run ID**；全部修复。证据 `assets/transcripts/codex-phase3-review-r5.md`。
  - ⚠ **纠偏**：其中 p3-10「约 10 个 agent 在跑」被 codex 误判为虚构——实为**官方工具描述原文** `only ~10 run at any moment`，已纠为「消除『公式(16核→14)紧挨约10』的表观矛盾、但不污蔑造假」。**教训：审查器也会把真实事实误判为造假，落实前必须交叉核对 `_grounding.md`/transcripts。**
- **agy / antigravity（Phase 5 前端｜7851 字节报告）**：9 条，**8 采纳**（mermaid 守卫、route 哨兵、code `pre` focus outline、对比度 `#B8430F→#AF3E0D`、移除全局 `scroll-behavior:smooth`、scroll-spy 底部高亮、ch-nav 聚焦反馈、lang-toggle 非活动 hover），**1 否决**（移动端 44px 触摸热区——现尺寸已满足 WCAG 2.5.8 AA 的 24px，agy 的 `::after` 叠加方案有点击重叠风险）。证据 `assets/transcripts/agy-frontend-review-r5.md`。

## 3. 重要操作教训（新）
- **agy headless 必须重定向 stdin**：`agy --print "..."` 若 stdin 是未关闭的管道，会卡在 **stdin-EOF 死锁**（本轮首跑 18:45 / 0 字节 / CPU 0% / 无网络连接）。修复：`agy --print "..." < 文件`（或 `< /dev/null`）给足 EOF。R4 所说「agy headless 坏」实为此死锁，非纯认证问题——**本轮 agy headless 经此修复已可用**。
- **codex/agy 经 ccg 真实调用**：codex 用 codex-plugin-cc（`codex exec -s read-only --skip-git-repo-check`，默认模型、勿传 `--model`）；agy 用 `agy --print`（注意上面 stdin 坑）。后台跑、完成有通知，主窗口只读末尾结论。

## 4. 仍为「第三方未核实」（引用须标注，未变）
错误类名 `WorkflowAgentCapError`/`WorkflowBudgetExceededError`、`stallMs`/重试次数、预算耗尽时在途 agent 处置、resume 缓存键**精确字段组成**、`'inherit'` 精确语义、schema 重试**确切次数**。（已实测确认项见 `_grounding.md` §A/§C。）

## 5. 关键文件地图
- `assets/_grounding.md` — **唯一规范源**（官方/实测/第三方三级 + §C 真跑表 + 写作标准）。改事实先改这里。
- `docs/{zh,en}/*.md` — 正文，**必须 zh/en 完全对照**。`manifest.json` — 章节↔文件↔标题映射。
- `index.html` — 零构建 SPA。`slugify` 约 **316–324 行**（仅 h2/h3 生成 id）；`route()` 约 409；mermaid 渲染约 540–551（含 R5 加的 `if(!pre||!pre.parentNode) return` 守卫）；`onScroll`/scroll-spy 约 605–616。（R5 改动后行号略有位移，按内容定位。）
- `assets/transcripts/` — 真跑与审查证据：`examples-r5.md`（3 个 R5 真跑）、`codex-phase3-review-r5.md`、`agy-frontend-review-r5.md`，及 R4 的 `api-facts/sandbox/repo-claims/mcp-access/validator/r3-reverification`。
- `scripts/anchor-audit.mjs` — 跨平台链接/锚点/i18n/大小写审计，**新增章节后必跑**（期望 `TOTAL ISSUES: 0`）。

## 6. 待办 / 接力点（R6）
- 全书规划范围（认知 / 基础 / 食谱 / 进阶 / 生态 / 创作 + 附录）**已完成、已上线、事实层经两轮跨模型审查**。**无强制待办。**
- 可选增强：①若要更高 a11y，可重审被否决的 44px 触摸热区（须测试避免点击重叠）；②若要更多真跑示例，先经用户/CI 调 `CLAUDE_CODE_SUBAGENT_MODEL` 控成本（否则 `model:'haiku'` 被覆盖、按 Opus 计费）；③对比度变更 `#AF3E0D` 若用户不喜欢可一行回退为 `#B8430F`。
- 阻塞（用户侧）：GitHub 账号 **Actions 被计费封禁**——只影响 Actions，分支部署不受影响。

## 7. 协作铁律（贯穿，勿忘）
绝不虚构、信源三级权威分级；能实测就真跑（含 Playwright 真浏览器）；每大阶段后交跨模型（codex / agy）对抗审查再改（**落实前交叉核对——审查器会误判真实事实**）；主窗口编排、繁重读写派子代理；跨平台正确（Pages=Linux 大小写敏感）；zh/en 完全对照；每完成一个 phase 即 commit+push（标准授权，push=部署）；**切勿改回 Actions Pages**。
