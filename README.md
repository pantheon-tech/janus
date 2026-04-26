# janus

> *Janus (Roman) — god of beginnings, transitions, and doorways. Two-faced: one looks forward, one looks back.*

Portable project starter kit for TypeScript + Azure solo-dev work. Encodes a deliberate set of conventions so every new project starts from a consistent baseline rather than re-evolving decisions from scratch.

## What's inside

- **`docs/conventions/`** — the rules every janus-derived project inherits (stack, git workflow, naming, secrets, code style, layering, etc.).
- **`docs/adr/`** — architectural decisions specific to janus (rare; conventions cover the baseline).
- **`docs/plans/TEMPLATE.md`** — plan-file shape (dated, phased, with rollback).
- **`docs/runbooks/TEMPLATE.md`** — runbook shape with staleness frontmatter.
- **`templates/`** — per-archetype scaffolds (backend-functions, backend-container-app, frontend-vite-react, generic-ts, types-package, mcp-server, monorepo-root).
- **`templates/_shared/`** — files common to all archetypes (biome, tsconfig base, editorconfig, GitHub workflows, hooks, skills, etc.).
- **`user-scope/`** — Claude Code user-scope kit: hooks, skills, rules, baseline `~/.claude/settings.json` partial. Installed by `bootstrap`.
- **`bin/janus.js`** — CLI dispatcher (used via `npx @pantheon-tech/janus`).
- **`scripts/scaffold.sh`** — interactive scaffolder.
- **`scripts/setup-user-scope.sh`** — installs `user-scope/` into `~/.claude/`.

## Philosophy

Every new project made from janus inherits a baseline. When it needs to diverge, it does so through an ADR in its own `docs/adr/` — documented, not silent. Conventions evolve via janus releases; projects pick up changes deliberately, not automatically.

**Not** a framework. **Not** a runtime. Only scaffold + conventions + user-scope kit.

## Usage

### Fresh VM — first-time setup

```bash
# Install Claude Code user-scope (~/.claude/) hooks, skills, rules, baseline settings
npx @pantheon-tech/janus bootstrap
```

This installs to `~/.claude/`:
- Hooks: `stop-memory-check.sh` (Stop gate), `ts-check-on-edit.sh` (PostToolUse TS check)
- Skills: `bugfix`, `sprint`, `spawn-fleet`, `activity-report`, `workflow-fix`
- Rules: `fetch-before-work`, `github-pagination`, `issue-on-discovery`, `tool-fallbacks`, `trust-user-diagnosis`, `worktree-safety`
- Baseline `settings.json` (jq-merged with any existing one — your edits are preserved)
- `CLAUDE.md` (overview of what the user-scope kit provides)

Re-run any time with `npx @pantheon-tech/janus bootstrap` (idempotent) or `--update`/`--force`/`--diff`/`--dry-run` for finer control.

### Scaffold a new project

```bash
npx @pantheon-tech/janus scaffold
```

Prompts for workload, archetype, GitHub org, etc. Renders a complete project tree under `~/git/<workload>/` (or path of your choice) with both `staging` and `main` branches initialized.

### Verify user-scope is set up

```bash
npx @pantheon-tech/janus check
```

Reports any missing hooks/skills/rules and points at the bootstrap command if needed.

### CLI commands

| Command | Purpose |
|---|---|
| `npx @pantheon-tech/janus bootstrap` | Install user-scope to `~/.claude/` |
| `npx @pantheon-tech/janus scaffold` | Create a new project from janus templates |
| `npx @pantheon-tech/janus check` | Verify `~/.claude/` has the expected user-scope kit |
| `npx @pantheon-tech/janus update` | Alias for `bootstrap --update` |
| `npx @pantheon-tech/janus help` | Show usage |

## Versioning

- **Template version** recorded in each derived project's `docs/adr/` (or root README).
- **Semver** per janus release. Breaking changes → major bump.
- Projects don't auto-update; migration is deliberate and per-project.

See `CHANGELOG.md` for current version.

## License

MIT — see [LICENSE](./LICENSE).
