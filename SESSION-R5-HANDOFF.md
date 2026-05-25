# Session R5 交接文档 · workflow-cookbook

> 写给下一轮（R6）接手者，也作为本仓库「每一轮真实所做之事」的可追溯账本。
> **本文件已脱离 `.gitignore` 黑名单**（`.gitignore` 末尾 `!SESSION-R5-HANDOFF.md`），随 `main` 提交/推送/部署。前一轮见 [`SESSION-R4-HANDOFF.md`](SESSION-R4-HANDOFF.md)（已入库）。
>
> **真值原则**：本文件每一条都能追溯到 ① 真实 git 提交（附短哈希，`git show <hash>` 可验）② `assets/transcripts/` 真实运行/审查记录 ③ `assets/_grounding.md` 规范源 ④ `manifest.json`。凡无此四类依据者，不写。最后一节给出逐条自验命令。

---

## 0. 一句话状态

R5 完成 **Phase 3**（深化第三部实战食谱 + 新增第六部·创作篇 3 章 + 真跑 3 个应用级工作流 + MCP 降为诚实小节）与 **Phase 5**（前端微调 + 真浏览器验证 + 两路跨模型对抗审查并落实），并补做了 **README 双语同步**。全书 **6 部 29 章 + 附录 A–F**，事实层经 codex（文档）与 agy（前端）两路审查。`anchor-audit` **0 问题**，全部已 push 部署。**全书规划范围已完成**，R6 主要是维护与新需求。

---

## 1. R5 提交账本（逐条可追溯 · `git log b750dca..HEAD`）

> `b750dca` 是 R4 最后一个提交；其后到 `ac7766b` 共 **6 个 R5 提交**，均 2026-05-25、已 push `origin/main`。

| 提交 | 主题 | 真实改动文件 | 配套信源 |
|------|------|--------------|----------|
| `e442edd` | feat: 深化第三部 + 新增第六部·创作篇（真跑驱动） | `examples-r5.md`(新)、`p3-10/12/13/15/16`×zh/en、`p5-26`×zh/en(前向链接)、`p6-27/28/29`×zh/en(新)、`manifest.json`(加 part-6) | `assets/transcripts/examples-r5.md`、`validator-r4.md`、MCP 实测 `wf_d8aa0772-ced` |
| `9f04c59` | fix: 前端 a11y + 正确性打磨（review-spa 真跑驱动） | `index.html` | `assets/transcripts/examples-r5.md`（review-spa `wf_97b81e86-a0b` 的 18 条发现） |
| `e496bcd` | fix: 按 codex 审查修正第三部夸大的权威/schema 语义 | `codex-phase3-review-r5.md`(新)、`p3-10/12/13/15`×zh/en | `assets/transcripts/codex-phase3-review-r5.md` |
| `53499f6` | fix: 落实 agy 前端跨模型审查（a11y/UX 微调） | `agy-frontend-review-r5.md`(新)、`index.html` | `assets/transcripts/agy-frontend-review-r5.md` |
| `c3b6541` | chore: R5 收尾——交接 + 封面统计修正 | `.gitignore`、`SESSION-R5-HANDOFF.md`(新)、`index.html`(封面 26→29) | 本文件 / `manifest.json` |
| `ac7766b` | docs: README 同步 29 章/6 附录 + 新增英文 README 镜像 | `README.md`、`README.en.md`(新) | `manifest.json`、`examples-r5.md` |

---

## 2. R5 真实产出（按 Phase，每条挂提交 + 信源）

