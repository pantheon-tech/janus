---
description: Sync with remote before starting any non-trivial work
---

Before starting any non-trivial work in a git repo, run `git fetch --prune origin` to sync the local view with the remote. Without this, branch-divergence checks, "is the base branch up to date?" decisions, and PR-target choices are made against stale data.

This applies whether the agent is reading state or about to make changes. Cheap to run; cost of skipping is silent staleness.

Skip only when:
- The task is purely local (no remote operations needed)
- A fetch was just performed in this session
- The repo has no remote (e.g. local-only experimentation)
