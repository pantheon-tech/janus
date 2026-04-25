---
name: spawn-fleet
description: Pre-flight checks and parallel agent spawning with worktree isolation
argument-hint: "<plan-file-or-description>"
---

Before spawning any parallel agents, run these pre-flight checks:

1. **Verify CLI:** Run `which claude` and `claude --version` to confirm the binary path is valid and current
2. **Check git state:** Run `git status` and `git worktree list` to confirm clean state and map existing worktrees
3. **Validate branch:** Confirm the base branch exists and is up to date

Then for each agent task:
- Create the agent with `isolation: "worktree"` 
- Include the exact files the agent should create/modify in the prompt
- Include the commit message the agent should use
- Set `mode: "bypassPermissions"` and `run_in_background: true`

After all agents are dispatched, monitor for completions and merge each worktree branch back to the integration branch. Run `git worktree list` after merges to confirm cleanup.

If any agent fails to start, diagnose the error (stale path? missing deps? worktree conflict?) and retry once before reporting.