### 2.1 Phase 3 — 内容（提交 `e442edd`，codex 修正在 `e496bcd`）
- **深化薄弱章** `p3-10/12/13/15/16`（zh/en 对照）。
- **新增第六部·创作篇**：`p6-27` 工作流创作流程（内含 **MCP 诚实小节**，引 MCP 端到端实测 `wf_d8aa0772-ced`）、`p6-28` 校验与调试（据 `assets/transcripts/validator-r4.md`）、`p6-29` 示例画廊（由下方 3 个真跑驱动）。`manifest.json` 同步加入 `part-6`×zh/en。
- **真跑 3 个应用级工作流**（`CLAUDE_CODE_WORKFLOWS=1`，证据 `assets/transcripts/examples-r5.md`）：

  | 脚本 | 模式 | Run ID | agent | token | 墙钟(ms) | 结果 |
  |---|---|---|---|---|---|---|
  | `review-spa.js` | pipeline + 对抗验证 | `wf_97b81e86-a0b` | 22 | 991,554 | 395,166 | 18 条确认(bug6/sec4/a11y8) |
  | `dead-code-scan.js` | loop-until-dry | `wf_2283ab37-710` | 2 | 116,344 | 246,496 | 2 轮全干净，DRY_STREAK 终止 |
  | `feedback-themes.js` | parallel 屏障 | `wf_b3febb70-ad9` | 20 | 607,307 | 122,391 | 18 项→8 主题 |

  - ⚠ **成本真相（实测）**：`CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-4-7[1m]` **覆盖**脚本里的 `model:'haiku'`（如 feedback-themes 18 个 summarize agent 实跑 Opus），3 次合计 **1,715,205 token ≈171.5 万**（远超 30–45 万预估）。已如实写入 `examples-r5.md` / 第 29 章。信源：`examples-r5.md` + 覆盖现象 `wf_9c94951d-58c`（`_grounding.md` §A2）。

### 2.2 Phase 5 — 前端（用户「比较满意」，只微调不大改）
- **第一批 a11y/正确性打磨**（提交 `9f04c59`，由 review-spa 真跑的 18 条发现驱动）：改 `index.html`，含移除冗余 `aria-live`、`aria-current`、mermaid `role=img`、可滚动 `pre` 的 `tabindex`+`aria-label`、移动抽屉 `inert`、首页/章节聚焦 h1、slugify 去重用 `Object.create(null)` 等。
- **agy 审查落实**（提交 `53499f6`，9 条建议 **8 采纳 / 1 否决**，详见 §3.2）：改 `index.html`。
- **封面统计修正**（提交 `c3b6541`）：`index.html` `renderHome()` 统计 `26 章 + 5 附录` → `29 章 + 6 附录`（加第六部后过时）。
- **真浏览器验证**（本会话 Playwright，本地 `python3 -m http.server 8765`）：首页 / `p3-15` / `p2-08`（mermaid 2 图渲染为 SVG）/ 代码卡片 / 路由 / 焦点全部正常，**本站 0 console 错误**。⚠ **缓存坑**：Playwright 会缓存 `index.html`，验证改动须用查询串绕缓存（如 `?r5fresh=1`），否则看到旧文件。

### 2.3 README 双语同步（提交 `ac7766b`）
- `README.md`：更正 `26 章/5 附录` → **`29 章/6 附录`**；目录补 **第六部(27/28/29)** 与 **附录 F**；真跑数 `10 完成/9 唯一` → **`20 个唯一 Run ID`**；字数 `约 26 万字`（实测仅 14.5 万汉字，属夸大）→ **`中文正文 14 万+ 汉字 · 36 篇逐篇对照`**；加双语 README 入口与在线阅读入口。
- `README.en.md`（新）：与中文版完全对照的英文镜像（英文品牌 **Loom**），目录链接指向 `docs/en/*`，与 `README.md` 双向互链。校验：两版各 43 个本地链接、**0 缺失**、结构一致（29 章 + 6 附录）。

---

## 3. 两路跨模型对抗审查（本轮新做，均经主窗口逐条验证后落实）

