---
title: Git Workflow
type: reference
last_reviewed: 2026-04-24
---

# Git Workflow

Two-branch model with environment-gated deploys.

## Branches

| Branch | Role | Deploy target |
|---|---|---|
| `staging` | Default integration branch. Feature PRs target this. | `staging` environment (auto on push) |
| `main` | Production. Mirrors what's running in prod. | `prod` environment (auto on push, gated by required reviewers) |

No other long-lived branches. No `dev` branch. No `develop` branch. No release branches.

## Flow

```
                     prod ← main
                              ↑
                              │ release PR  (requires green CI on staging tip)
                              │
                  staging ← staging
                              ↑
                              │ feature / integration PRs
                              │
       feat/<topic>     int/<date>-<slug>     agent-<id>...agent-<id>
                            ↑
                            │ local merge of agent worktrees
                            │
                  Claude Code worktrees
```

## Branch naming

- `feat/<short-description>` — single-author feature work
- `fix/<short-description>` — single-author bug fixes
- `chore/<short-description>` — refactors, dep bumps, doc-only changes
- `int/<YYYY-MM-DD>-<slug>` — integration branch consolidating multiple agent worktrees
- `agent-<id>` — auto-created by Claude Code worktree hook; short-lived, never targets a PR alone

## Integration branch pattern

When multiple Claude Code worktrees run concurrently (each on its own `agent-<id>` branch), they are consolidated locally before pushing.

Process:

```bash
# 1. Sync staging
git fetch --prune origin
git checkout staging
git pull --ff-only

# 2. Create integration branch off staging
git checkout -b int/2026-04-24-credit-rework staging

# 3. Merge each agent branch with --no-ff (preserve agent attribution)
git merge --no-ff agent-a1b2c3d4 -m "merge: agent-a1b2c3d4 (credit-engine refactor)"
git merge --no-ff agent-e5f6g7h8 -m "merge: agent-e5f6g7h8 (credit-tests)"
# ...resolve conflicts manually, never auto-resolve

# 4. Run local checks
pnpm install --frozen-lockfile
pnpm biome check .
pnpm tsc --noEmit
pnpm test

# 5. Push and open PR -> staging
git push -u origin int/2026-04-24-credit-rework
gh pr create --base staging --title "feat: credit rework" --body "..."

# 6. Once PR merged, delete integration branch + agent worktrees
git checkout staging && git pull
git branch -d int/2026-04-24-credit-rework
git worktree prune
```

**Rules:**
- Never push individual `agent-<id>` branches as PR sources. They consolidate into `int/...`.
- **Never auto-resolve merge conflicts** in scripts. Conflicts in agent merges are signal — review by hand.
- Run lint + typecheck + tests **before** pushing the integration branch. CI is the second line; catching issues locally avoids burning CI cycles.
- One agent's failed work does not block the others — drop the failing agent's branch and proceed with the rest.

## Promotion gate (`staging` → `main`)

The `main` branch has GitHub branch protection rules:

- Require pull request before merging.
- Require status checks to pass: **the same `ci-pass` status check** that runs on `staging` pushes must be green on the PR head.
- Dismiss stale reviews on new commits.
- Require linear history.

Operationally: when the latest CI on `staging` is failing, the merge button on a `staging → main` PR is disabled until CI passes.

PR creation:

```bash
git fetch --prune origin
git checkout main
git pull --ff-only
gh pr create --base main --head staging \
  --title "release: v$(date +%Y.%m.%d)" \
  --body "Promote staging to prod. Auto-version via release-please on deploy success."
```

GitHub Environment `prod` carries required reviewers, so the deploy job pauses for human approval before the prod deploy step runs.

## CI / deploy interaction

| Trigger | Workflow runs | Effect |
|---|---|---|
| Feature PR opened (target `staging`) | `ci`, `claude-code-review` | Lint/typecheck/test/build; review bot posts review |
| Push to `staging` (merge of feature PR) | `ci`, `deploy` (env=staging) | CI runs; deploy auto-runs to staging environment |
| PR opened: `staging` → `main` | `ci` (re-runs on PR head) | Validates the same staging-tip is still green |
| Push to `main` (merge of release PR) | `ci`, `deploy` (env=prod), then `release-please` (only on deploy success) | Prod deploy gated by env required reviewers; on success, release-please opens/updates Release PR |

## Release PRs (release-please)

`release-please` runs only after a successful prod deploy. It opens or updates a Release PR that:

- Bumps `package.json` version per Conventional Commits since the last tag.
- Generates `CHANGELOG.md` entries.
- When merged, creates a git tag and GitHub Release.

For monorepos, ship `release-please-config.json` and `.release-please-manifest.json` at repo root for per-package versioning.

## Hygiene

- After PR merge: delete the source branch (GitHub setting auto-deletes).
- After integration branch merge: prune local worktrees (`git worktree prune`) and delete the integration branch locally.
- Weekly: `git fetch --prune origin && git branch --merged origin/staging | grep -v '^[* ] \(staging\|main\)$' | xargs -r git branch -d`.

## Anti-patterns

- **Pushing an `agent-<id>` branch directly as a PR source.** Always consolidate via integration branch.
- **Force-pushing to `staging` or `main`.** Never. Add a fix commit and let it flow.
- **Skipping the integration branch when only one agent ran.** Even one agent's work goes through PR review.
- **Merging `staging → main` without watching the prod deploy.** Required reviewer catches manual gate, but stay attentive — rollback may be needed.
- **Editing release-please's Release PR manually.** Let it regenerate from commits.
