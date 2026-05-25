# Session R4 交接文档 · workflow-cookbook

> 写给下一个接手的 session。本文件**已脱离 `.gitignore` 黑名单**（`.gitignore` 末尾 `!SESSION-R4-HANDOFF.md`），随 `main` 一并提交、推送、部署，按用户要求作为正式跨会话交接物。
> 前一轮交接见 `SESSION-R3-HANDOFF.md`（仍被 gitignore，仅本地）。

## 0. 一句话状态

R4 完成「真实复测沙箱/第三方声称 → 事实分级落地 → 跨模型(codex)对抗审查并修复 → 跨平台/i18n/链接锚点终检（0 问题）」全链路；**事实层可安全发布**，站点已上线。**仍待做：Phase 3（创作篇 3 章 + 真跑 3 个应用级工作流）与 Phase 5（前端打磨 + antigravity 审查）**。

## 1. 权威事实（git / 线上，可直接复核）

- **HEAD = `e9eb344`**（`fix(r4): reconcile Phase 2 source-authority tiers`），已 push `origin/main`。
- **R4 本轮提交**（旧→新）：
  - `2779414` feat(r4): 事实三级分级 official/verified/third-party + 新增真跑示例脚本 + R4 transcripts
  - `24ac3fa` ci: 加 Actions Pages workflow　→　`a8c4459` ci: **撤掉** Actions、改**分支部署**（账号 Actions 被计费封禁）
  - `e9eb344` fix(r4): 按 codex 审查修复 5 CRITICAL + 2 WARNING 权威分级矛盾（本文件所属提交将叠加其上）
- **线上**：<https://agi-is-going-to-arrive.github.io/workflow-cookbook/>　HTTP 200，分支部署（`build_type=legacy`，源 `main`/root，classic builder）。
- **部署机制（重要）**：**push `main` 即构建+发布**。`.nojekyll` 在。⚠ **切勿改回 Actions 部署**——本账号 GitHub **Actions 被计费问题封禁**（"recent account payments have failed…"）。若部署异常，先查 `gh api repos/AGI-is-going-to-arrive/workflow-cookbook/pages` 的 `build_type` 是否仍为 `legacy`。
- **结构**：26 章 + 6 附录（A–F），`manifest.json` 33 条 × zh/en = 66 文件，全部存在、配对、大小写精确（见 §6 审计）。

## 2. 本 session 主窗口亲自执行并验证的改动

### 2.1 事实三级分级落地（`assets/_grounding.md` 为规范源）
- 三级：**①官方**（工具定义/sdk-tools.d.ts）/ **②实测**（有可溯源 Run ID，证据在 `assets/transcripts/`）/ **③第三方未核实**（`claude-code-workflow-creator` 是某 YouTuber 配套视频 `c0gVowvMR-g` 的仓库，**非官方**，只借思路、必须标注未核实）。
- R4 把第三方声称中**能复现的**实测升级为事实：meta 保留键被拒、`isolation:'remote'` 禁用（+未知值静默忽略的纠正）、`model` 无提交期校验、VM 30000ms 同步超时、args 透传、注入全局。**仍为第三方未核实**：错误类名 `WorkflowAgentCapError`/`WorkflowBudgetExceededError`、`stallMs`/重试次数、预算耗尽在途 agent 处置、resume 缓存键**精确字段组成**、`'inherit'` 精确语义、schema 重试确切次数。

### 2.2 按 codex 审查修复的 7 处（提交 `e9eb344`，已逐条自验）
- **CRITICAL**：① VM 30000ms 超时在 app-a:117 仍标第三方 → 升级实测（`wf_e3b2b123-5f4`）；② `opts.model` 拆分：无解析期校验=实测（`wf_dace2fc6-966`），`'inherit'`语义/API期失败=第三方；③ resume 缓存键**精确组成**降级第三方，只留"同脚本同 args=100%命中"（`wf_9c94951d-58c`）为实测；④ app-e 真跑语料过时"10/9"→ 全集 **19 记录/17 唯一**（E.3 改称"第一批"）；⑤ verbatim 超时错误串补 `Error:` 前缀，全仓库对齐 transcript `repo-claims-r4.md:51`。
- **WARNING**：⑥ app-e 源索引 model 证据指针由 `api-facts-r4.md` 改指 `repo-claims-r4.md`；⑦ app-e 补 `r3-reverification.md` 信源行（budget 探针 `wf_fd09a6ed-38a`）。
- **额外**：修了 agent 给 E.3 标题加"First Batch/第一批"导致的 **slug 漂移断锚**——用真实 slugify 算准新 slug，`replace_all` 同步 6 个入站锚点（zh/en）。

### 2.3 跨平台 + i18n + 链接/锚点终检（§6 脚本，**0 问题**）
66 文档 / 801 链接（510 跨页 `#/lang/id` + 284 同章裸锚点）：0 缺失文件、0 大小写不匹配（Linux/Pages 安全）、0 i18n 缺口、0 坏跨页链接、0 断锚、0 缺失图片资源。

