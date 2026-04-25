---
description: Safety checks for multi-agent worktree workflows
---

When working with multiple worktrees or parallel agents:
- Always verify you are in the correct worktree directory before making any file changes. Run `git rev-parse --show-toplevel` to confirm.
- Never modify files outside your assigned worktree.
- When spawning sub-agents with worktree isolation, explicitly include the worktree path in the agent prompt.