### 3.1 codex（Phase 3 文档事实）— 提交 `e496bcd`，证据 `assets/transcripts/codex-phase3-review-r5.md`
- 机制：`codex exec -s read-only --skip-git-repo-check`（codex-plugin-cc），**默认模型**、read-only 沙箱、**214,286 token**。结论 `NOT SAFE — 10 criticals`（5 CRITICAL + 2 WARNING，各 zh/en 一对；**0 个虚构 Run ID**），全部修复。
- ⚠ **纠偏（重要）**：其中 p3-10「约 10 个 agent 在跑」被 codex 误判为虚构——实为**官方工具描述原文** `only ~10 run at any moment`。已纠为「消除『公式 16核→14 紧挨约10』的表观矛盾、但不污蔑造假」。**教训：审查器也会把真实事实误判为造假，落实前必须交叉核对 `_grounding.md`/transcripts**（已核实子代理引用的 `wf_2b04881f-6a9` 真实存在于 `_grounding.md` L32/36/143）。

### 3.2 agy / antigravity（Phase 5 前端）— 提交 `53499f6`，证据 `assets/transcripts/agy-frontend-review-r5.md`
- 机制：`agy --print`（antigravity 1.0.2，经 ccg）。9 条 finding：**8 采纳**（mermaid 竞态守卫、route 哨兵、code `pre` focus `outline-offset`、对比度 `--accent-text #B8430F→#AF3E0D` 达 WCAG AA、移除全局 `scroll-behavior:smooth`、scroll-spy 底部高亮、`.ch-nav` 聚焦反馈、lang-toggle 非活动 hover）；**1 否决**（移动端 44px 触摸热区——现尺寸已满足 WCAG 2.5.8 AA 的 24px，agy 的 `::after` 叠加方案有点击重叠风险）。

---

## 4. 关键操作教训（新，可复现）
- **agy headless 必须重定向 stdin**：`agy --print "..."` 若 stdin 是未关闭的管道，会卡在 **stdin-EOF 死锁**（本轮首跑实测 18:45 / 0 字节 / CPU 0% / 无网络连接，被 `kill` 后 exit 143）。修复：`agy --print "..." < 文件`（或 `< /dev/null`）给足 EOF，重启后正常产出 7851 字节。详见 `assets/transcripts/agy-frontend-review-r5.md`「运行元信息」。R4 所说「agy headless 坏」实为此死锁，**本轮经此修复已可用**。
- **codex/agy 经 ccg 真实调用**：codex 用 codex-plugin-cc（`codex exec -s read-only`，默认模型、勿传 `--model`）；agy 用 `agy --print`（注意上面 stdin 坑）。后台跑、完成有通知，主窗口只读末尾结论以省上下文。

---

## 5. 可验证事实清单（每条挂信源，R6 用前先复核）
- **结构 = 6 部 29 章 + 附录 A–F（6 个）**：信源 `manifest.json`（part-1…part-6 + appendix app-a…app-f）。
- **真跑语料 = 20 个唯一 Run ID**：= `_grounding.md` §C 的 **17 个（R4 基线）** + `examples-r5.md` 的 **3 个 R5 应用级**（`wf_97b81e86-a0b`/`wf_2283ab37-710`/`wf_b3febb70-ad9`）。⚠ 注意：R5 三跑目前**只在 `examples-r5.md`**，尚未并入 `_grounding.md` §C 表——R6 若要让规范源自洽，可考虑补录。
- **zh/en 完全对照**：`docs/zh` 36 篇 ↔ `docs/en` 36 篇（`ls docs/{zh,en}/*.md | wc -l` 各 36）。
- **链接/锚点/跨平台/i18n 审计 0 问题**：`node scripts/anchor-audit.mjs`（本轮终检 72 文档 / 811 链接 / TOTAL ISSUES: 0）。
- **前端本站 0 console 错误**：本会话 Playwright 实测（home/p3-15/p2-08）。
- **中文正文约 14.5 万汉字**：`cat docs/zh/*.md | grep -v '^\s*```' | grep -oE '[一-鿿]' | wc -l` ≈ 144,917。

---

## 6. 仍为「第三方未核实」（引用须显式标注，未变；信源 `_grounding.md` §A2/§B）
错误类名 `WorkflowAgentCapError`/`WorkflowBudgetExceededError`、`stallMs`/重试次数、预算耗尽时在途 agent 处置、resume 缓存键**精确字段组成**、`'inherit'` 精确语义、schema 重试**确切次数**。（已实测确认项见 `_grounding.md` §A/§C。）

