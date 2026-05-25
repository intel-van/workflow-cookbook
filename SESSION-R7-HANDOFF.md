# Session R7 交接文档 · workflow-cookbook

> 写给下一轮（R8）接手者，也作为本仓库「每一轮真实所做之事」的可追溯账本。承 [`SESSION-R6-HANDOFF.md`](SESSION-R6-HANDOFF.md)。
> **真值原则**：每条都能追溯到 ① 真实 git 提交（附短哈希）② `assets/transcripts/` 真实运行/审查记录 ③ `assets/_grounding.md` 规范源。凡无依据者不写。末尾给自验命令。

---

## 0. 一句话状态

R7 是一轮**「以最苛刻姿态全量复核 + 真实补缺 + 安全打磨」**，共 **5 个 phase / 5 个提交**（`39a8c6b` → `aeaf7b7`，均 2026-05-25/26 已 push）。核心结论：**全书事实层与文风经多 agent + 双模型独立复核后被确认为高质量**——这一轮没有推倒重来，而是用「全量审读」兑现覆盖、只在确有价值处动笔。本轮亲自实跑 1 个探针 workflow（`wf_e8cb23ff-829`）锚定真值；发现并写入**两层模型覆盖**这一更精确事实；对第三方声称的 schema 命名 bug **实测未复现、据实降级**；前端经 **antigravity（agy，本轮可用）真实对抗审查** + Playwright 实测。**全书规划范围保持完成态，curated 真跑数维持 23。**

---

## 1. R7 提交账本（逐条可追溯 · `git log 341dad8..HEAD`）

> `341dad8` 是 R6 最后一个提交。其后为 R7 提交，均已 push `origin/main`。

| 提交 | 主题 | 真实改动 | 配套信源 |
|------|------|----------|----------|
| `39a8c6b` | feat: Phase 0+A 真值锚定 + 定向补缺 | `_grounding.md`（§A 别名重映射行、§A2 两条实测、§C2 探针注记）、`examples-r7.md`(新)、`app-a`/`app-d`×zh/en（两层覆盖）、`p2-07`×zh/en（schema 命名软提示）、`.gitignore`(.ccg) | `assets/transcripts/examples-r7.md` + 实测 env |
| `db6ea09` | fix: Phase B 全量 36 章复核 | `app-e`×zh/en（19/17→23）、`app-d`×zh/en（索引补词条）、`p3-13`×zh/en（章末误述+续读链）、`p4-20`×zh/en（小节号理顺） | 6 个并行审计 agent 报告 |
| `2333abb` | polish: Phase C 全书文风审读 | `p3-14`(病句)、`p3-13`/`p3-15`/`p4-21`/`p5-25`（去拔高词），均 zh | 6 个并行文风审读 agent 报告 |
| `aeaf7b7` | fix: Phase D 前端打磨 | `index.html`（面包屑截断、zh blockquote 去斜体、lang-toggle 焦点框、scrim 归焦、copy :active） | `agy` 审查 + Playwright 实测 |

> 第 6 个提交为本交接文档。

---

## 2. R7 真实产出（按 Phase）

