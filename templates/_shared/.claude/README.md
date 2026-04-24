# .claude/

Claude Code project-level configuration for this workspace.

- `settings.json` — permissions, env, worktree config
- `hooks/` — session lifecycle and tool-use hooks (copied from janus template)
- `skills/` — project-specific skills (start empty; accrete as needs emerge)

## Hooks

The standard janus hooks cover:

- `session-start` — git fetch, divergence check, context injection
- `session-end` — reconciliation, breadcrumb
- `stop-memory-check` — data-loss gate (unpushed commits, dirty worktrees)
- `setup-worktree` / `cleanup-worktree` — agent worktree lifecycle

Hooks are **copied** (not symlinked) from janus at scaffold time. Update by re-running the scaffold with `--update-hooks`.

## Skills

Project-specific skills live here. See the janus `docs/conventions/` for when to add a skill vs. extend AGENTS.md.
