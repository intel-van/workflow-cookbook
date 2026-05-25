# 真实运行记录 · Worktree 并行隔离（Round 3 实测）

> 环境：Claude Code v2.1.150，`CLAUDE_CODE_WORKFLOWS=1`。验证 `opts.isolation:'worktree'` 是否真的给每个 agent 独立的 git worktree + 分支，使并行改文件互不踩踏。

## 运行
- Run `wf_3b0677d8-40f`（status: completed），agent_count=3，total_tokens=81,559，duration_ms=18,221。
- 脚本：`parallel` 3 个 agent，每个带 `isolation:'worktree'`；各自执行 `git rev-parse --show-toplevel`、`git branch --show-current`，并在各自 worktree 根目录写 `wt-demo-<name>.txt`。
- 返回（原始）：

  ```json
  {
    "agents": 3,
    "distinctRoots": 3,
    "roots": [
      ".../.claude/worktrees/wf_3b0677d8-40f-1",
      ".../.claude/worktrees/wf_3b0677d8-40f-2",
      ".../.claude/worktrees/wf_3b0677d8-40f-3"
    ],
    "branches": ["worktree-wf_3b0677d8-40f-1", "worktree-wf_3b0677d8-40f-2", "worktree-wf_3b0677d8-40f-3"],
    "fullyIsolated": true
  }
  ```

## 结论（实证）
- 每个 `isolation:'worktree'` 的 agent 拿到**独立的 worktree 根目录**（`.claude/worktrees/<runId>-N`）与**独立分支**（`worktree-<runId>-N`）。
- `distinctRoots === 3`、`fullyIsolated: true`——并行写文件物理隔离，主工作树不受影响。
- 代价：每个 worktree 约 200–500ms 启动 + 磁盘开销；**有改动则保留 worktree + 分支**（需 `git worktree remove --force <path>` + `git branch -D <branch>` 清理；无改动则自动清理）。
- 清理：本次运行后已手动执行 `git worktree remove` × 3 + `git branch -D` × 3 + `git worktree prune`，主仓库恢复干净。

## 何时用 / 何时不用
- **用**：多个 agent **并行修改同一组文件**且会互相踩踏时（如跨文件大重构 plan→impl→test 并行落地）。
- **不用**：只读分析、或各 agent 改的是**不相交**文件时——worktree 的启动与磁盘成本不划算，直接 `parallel`/`pipeline` 即可。