### 2.1 Phase 0 — 真值锚定与实测（`39a8c6b`，主窗口直接实测）
- **实测会话 env**（直接 `env`）：`CLAUDE_CODE_WORKFLOWS=1`、`CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-4-7[1m]`、`ANTHROPIC_DEFAULT_HAIKU_MODEL/SONNET/OPUS`（均 opus）、`AI_AGENT=claude-code_2-1-150_agent`、`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。**净新发现**：模型覆盖是**两层**（`CLAUDE_CODE_SUBAGENT_MODEL` + `ANTHROPIC_DEFAULT_*_MODEL` 别名重映射），比此前只记一层更精确。
- **探针 workflow** `wf_e8cb23ff-829`（4 agent / 93,026 token / 15,032ms）：复确认 `agentType` 抛错+14 agent 清单、`budget.total=null`/`remaining()=Infinity`（且发现 **JSON.stringify(Infinity)=null** 的序列化坑）；旁证 `meta.phases` 支持 `{title,detail}`/`{title,model}`。
- **schema 字段名 `ok` bug——实测未复现**：A/B（同一明确错误草稿，`ok` vs `draftIsFactuallyCorrect`）两者都正确返回 `false`。据此**不写成硬 bug**，降级为「字段命名清晰度」软提示，标「第三方报告、未复现」。
- 产出 `assets/transcripts/examples-r7.md`；更新 `_grounding.md` §A/§A2/§C2。

### 2.2 Phase A — 定向补缺（`39a8c6b`）
- 唯一真缺口 `ANTHROPIC_DEFAULT_*_MODEL` 两层覆盖 → `app-a`（A.4 安全做法 callout）+ `app-d`（术语表 + D.9 索引）×zh/en。
- schema 命名软提示 → `p2-07`（最佳实践之间的 callout）×zh/en。
- **prep agent 实测**：phases[].detail/model、512KB 上限、激活开关**早已多处覆盖**，无需新增（印证全书之全）。

### 2.3 Phase B — 全量 36 章对抗复核（`db6ea09`）
- 6 个并行只读 agent 按 part 分批、文件归属互斥、以 `_grounding.md` 为唯一真值，核对全 72 文件。**结论：全书无虚构、无矛盾、第三方项均已标注、zh/en 口径一致**。仅 4 处：1 MED（`app-e` 全书真跑数仍写 R4 基线 19/17 → 改 curated 23）+ 3 LOW（`app-d` 索引漏词条、`p3-13` 章末误称「食谱篇完结」且续读错链 ch17→ch14、`p4-20` 小节号 20.7→20.9→20.8 理顺）。每处主窗口看真实文本交叉核对后改。

### 2.4 Phase C — 全书文风审读（`2333abb`）
- 6 个并行只读「中文散文编辑」agent 通读全 35 章 docs/zh。**结论：文风已属高质量**（经纬隐喻贯穿、真实数据溯源、刻意教学性复述服务理解），仅 ~30 处轻微语气瑕疵 + **1 个真实语法 bug**，多数被 agent 自标 borderline/keep。
- **保守取舍**：只改确有价值处——`p3-14:157` 病句「怎么赢的判断的」→「怎么得出这个判断的」；去拔高词 `p3-13` 灵魂→核心 / `p3-15` 不可替代的价值→过人之处 / `p4-21` 完整心法→核心做法 / `p5-25` 超能力→零摩擦。**不 churn 已干净的散文**（避免事实漂移、避免引入新 AI 味）。未触碰任何数字/Run ID/代码/引用/结构。

### 2.5 Phase D — 前端打磨（`aeaf7b7`）
- **antigravity（agy v1.0.2）本轮可用**（非交互 `agy --print` 返回正常，不像 R6 卡 OAuth）→ 真做对抗审查，出 5 条具体建议。主窗口**逐条核实真实 index.html + Playwright 实测**后应用：① P1 移动端面包屑溢出（`.crumb` 加 ellipsis/min-width:0）——实测窄屏曾折行、修后单行截断；② P2 中文 blockquote 假斜体 → `html[lang="zh-CN"]` 作用域 `font-style:normal`（核实第 366 行 lang 切换会更新 `<html lang>`，故不误伤英文斜体；`.main em` 保守跳过）；③ P3 `.lang-toggle` 去 `overflow:hidden` + 按钮首尾圆角（焦点外圈不再被裁、药丸形状实测完好）；④ P4 `#scrim` 点击归还焦点给 `#menuBtn`（对齐既有 Escape 处理）；⑤ P5 `.code-copy:active` scale 微反馈。
- Playwright 桌面+移动实测：**0 console 错误**、面包屑单行截断、药丸完好、blockquote 正体。

---

## 3. 关键操作教训（新，可复现）
- **agy（antigravity）本轮可用**：`agy --print "..."` 非交互返回正常（v1.0.2，exit 0）。与 R6「OAuth headless 卡死」不同——R8 可直接用 agy 做前端审查；若再遇卡死，按 R6 预案 fallback Claude。
- **审查器误判防线仍要守**：agy 给的 5 条都先在真实 `index.html` 核对（如确认 `<html lang>` 会随切换更新，才敢上 `html[lang=zh-CN]` 作用域规则），再 Playwright 实测，方落地。**第三方/审查器的「修复建议」落实前必须独立核实。**
- **实测可以「证伪」第三方声称**：schema 命名 `ok` bug 我方 A/B 未复现 → 据实降级，不当硬 bug 写。这正是「一切以 Claude 实测为唯一真值」的体现。
- **JSON 序列化坑**：`budget.remaining()` 运行时是 `Infinity`，但放进对象 `JSON.stringify` 后变 `null`——要展示得 `String(budget.remaining())`。
- **「全量润色」≠「全量重写」**：对已高质量的散文，正确做法是全量**审读**（覆盖）+ 只改真问题，而非逐章重写（后者高风险、低收益、易引入 AI 味）。

---

