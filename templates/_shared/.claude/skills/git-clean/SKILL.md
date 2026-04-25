---
name: git-clean
description: Use when the local git state needs cleanup — syncs with remote, deletes merged branches, prunes stale worktrees, reports divergence. Run after merging PRs, finishing sprints, or when branch count grows.
argument-hint: "[--dry-run] [--aggressive]"
---

Clean up local and remote git state.

Args: $ARGUMENTS

## Supporting Files
- [audit.sh](audit.sh) — Run first to get a JSON report of branches, worktrees, divergence, and open PRs. Parse its output to build the cleanup plan.

## Workflow

### 1. Fetch and Audit
```bash
bash .claude/skills/git-clean/audit.sh
```
Parse the JSON output. This gives you merged branches, untracked branches, worktree state, open PR branches, and divergence in one shot.

### 2. Review Audit Results

**Branches:**
- Local branches merged into `origin/<base>` (safe to delete) — `<base>` is the project's working branch (`staging` per janus convention)
- Local branches with no remote tracking ref
- Local working branch divergence from origin
- Local `main` divergence from `origin/main`

**Worktrees:**
- Agent worktrees at `.claude/worktrees/` (leftover from previous sessions)
- Manual worktrees outside the repo
- For each worktree: check for uncommitted changes, check if branch has open PR

**Remote:**
- Remote branches already merged into origin's working branch (stale)
- Open PRs (do NOT delete branches tied to these)

### 3. Present Report
```
=== Git Cleanup Report ===

SAFE (will auto-execute):
  Delete N merged local branches: <list>
  Prune M stale agent worktrees: <list>
  Fast-forward working branch: K commits behind origin

REVIEW (need confirmation):
  Delete X untracked local branches
  Remove worktree <path> (no uncommitted changes, branch merged)

SKIP (report only):
  Worktree <path> has uncommitted changes
  Branch <name> has open PR #N

=== Execute safe actions? (y/n) ===
```

### 4. Execute

**Safe actions** (auto or after confirmation):
```bash
# Delete merged local branches (replace BASE with the working branch)
git branch --merged origin/BASE | grep -vE '^[*]|main|staging|BASE' | xargs -r git branch -d

# Remove stale agent worktrees
git worktree remove <path> --force
git worktree prune

# Fast-forward working branch
git checkout BASE && git merge --ff-only origin/BASE
```

**Review actions** (only with `--aggressive` or explicit confirmation):
```bash
# Delete unmerged local-only branches (no remote, no open PR)
git branch -D <branch>

# Remove manual worktrees with no uncommitted changes
git worktree remove <path>
```

**Never auto-execute:**
- Deleting protected branches (`main`, `staging`, working branch)
- Deleting branches with open PRs
- Removing worktrees with uncommitted changes
- Force-pushing anything
- Deleting remote branches

### 5. Final State
After cleanup, show:
```
=== Final State ===
Branch: <current> (up to date with origin/<base>)
Local branches: N (main, staging, current-feature)
Worktrees: 1 (main checkout only)
Open PRs: M
```

## Arguments
- No args: full audit + execute safe actions with confirmation
- `--dry-run`: audit and report only, no changes
- `--aggressive`: also execute review-level actions (with per-action confirmation)

## Safety Rules
- NEVER delete `main` or the working branch (`staging` per janus convention)
- NEVER delete branches with open PRs
- NEVER remove worktrees with uncommitted changes without explicit user confirmation
- NEVER push or force-push anything
- Always `git fetch --prune origin` before any branch analysis
- Always check for open PRs via `gh pr list` before deleting branches
