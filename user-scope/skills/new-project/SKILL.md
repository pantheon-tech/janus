---
name: new-project
description: Use when the user wants to scaffold a new TypeScript + Azure project. Wraps `npx @pantheon-tech/janus`. Run from any directory — the scaffolder writes to its own target (defaults to `~/git/<workload>`). Detects whether the user-scope kit is bootstrapped and runs the one-off install if needed.
argument-hint: "[workload-slug]   # optional; if given, suggest at the prompt"
---

Scaffold a new project using janus.

The user can invoke this from `~`, `~/git/`, `~/Projects/`, or anywhere. The scaffolder writes to its own target directory (default `~/git/<workload>`), independent of `$PWD`.

## Workflow

### 1. Check user-scope (one-time setup gate)

```bash
npx @pantheon-tech/janus check 2>&1
```

- **Exit 0** → user-scope is installed, skip to step 3.
- **Exit 1** → first-time setup needed. Continue to step 2.

If `npx` itself fails (no network, npm registry unreachable), report the underlying error and stop. Don't attempt to bootstrap from a partial state.

### 2. First-time bootstrap (one-off, idempotent)

Confirm with the user before installing to their `~/.claude/`:

> First-time setup detected. Janus will install hooks (`stop-memory-check`, `ts-check-on-edit`), skills (`bugfix`, `sprint`, `spawn-fleet`, `activity-report`, `workflow-fix`, `new-project`), rules (6), baseline `~/.claude/settings.json`, and `~/.claude/CLAUDE.md`. Existing files are preserved (use `--force` to overwrite). Proceed?

On approval:

```bash
npx @pantheon-tech/janus bootstrap
```

Bootstrap is idempotent. If something goes wrong, re-run with `--diff` to see what differs from a fresh install.

### 3. Scaffold the project

```bash
npx @pantheon-tech/janus scaffold
```

The scaffold script is interactive. Pass-through prompts (in order):

| # | Prompt | Default |
|---|---|---|
| 1 | GitHub org/user | from `gh api user` |
| 2 | Author name | from `git config user.name` |
| 3 | Author email | from `git config user.email` |
| 4 | Workload slug | (no default; required, 3–12 chars `[a-z0-9]`) |
| 5 | Description | (free-text) |
| 6 | License | MIT |
| 7 | Azure region | australiaeast |
| 8 | Target directory | `~/git/<workload>` |
| 9 | Archetype | 1–7 (see below) |
| 10–14 | Feature flags + final confirm | n / n / n / n / y |

**Archetypes:**
1. backend-functions — Azure Functions v4
2. backend-container-app — Container App (long-running, WebSockets)
3. frontend-vite-react — Vite + React + MSAL → SWA
4. generic-ts — Minimal TS package (libraries, CLIs, no Azure)
5. types-package — Pure-types npm package
6. mcp-server — Stdio MCP server
7. monorepo-root — pnpm workspace orchestrator

**If `$ARGUMENTS` is provided**, suggest it as the workload slug at prompt 4.

### 4. Post-scaffold next steps

The scaffolder prints a "Next steps" block. Help with the first three:

#### 4a. Move into the project
```bash
cd <target>      # printed by the scaffolder
```

#### 4b. Offer to create the GitHub repo

Ask the user if they want to push now. If yes:

```bash
gh repo create <github_org>/<workload> --private --source=. --remote=origin
git push -u origin staging
git push -u origin main
```

(Use `--public` instead of `--private` if the user says so.)

#### 4c. Optional — open in editor

Detect available editors:
- `code` → VS Code
- `cursor` → Cursor

Ask if they want to open the project there. If yes: `code .` or `cursor .`.

#### 4d. Print follow-up actions

The scaffolder's own next-steps block lists things janus can't do automatically:
- Set up GitHub environments (`staging`, `prod` with required reviewers)
- Run `bash infra/scripts/setup-oidc.sh` for Azure OIDC federation
- Configure branch protection on `main`
- Add repo secrets (CLAUDE_CODE_OAUTH_TOKEN, ACTIONS_PAT, AZURE_*)

Echo this list to the user; let them tackle it when they're ready.

## Notes

- **Idempotency**: `bootstrap` is idempotent. If the user runs `/new-project` and the skill detects an incomplete user-scope (e.g. they manually deleted a hook), it can re-run bootstrap safely.
- **Updating janus**: `npx @pantheon-tech/janus update` pulls in upstream improvements; user edits to `~/.claude/skills/*` and `~/.claude/CLAUDE.md` are preserved by default.
- **Running offline**: `npx` caches the package. After first install, subsequent `scaffold` invocations work offline (the scaffold script + templates are local).
- **Running outside ~**: the skill can be invoked from any directory; the scaffolder always writes to its own absolute target path. `pwd` is irrelevant.