---

## 7. 关键文件地图
- `assets/_grounding.md` — **唯一规范源**（官方/实测/第三方三级 + §C 真跑表 + 写作标准）。改事实先改这里。
- `docs/{zh,en}/*.md` — 正文，**必须 zh/en 完全对照**。`manifest.json` — 章节↔文件↔标题映射（含 part-6）。
- `README.md` / `README.en.md` — 双语入口文档（互链；改结构数字时两份都要同步）。
- `index.html` — 零构建 SPA。`slugify` 约 316–324 行（仅 h2/h3 生成 id）；`route()` 含 `if(!S.manifest) return` 哨兵；mermaid 渲染含 `if(!pre||!pre.parentNode) return` 守卫；统计在 `renderHome()`。（R5 后行号有位移，按内容定位。）
- `assets/transcripts/` — 真跑与审查证据：`examples-r5.md`、`codex-phase3-review-r5.md`、`agy-frontend-review-r5.md`（R5 新增），及 R4 的 `api-facts/sandbox/repo-claims/mcp-access/validator/r3-reverification`。
- `scripts/anchor-audit.mjs` — 跨平台审计，**新增/改名章节后必跑**（期望 `TOTAL ISSUES: 0`）。

---

## 8. 待办 / 接力点（R6）
- 全书规划范围（认知/基础/食谱/进阶/生态/创作 + 附录）**已完成、已上线、事实层经两轮跨模型审查**。**无强制待办。**
- 可选增强：① 把 R5 三个真跑并入 `_grounding.md` §C 表，使规范源自洽（见 §5 注）；② 若要更高 a11y，可重审被否决的 44px 触摸热区（须测试避免点击重叠）；③ 若要更多真跑示例，先经用户/CI 调 `CLAUDE_CODE_SUBAGENT_MODEL` 控成本（否则 `model:'haiku'` 被覆盖、按 Opus 计费）；④ 对比度 `#AF3E0D` 若不喜欢可一行回退 `#B8430F`。
- 阻塞（用户侧）：GitHub 账号 **Actions 被计费封禁**——只影响 Actions，分支部署不受影响。⚠ **切勿改回 Actions Pages**（push `main` 即分支部署 `build_type=legacy`）。

---

## 9. 协作铁律（贯穿，勿忘）
绝不虚构、信源三级权威分级；能实测就真跑（含 Playwright 真浏览器）；每大阶段后交跨模型（codex / agy，经 ccg）对抗审查再改（**落实前交叉核对——审查器会误判真实事实**）；主窗口编排、繁重读写派子代理；跨平台正确（Pages=Linux 大小写敏感）；zh/en 完全对照；每完成一个 phase 即 commit+push（标准授权，push=部署）；**切勿改回 Actions Pages**。

---

## 附：如何自行复核本文件的真值（R6 可直接跑）
```bash
# 1. R5 全部提交与改动文件（核对 §1 账本）
git log b750dca..HEAD --name-only --format='### %h | %ad | %s' --date=short

# 2. 任一提交的具体 diff（核对某条改动的真值）
git show e496bcd      # codex 文档修复；git show 53499f6 = agy 前端；git show ac7766b = README

# 3. 真跑 Run ID 与用量（核对 §2.1 / §5）
grep -nE 'wf_[a-z0-9]+-[a-z0-9]+' assets/transcripts/examples-r5.md

# 4. 结构与审计（核对 §5）
node scripts/anchor-audit.mjs                 # 期望 TOTAL ISSUES: 0
ls docs/zh/*.md docs/en/*.md | wc -l          # 期望 72（各 36）
grep -c '"id": "p6-2' manifest.json           # 期望 3（第六部三章）

# 5. 两路审查证据（核对 §3）
sed -n '1,40p' assets/transcripts/codex-phase3-review-r5.md
sed -n '1,40p' assets/transcripts/agy-frontend-review-r5.md
```
