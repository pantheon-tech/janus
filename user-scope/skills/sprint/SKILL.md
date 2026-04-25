---
name: sprint
description: Execute a sprint with parallel agents, review gates, and merge coordination
argument-hint: "<issue list or label>"
---

Execute this sprint autonomously with review gates between each phase.

**Phase 1 — Triage:** Fetch ALL open issues (paginate fully — `gh issue list --limit 999` or `per_page=100` loop). Categorise by effort (S/M/L) and group by area. Present the plan and wait for approval.

**Phase 2 — Parallel Implementation:** For each work group:
1. Verify CLI: `which claude && claude --version`
2. Create a dedicated worktree and branch per agent
3. Spawn sub-agents with `isolation: "worktree"`, `mode: "bypassPermissions"`, `run_in_background: true`
4. Each agent must: run tests before committing, include only relevant file changes, use conventional commits referencing issue numbers

**Phase 3 — Self-Review Gate:** Before opening any PR, review each branch's diff:
- [ ] No files modified outside the agent's worktree
- [ ] No unused imports
- [ ] All tests pass
- [ ] No unrelated changes
- [ ] Commit messages reference issue numbers
Fix any violations found.

**Phase 4 — PR & Merge:** Open PRs for each branch. Merge one at a time into the integration branch, running tests after each merge. If a merge conflict occurs, resolve and re-test before proceeding.

Report a summary table: issue | status | PR | notes
