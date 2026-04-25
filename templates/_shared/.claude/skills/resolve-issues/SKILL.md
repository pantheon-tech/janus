---
name: resolve-issues
description: Use when there's a backlog of easy GitHub issues to clear — batch-scans open issues by difficulty/effort, presents for approval, dispatches parallel agents to fix them, merges into a single integration PR.
argument-hint: "[max-difficulty max-effort] or [--dry-run]"
---

Batch-resolve open GitHub issues.

Args: $ARGUMENTS (defaults: difficulty<=5 effort<=5)

## Prerequisites

- Repo follows janus label taxonomy: `difficulty:N`, `effort:N` (1–10 each), priority labels `P0:` through `P3:`, and component labels (see `CLAUDE.md` for the project's component list).
- `gh` CLI authenticated and pointing at the right repo (auto-detected from the local checkout).

## Workflow

### 1. Parse Arguments
- No args → difficulty<=5, effort<=5
- Two numbers → custom thresholds (e.g. `3 3`)
- `--dry-run` → scan and report only

### 2. Scan Issues

```bash
gh issue list --state open --limit 200 \
  --json number,title,labels,assignees,body \
  --jq '[.[] |
    {number, title, body,
     difficulty: ([.labels[].name | select(startswith("difficulty:")) | split(":")[1] | tonumber] | .[0] // 99),
     effort:     ([.labels[].name | select(startswith("effort:"))     | split(":")[1] | tonumber] | .[0] // 99),
     priority:   ([.labels[].name | select(startswith("P"))           | split(":")[0]] | .[0] // "P9"),
     type:       ([.labels[].name | select(. == "bug" or . == "security" or . == "enhancement" or . == "documentation" or . == "performance" or . == "testing" or . == "code-review")] | .[0] // "unknown"),
     assigned: (.assignees | length > 0),
     labels: [.labels[].name]
    }
  | select(.difficulty <= THRESHOLD_D and .effort <= THRESHOLD_E)]
  | sort_by(.priority, .difficulty)'
```

(Replace `THRESHOLD_D` / `THRESHOLD_E` with the parsed values.)

### 3. Filter Out

Remove issues that should NOT be auto-resolved:
- Assigned to someone (`assigned: true`)
- Labelled `in-progress`
- `security` type with difficulty > 3 (needs human review)
- Already has an open PR linked to it

### 4. Present for Approval

Display a table:
```
#    P   D  E  Type      Title
943  P0  1  1  bug       deploy.yml missing concurrency block
957  P0  1  1  bug       Staging NODE_ENV=development
...
```
Ask: "N issues found. Resolve all, or pick specific numbers?"

If `--dry-run`, stop here.

### 5. Dispatch Agents

For each approved issue, spawn a parallel agent:
- **Model:** Sonnet
- **Isolation:** worktree (the WorktreeCreate hook branches off the project's working branch — `staging` per janus convention)
- **Branch name:** `fix/<issue-number>-<slug>` (slug from title, max 40 chars)
- **Max parallel:** 15

Each agent prompt:
```
You are fixing GitHub issue #N in a worktree branched off origin/staging.

1. Create branch: fix/N-<slug>
2. Read the issue: gh issue view N
3. Understand the fix needed
4. Make the fix — follow existing code patterns
5. Run relevant tests: pnpm test (or scoped variant for monorepos)
6. Commit: "fix(<component>): <description>\n\nFixes #N"
```

### 6. Merge Integration Branch

After all agents complete:
1. Create `integration/issue-sweep-YYYY-MM-DD` off `origin/staging`
2. Merge each agent branch sequentially
3. If any merge conflicts, skip that branch and report

### 7. Create PR

Single PR targeting `staging`:
- Title: "fix: resolve N low-effort issues"
- Body: table of all resolved issues with `Fixes #N` for each
- Issues auto-close on merge via `Fixes` keywords

### 8. Report

Summary of what was done:
- Issues resolved (with PR link)
- Issues skipped (with reason)
- Any merge conflicts
