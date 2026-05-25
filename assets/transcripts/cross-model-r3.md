# 真实运行记录 · 跨模型协作（Round 3 dogfood）

> 环境：Claude Code v2.1.150。本记录是「跨模型对抗审查」模式的**真实自审**：Claude 作主编排者生成/深化内容 → 经 **codex-plugin-cc**（`codex@openai-codex` 插件 v1.0.4，`codex-cli 0.133.0`，模型族**异于 Claude**）真实调用 codex 对新内容做**独立对抗式准确性审查** → codex 返回分级发现 → Claude 落地修订。这演示了为什么「同一产物交给不同模型族独立验证」能抓到自查盲区。

## 流程
1. **生成（Claude + Workflow）**：本轮新增/深化的内容（附录 F、p2-09/p2-04/p5-23/p5-24 深化、p2-08 §8.8 错误语义、app-b 陷阱）由 Claude 经 subagent 撰写。
2. **对抗审查（codex，只读）**：通过 `codex:codex-rescue` 子代理真实调用 codex，给定官方 `sdk-tools.d.ts` 事实基线 + `_grounding.md`，令其**逐条找茬**：API 矛盾、数字与 transcript 不符、中英漂移、链接格式、过度声称。
3. **落地（Claude）**：codex 运行时为只读沙箱（`writing is blocked by read-only sandbox; rejected by user approval settings`），无法自行写盘，故 Claude 按 codex 的精确规格逐条修订。

## codex 真实返回（裁决：BLOCKED）
- **8 P0**（虚构/事实矛盾），其中最关键：codex 抓到**我们自己新写的 §8.8 旁边仍残留旧契约措辞**「parallel() 调用永不 reject / thunk 抛错→null」，与本轮实测（`wf_ed5e87f3-435` 同步 throw 致 workflow 崩）**自相矛盾**（横跨 p2-08 3 处 + app-b 1 处）；以及 p5-24「实证了独立批评优于自评」属过度声称（未设对照组）。
- **6 P1**（不一致/无支撑数字）：p2-09 resume 行 `agent_count` 应为 0（误写 1）；app-b「8 次运行」应为「10 完成/9 唯一」；p5-24「证明…真实成立」应降级为「观察到一致证据」。
- **codex 确认干净**：无错误的 `status` 第三值；无 `meta.model` 顶层过度声称；无 retry 上限断言；附录 F 的 Run ID 全部真实、章节链接 id 全部有效；无中英链接前缀错配；无「可运行」代码误用 `Date.now/Math.random`。

## 价值与诚实边界
- **价值**：跨模型族独立审查抓出了 Claude 自查与子代理互查都漏掉的**自相矛盾**（新结论与旧措辞并存）——这正是「对抗验证」模式的意义。
- **诚实边界**：本机 codex companion 运行时被配置为**只读 + 需审批**，codex 因此**只能审、不能改**；本轮所有修订由 Claude 按 codex 规格落地。若要 codex 亲自写盘，需放宽其 approval/sandbox 配置。
- **antigravity 一侧**：本机 `agy`（Antigravity CLI v1.0.2）headless 调用 exit 0 但**返回空**（无 agent 消息），独立 `antigravity` bin 缺 `cli.js`——故前端对抗审查改由 codex + Claude + Playwright 承担，antigravity 待交互式登录后补审。

**结论**：本书的「跨模型协作 / 对抗验证」不是纸上谈兵——它在编写本书的过程中被真实用于自审，并据此修正了多处 P0/P1。这条记录本身即该模式的实证。