## 4. 可验证事实清单（R8 用前先复核）
- **curated 真跑数维持 23**（R4 17 + R5 3 + R6 3）；R7 探针 `wf_e8cb23ff-829` 为**验证用**、不并入头条（与 R3 复验组、R6 Phase E 复验同处理）。README/index/manifest 口径一致（`grep -n '23 个唯一\|23 unique' README*.md`）。
- **结构 = 6 部 29 章 + 附录 A–F**：`manifest.json`。**zh/en 各 36**：`ls docs/{zh,en}/*.md | wc -l` = 72。
- **链接/锚点/跨平台/i18n 审计 0 问题**：`node scripts/anchor-audit.mjs`（TOTAL ISSUES: 0）。
- **两层模型覆盖**：`CLAUDE_CODE_SUBAGENT_MODEL` + `ANTHROPIC_DEFAULT_HAIKU_MODEL/SONNET/OPUS`，实测 env + `wf_e8cb23ff-829`（`examples-r7.md`、`_grounding.md` §A/§A2）。
- **前端打磨**：`grep -c 'font-style:normal' index.html`（含 zh blockquote 新规则）；`grep -c 'border-radius:999px 0' index.html`（lang-toggle 按钮圆角）；Playwright 0 console 错误。
- **跨模型门全过**：codex（gpt-5.5，read-only）Phase A+B **4/4 PASS**（`git show` 探针/补缺事实层）+ Phase C+D 最终复核 **PASS**（run `briklhawk`：5 个文风文件仅语气/语病、未改事实/数字/代码/Run ID；前端 5 项作用域正确、无渲染回归）；antigravity（agy v1.0.2）Phase D 审查 5 条全采 + Playwright 实测。

---

## 5. 仍为「第三方未核实」（引用须显式标注，未变；信源 `_grounding.md §A2/§B3`）
错误类名 `WorkflowAgentCapError`/`WorkflowBudgetExceededError`、`stallMs`/重试次数、预算耗尽时在途 agent 处置、resume **缓存键精确组成**（`label`/`phase` 是否入键）、`'inherit'` 精确语义、schema 重试**确切次数**（AJV/「催两次」）、并发下限 `max(2,…)`。R7 未触碰这些，维持标注。

---

## 6. 待办 / 接力点（R8）
- 全书规划范围**已完成、已上线、事实+文风经多 agent + 双模型 + 独立核验**。**无强制待办。**
- 可选增强：① Phase C 审读还剩 ~25 处「borderline」语气瑕疵未动（agy/审读 agent 列在报告里），若要更激进的「说人话」可逐条评估，但注意别 churn 已干净的散文；② Phase D P2 仅修了 zh blockquote，`.main em` 的 CJK 斜体、以及封面 `.masthead .sub`/`.front-lead` 的中文斜体未动（保守起见），若要可一并按 `html[lang=zh-CN]` 作用域处理；③ 若要英文侧也做等量文风微调（zh 本轮微调的几处 en 对应未动，因不破坏 claim 一致）。
- **`PROMOTION.md`**（未跟踪的发布宣传稿）含「6 轮迭代 R1-R6」「20+ 份真实运行记录」等，R7 后略陈旧；它不属站点/文档，未提交——发布前需手动更新到 R7 口径。
- 阻塞（用户侧，未变）：GitHub Actions 被计费封禁——只影响 Actions，**分支部署不受影响，切勿改回 Actions Pages**（push `main` 即部署）。

---

## 7. 协作铁律（贯穿，勿忘）
绝不虚构、信源三级权威分级；能实测就真跑（含 Playwright 真浏览器、亲自调 Workflow 工具）；每大阶段后交跨模型（codex 审内容 / agy 审前端，均经 ccg/插件真实调用；agy 不可用则 fallback Claude）对抗审查再改，**落实前独立交叉核对——审查器会误判、实测能证伪**；主窗口编排、繁重读写派子代理；跨平台正确（Pages=Linux 大小写敏感）；zh/en 完全对照；每完成一个 phase 即 commit+push（标准授权，push=部署）；开发侧 junk 入 `.gitignore`（含 `.ccg/`）、handoff 白名单单列；**切勿改回 Actions Pages**。

---

## 附：如何自行复核本文件的真值（R8 可直接跑）
```bash
# 1. R7 全部提交与改动文件
git log 341dad8..HEAD --name-only --format='### %h | %ad | %s' --date=short

# 2. 任一提交的 diff
git show 39a8c6b      # Phase 0+A：探针真值 + 两层覆盖 + schema 命名软提示
git show db6ea09      # Phase B：36 章复核 4 修
git show aeaf7b7      # Phase D：前端 5 项打磨

# 3. R7 探针 Run ID
grep -nE 'wf_e8cb23ff' assets/transcripts/examples-r7.md assets/_grounding.md

# 4. 结构与审计
node scripts/anchor-audit.mjs                 # 期望 TOTAL ISSUES: 0
ls docs/zh/*.md docs/en/*.md | wc -l          # 期望 72（各 36）
grep -n '23 个唯一\|23 unique' README.md README.en.md   # curated 真跑数一致

# 5. 前端打磨落点
grep -n 'html\[lang="zh-CN"\] .main blockquote' index.html   # zh blockquote 去斜体
grep -n 'border-radius:999px 0\|0 999px 999px 0' index.html  # lang-toggle 按钮圆角
```
