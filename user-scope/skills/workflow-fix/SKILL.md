---
name: workflow-fix
description: Use when the user wants to triage failing GitHub Actions runs — surveys the latest run of every workflow, surfaces ones whose most recent run failed (or was cancelled / timed out), pulls the failed-step logs, diagnoses the root cause, and proposes a concrete fix. Optionally scoped to specific environments / branches.
argument-hint: "[branch1,branch2,...]   # optional, defaults to all branches"
---

Triage failing GitHub Actions runs and propose fixes.

Args: `$ARGUMENTS`

`$ARGUMENTS` is an optional comma-delimited list of environments. Recognised tokens map to branches: `dev → dev`, `staging → staging`, `prod → main`. Anything else is treated as a literal branch name. With no arg the skill scans across all branches.

## Supporting File
- [collect.sh](collect.sh) — Lists recent runs, keeps the latest per workflow, filters to failure-class outcomes (`failure`, `cancelled`, `timed_out`, `startup_failure`), optionally filters by branch, then pulls each failure's failed-job structure and the tail of `--log-failed`. Output: one JSON document with `count` and `failures[]`.

## Workflow

### 1. Run the collector
```bash
bash .claude/skills/workflow-fix/collect.sh "$ARGUMENTS"
```
Default scan window is the last 50 runs (set `LIMIT=N` to widen). Default log tail is 200 lines (set `LOG_TAIL_LINES=N`).

If `count == 0`, report "All workflows' latest runs are passing" and stop. Don't fabricate failures to fix.

### 2. Diagnose each failure

For each entry in `failures[]` you have:

| Field | Use |
|---|---|
| `workflowName`, `displayTitle`, `url` | Reference for the user |
| `headBranch`, `headSha`, `event` | What triggered the run |
| `conclusion`, `createdAt` | Severity / freshness |
| `failed_jobs[]` | Which job + which step failed |
| `failed_log_tail` | Last ~200 lines of failed-step output (ANSI stripped) |

Read the log tail and classify the failure. Common categories in this repo:

| Pattern in log | Likely root cause | Fix path |
|---|---|---|
| `error TS2xxx` / `error TS6xxx` | TypeScript compile error | Open the file:line, fix the type, push |
| `FAIL ` (Jest) / `Tests:.*failed` | Test regression | Reproduce locally with `cd <pkg> && npx jest <pattern>`, fix code or test |
| `ERR_PNPM_*`, lockfile mismatch | Lockfile / workspace drift | `pnpm install` (no `--frozen-lockfile`), commit lockfile |
| `npm ERR!` in a sub-package using npm | npm-managed package in a pnpm monorepo | `cd <pkg> && npm ci` locally, commit `package-lock.json` |
| `unauthorized: authentication required` (ACR) | Container Registry creds | Check repo secret `AZURE_CLIENT_ID` / OIDC federation in env |
| `BadRequest`, `InvalidTemplateDeployment` (Bicep) | Infra deploy error | Inspect `infra/` Bicep template, run `infra-preview.yml` |
| `Health check failed: <url>` | Container App not serving | Check Container App revision logs in Azure portal |
| Hook timeout / `claude.yml` failing | Claude bot hit a wall | Inspect run, often retriable — comment `@claude` again |
| `CodeQL …` failure | Security scan tooling | Usually transient; rerun. If reproducible, inspect `.github/codeql/` |
| `Detect Changes` skipped everything | Path filters / merge-commit edge case | See `.github/workflows/ci.yml` change-detection logic |

If the log doesn't fit a known pattern, quote the most informative 3–5 lines verbatim and reason from there.

### 3. Report concisely

Use this shape (skip subsections that don't apply):

```
## Failing workflows (N)

### 1. <workflowName> — <conclusion> on <headBranch> (<relative time>)
   Run: <url>
   Failed: <job> → <step name>
   Cause: <one-sentence root cause>
   Fix:
     - <action 1>
     - <action 2>
```

Rules:
- One block per failure. No prose between blocks.
- "Fix" must be specific — file paths, commands, or PR-shaped action. Avoid "investigate further" unless the log truly is opaque.
- If the same root cause is hitting multiple workflows (e.g. one TS error breaking CI + Deploy), say so once and group them.
- Mark transient/flaky failures with `(likely flaky — rerun)` so the user can dismiss quickly.

### 4. Offer to apply trivial fixes

If a fix is mechanical and self-contained (lockfile regen, single-file TS error, missing import, version bump), offer to apply it on a feature branch. If it requires secrets, infra changes, or judgement (test logic, API design), report only and let the user decide.

Never push directly to `main`, `dev`, or `staging`. Per `CLAUDE.md`: feature branch + PR.

## Failure modes
- `gh` not authed → collector returns `count: 0` with empty `failures[]`. Mention "gh not authenticated" and stop.
- Log tail truncated mid-error → re-run the collector with `LOG_TAIL_LINES=600 bash …` for that specific run, or `gh run view <id> --log-failed` directly.
- Run too old to have logs (>90 days) → `gh run view --log-failed` will be empty. Note "logs expired" and skip.
