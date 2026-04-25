# User-scope Claude Code

User-global context loaded into every session. Source of truth for runtime config is `~/.claude/settings.json`. This file is the user's canonical CLAUDE.md — janus installs it during `bootstrap`, but you should edit it freely afterwards.

## Plugins (user-scope)

- `superpowers` — TDD, debugging, planning, worktree, parallel-dispatch skills
- `context7` — up-to-date library docs
- `typescript-lsp` — TS diagnostics

Project-only plugins (e.g. `playwright`, `frontend-design`, `pyright-lsp`) are enabled per-project in that project's `.claude/settings.json` — janus's scaffold prompts at project creation time.

## Hooks (user-scope)

- `Stop` → `~/.claude/hooks/stop-memory-check.sh` — block stop on unpushed commits, dirty worktrees, or interrupted rebase/merge/cherry-pick
- `PostToolUse` (Edit|Write|MultiEdit) → `~/.claude/hooks/ts-check-on-edit.sh` — scoped `tsc --noEmit` after TS edits (incremental). Adds 2–10s on first run per package; subsequent runs cached.

## Skills (user-scope)

`activity-report`, `bugfix`, `spawn-fleet`, `sprint`, `workflow-fix`. Project skills override on collision.

Project-scope skills shipped by janus (see `templates/_shared/.claude/skills/` in the janus repo): `fix`, `git-clean`, `reconcile`, `resolve-issues`, `triage-issue`.

## Rules (user-scope)

`~/.claude/rules/`: `fetch-before-work`, `github-pagination`, `issue-on-discovery`, `tool-fallbacks`, `trust-user-diagnosis`, `worktree-safety`.

## Notes

- `advisorModel` is NOT a settings field; advisor model is set API-side per tool. Don't add it to settings.json.
- `theme` is set via `/theme` slash command, not settings.json. Persists in `~/.claude.json`.
- Read denies don't apply to Bash subprocesses (`cat ~/.ssh/id_rsa` bypasses `Read(~/.ssh/**)`). Use sandbox mode for untrusted ops.
- Effort default is `high`; bump to `xhigh` per session via `/effort xhigh` for plan/synthesis work.

## Updating

To pull in upstream janus updates: `npx @skipnz/janus bootstrap --update`. Your local edits to skills/rules/CLAUDE.md are preserved by default; pass `--force` to overwrite.