## 3. codex 跨模型对抗审查（本 session，结果已由主窗口验证）
- 机制：**直接 `codex exec -s read-only --skip-git-repo-check -`**（`run_in_background`，本会话跟踪、完成有通知），默认模型 `gpt-5.5`/provider cliproxy/xhigh，213,897 token。提示词存 `C:/Users/8bit/AppData/Local/Temp/codex-review-prompt.txt`，原始输出 `…/codex-review-out.txt`（**真报告在文件末尾**，约 39 行处的 `## FINAL REPORT` 是提示词回显、不算）。
- 结论：初判 **Not safe to ship**（5 CRITICAL + 2 WARNING，**0 个虚构 Run ID**）→ 全部修复并自验后，事实层安全。
- ⚠ 工具教训（已写入 memory `reference-multimodel-tooling`）：**`codex:codex-rescue` 子代理不可靠**（转发的 detached job 在子代理结束时一起死掉）；优先用 **codex-plugin-cc 斜杠命令**（`/codex:review`、`/codex:adversarial-review --background`、`/codex:rescue`，用默认模型、勿传 `--model`）或上面的直跑 Bash 后备。

## 4. 真实运行记录（信源，存于 `assets/transcripts/`）
- **共 19 条完成记录 / 17 个唯一 Run ID**（18 完成 + 1 因 30s 同步超时 failed；#4 复用 #1、#15 复用 #14 续传不计独立；另有 2 次提交即被拒无 Run ID）。完整表见 `assets/_grounding.md` §C（#1–#10 第一批；#11–#19 为 R4）。
- **R4 新增 transcript**：`api-facts-r4.md`（agentType 校验/resume 命中/嵌套一层）、`sandbox-r4.md`（禁用双层/注入全局/args 透传/宿主 API 缺席/`CLAUDE_CODE_SUBAGENT_MODEL` 覆盖）、`repo-claims-r4.md`（逐条复测第三方声称）、`mcp-access-r4.md`（subagent 经 ToolSearch 端到端调通 context7）、`validator-r4.md`（第三方 `validate-workflow.mjs` 实跑行为）、`r3-reverification.md`（R3 基线复验 + budget 探针 `wf_fd09a6ed-38a`）。

## 5. 关键文件地图（给新 session）
- `assets/_grounding.md` — **唯一规范源**（官方/实测/第三方三级 + §C 真跑表 + 写作标准）。改事实先改这里。
- `docs/{zh,en}/*.md` — 正文，**必须 zh/en 完全对照**。`manifest.json` — 章节↔文件↔标题映射。
- `index.html` — 零构建 SPA（vanilla JS + marked + DOMPurify + highlight.js + mermaid）。`slugify` 在 **316–324 行**（h2/h3 才生成 id；裸 `#anchor` 由 506–520 行点击拦截器以 `getElementById(raw)||getElementById(slugify(raw))` 解析、仅对**当前渲染章节**）。
- `assets/examples/{review-spa,dead-code-scan,feedback-themes}.js` — **3 个已过校验器、但尚未真跑**的应用级工作流脚本（Phase 3 要真跑）。`assets/samples/{feedback-sample.csv,buggy-cart.js}` — 配套输入（合成数据、已标注）。

## 6. 可复跑校验命令（新 session 回归用）
链接/锚点/跨平台/i18n 全量审计脚本（本 session 写的，复刻 `index.html` slugify）：
```bash
node C:/Users/8bit/AppData/Local/Temp/anchor-audit.mjs   # 期望 TOTAL ISSUES: 0
```
> 该脚本在 Temp，未入库；如需长期保留可移入 `assets/` 或 `scripts/`。核心逻辑：复刻 slugify + seen 去重，比对 `](#frag)` 与各文件 h2/h3 生成的 id，并校验 `#/lang/id` ∈ manifest、图片资源大小写精确存在。

## 7. 待办 / 阻塞（新 session 接力点）
- **Phase 3（最大块，未动）**：
  1. 深化薄弱章节（p3-10/12/13/15/16 等"实战食谱"章）。
  2. 新增 **第六部 · 创作篇** 3 章：**27 工作流创作流程** / **28 校验器与调试**（`validate-workflow.mjs` 实测行为已在 `validator-r4.md`）/ **29 示例画廊**。
  3. **真跑** `assets/examples/` 的 3 个工作流（review-spa / dead-code-scan / feedback-themes），把真实 Run ID/用量写进第 29 章（决策：**全部真跑应用级**，预算约 30–45 万 token）。
  4. 把 MCP（context7 已实测调通，`wf_d8aa0772-ced`）降级为**诚实小节**——多数工作流不需要 MCP（官方 6 例中 4 例零 MCP）。
  > 注：新增章节须同步 `manifest.json`（新增"第六部"part + 3 章 × zh/en）并保持 i18n 对照；改完跑 §6 审计。
- **Phase 5**：前端打磨（用户已"比较满意"，只微调）；**antigravity/`agy` 对抗审查**——目前 headless/`-p` 模式坏（exit 0 返回空、需交互登录），**暂缓**，待用户认证 `agy` 后再做；其间用 codex + Playwright 替代。
- **阻塞（用户侧）**：GitHub 账号 **Actions 被计费封禁**——只影响 Actions，不影响当前分支部署；用户修复计费后 Actions 才能用。

## 8. 协作铁律（贯穿，勿忘）
绝不虚构；信源三级权威分级；能实测就真跑（含 Playwright 真浏览器）；每大阶段后交跨模型(codex)对抗审查再改；主窗口负责编排、繁重读写派子代理；跨平台正确（Pages=Linux 大小写敏感）；zh/en 完全对照；**每完成一个 phase 即 commit+push（用户标准授权，push=部署）**。
