# janus retrofit — design

**Status:** draft
**Date:** 2026-05-04
**Author:** Daniel (with Claude)
**Scope:** v0.1 of `janus diagnose` and `janus retrofit` subcommands

## 1. Problem

`janus scaffold` is greenfield-only: it writes into a fresh target directory and assumes no prior state. There is no way to bring an existing TypeScript repo onto the janus baseline (biome, lefthook, pnpm, Claude kit, conventions, archetype-specific layout) other than by hand.

The user has several pre-janus repos and wants a tool that produces a deterministic, reviewable PR turning any of them into a janus-conformant repo.

## 2. Goals & non-goals

**Goals (v0.1):**

- `janus diagnose` — read-only analysis. Produces a JSON plan describing every file change needed to bring the repo to the janus baseline.
- `janus retrofit --plan <file>` — executes an approved plan. Lands changes as a series of logical commits on a `janus/retrofit` branch.
- Cover all six archetypes: `generic-ts`, `backend-functions`, `backend-container-app`, `frontend-vite-react`, `mcp-server`, `monorepo-root`.
- Strip displaced tools (eslint, prettier, husky, jest, npm/yarn lockfiles); install replacements (biome, lefthook, vitest, pnpm).
- Additively merge `.claude/settings.json`. Preserve existing `CLAUDE.md` as `CLAUDE.local.md`. Overlay janus's skills/agents/commands.
- Drop a `.janus.json` marker so subsequent runs become "update" operations.
- Idempotent: re-running diagnose against an already-retrofitted repo produces an empty (or near-empty) plan.

**Non-goals (v0.1):**

- Detecting archetype automatically. User must pass `--archetype <name>`.
- Source-code refactoring (moving files into `src/functions/`, renaming exports, etc.). Layout changes are out of scope; only configuration, tooling, hooks, docs, and the Claude kit are touched.
- Migrating tools outside the known displaced-tools list (e.g., a repo using rome, dprint, lint-staged, pre-commit). These are flagged in the plan with a warning; user resolves manually.
- Writing into the working tree before user approval — diagnose is strictly read-only.
- Opening a PR. Retrofit pushes nothing; user runs `gh pr create` themselves.
- Rolling back a partial retrofit automatically. If executor aborts mid-plan, the user is told which commit to reset to.
- Running outside a git repository.

## 3. Architecture

Three modules, two commands.

```
janus diagnose ──► analyzer ──► plan-builder ──► .janus-retrofit.json
janus retrofit ──► plan-validator ──► executor ──► git ──► .janus.json
```

| Module           | Owns                                                                 | Inputs                                            | Outputs                                |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| **analyzer**     | "What's in this repo?" — package manager, lint/format tools, hooks, `.claude/` contents, dirty tree, existing `.janus.json` | repo path, `--archetype` flag                     | `RepoSnapshot` (in-memory)             |
| **plan-builder** | "What needs to change?" — diffs snapshot against janus baseline; produces ordered, commit-grouped action list | `RepoSnapshot`, target archetype, janus version   | `Plan` JSON written to disk            |
| **executor**     | "Apply this plan" — pre-flight, iterate steps, commit per step, write marker on success | `Plan` JSON, repo path                            | git branch `janus/retrofit` with N commits + `.janus.json` |

The split makes each module independently testable: analyzer is pure-read against fixture repos, plan-builder is a pure function `(snapshot, archetype, version) → plan`, executor is the only module that mutates filesystem state.

## 4. Pre-flight checks

Both commands run pre-flight before doing anything substantive. Diagnose has a smaller set since it doesn't write.

**Diagnose pre-flight:**

1. Current directory is inside a git repository (`git rev-parse --show-toplevel` succeeds).
2. `--archetype` is one of the six known values.
3. If `.janus.json` exists, its `version` is parseable.
4. Required tools available: `git`, `jq`, `node`.

**Retrofit pre-flight (in addition to diagnose's):**

5. `--plan <file>` exists, is readable, parses as JSON, validates against the `Plan` schema.
6. Plan's `janus_version` matches the running CLI's version (refuse to apply a stale plan).
7. Plan's `repo_root` matches the current `git rev-parse --show-toplevel`.
8. Working tree clean: `git status --porcelain` empty.
9. HEAD is on a tracking branch (not detached).
10. Branch `janus/retrofit` does not already exist (locally or on `origin`).
11. Required tools for execution: `git`, `jq`, `node`, `pnpm`, plus `mo` (vendored).

Any failure aborts with a specific error message and a suggested remediation. None of the pre-flight checks modify state.

## 5. Analyzer

The analyzer produces a `RepoSnapshot` — a structured description of everything retrofit cares about. It is purely observational; no judgments about what to do are made here.

**RepoSnapshot fields:**

```ts
type RepoSnapshot = {
  repo_root: string;                    // absolute path
  has_janus_marker: boolean;            // .janus.json exists
  prior_marker?: JanusMarker;           // parsed contents if present
  package_manager: 'pnpm' | 'npm' | 'yarn' | 'none';
  lockfiles_present: string[];          // ['package-lock.json', ...]
  package_json?: PackageJsonSnapshot;   // parsed, never mutated here
  workspace?: { type: 'pnpm', packages: string[] };
  displaced_tools: DisplacedTool[];     // each = { tool, evidence: ['.eslintrc.json', 'package.json:devDependencies.eslint'] }
  janus_baseline_files: FileStatus[];   // for every file _shared/ or archetype overlay would write: { path, status: 'missing'|'present'|'differs' }
  claude_kit: {
    settings_json?: ClaudeSettingsSnapshot;
    claude_md_present: boolean;
    claude_local_md_present: boolean;
    skills: string[];                   // filenames in .claude/skills/
    commands: string[];
    hooks: string[];
  };
  ci_workflows: string[];               // .github/workflows/*.yml
  unknown_tools: string[];              // tools we can't classify (rome, dprint, lint-staged, etc.) — surfaced as warnings
  git: {
    head_branch: string;
    is_tracking: boolean;
    tree_clean: boolean;
  };
};
```

**Detection rules — concrete, not heuristic:**

- `pnpm` if `pnpm-lock.yaml` present OR `package.json:packageManager` starts with `pnpm@`. Else `npm` if `package-lock.json`. Else `yarn` if `yarn.lock`. Else `none`.
- `displaced_tools.eslint` if any of: `.eslintrc.{js,cjs,json,yaml}`, `eslint.config.{js,mjs,ts}`, `package.json:devDependencies.eslint`, `package.json:eslintConfig`.
- `displaced_tools.prettier` if any of: `.prettierrc*`, `prettier.config.*`, `package.json:devDependencies.prettier`, `package.json:prettier`.
- `displaced_tools.husky` if `.husky/` directory exists OR `package.json:devDependencies.husky`.
- `displaced_tools.jest` if `jest.config.*`, `package.json:devDependencies.jest`, `package.json:jest`.
- `displaced_tools.commitlint_old` if commitlint is present but configured differently than janus's `commitlint.config.js`.
- `unknown_tools` populated for anything in a curated denylist of known TS-ecosystem tools we don't have an opinion on yet (rome, dprint, lint-staged, etc.).

**`janus_baseline_files`** is computed by walking `_shared/` and the chosen archetype's directory in the janus install. For every file janus would write, the analyzer records whether the target path is missing, byte-identical, or differs.

The analyzer never reads source code under `src/`. Its scope is config, hooks, docs, and `.claude/`.

## 6. Plan-builder

Pure function: `buildPlan(snapshot, archetype, janus_version) → Plan`.

The plan is an ordered list of **steps**. Each step becomes one commit. Steps are grouped by category for readability and review:

1. `displace-tools` — one step per displaced tool. Each removes config files, removes devDependencies, removes scripts that reference the tool. (e.g., "remove eslint": delete `.eslintrc.json`, `package.json:devDependencies.eslint`, scripts matching `/eslint/`.)
2. `set-package-manager` — one step. Updates `package.json:packageManager`, deletes non-pnpm lockfiles.
3. `apply-shared-overlay` — one step per file group: configs (`biome.jsonc`, `lefthook.yml`, `commitlint.config.js`, `tsconfig.base.json`, `tsconfig.json`), root docs (`AGENTS.md`, `README.md`, `LICENSE`, `SECURITY.md`, `CODEOWNERS`), conventions (`docs/conventions/*`).
4. `apply-archetype-overlay` — one step per file group within the archetype. Files are organized into commit-sized chunks (config, infra, source skeleton, tests skeleton).
5. `merge-claude-kit` — multiple steps:
   - `claude-settings-merge` — additive merge of `settings.json`.
   - `claude-md-snapshot` — rename existing `CLAUDE.md` → `CLAUDE.local.md`, write janus's `CLAUDE.md`.
   - `claude-skills-overlay` — overlay janus's skills, replacing on filename collision, preserving user-only files.
   - `claude-commands-overlay`, `claude-agents-overlay`, `claude-hooks-overlay` — same rule.
6. `install-deps` — one step. Adds janus's devDependencies to `package.json`, runs `pnpm install`, commits the updated `pnpm-lock.yaml`.
7. `write-marker` — one step. Writes `.janus.json`.

Each step records:

- Pre-condition checks (idempotency: skip if already done).
- Concrete operations (file writes, file deletes, JSON-path edits).
- The exact commit message to use.

If the snapshot shows a category is already in the desired state (e.g., repo is already on pnpm), the corresponding step is omitted. This makes the plan idempotent: running `diagnose` against an already-retrofitted repo produces a plan with zero or only-update steps.

## 7. Plan JSON schema

The plan file is the contract between diagnose and retrofit. It must be stable enough to be hand-edited (drop a step you don't want) and re-applied.

```jsonc
{
  "schema_version": "1",
  "janus_version": "0.1.0",
  "generated_at": "2026-05-04T15:30:00Z",
  "repo_root": "/home/skip/git/foo",
  "archetype": "backend-functions",
  "prior_marker": null,                  // or the contents of existing .janus.json
  "warnings": [
    { "code": "UNKNOWN_TOOL", "message": "lint-staged detected; not migrated", "evidence": ["package.json:devDependencies.lint-staged"] }
  ],
  "steps": [
    {
      "id": "displace-eslint",
      "category": "displace-tools",
      "title": "Remove eslint",
      "commit_message": "chore(retrofit): remove eslint in favor of biome",
      "preconditions": [
        { "type": "file_exists", "path": ".eslintrc.json" }
      ],
      "operations": [
        { "op": "delete_file", "path": ".eslintrc.json" },
        { "op": "json_remove", "path": "package.json", "pointer": "/devDependencies/eslint" },
        { "op": "json_remove_matching", "path": "package.json", "pointer": "/scripts", "value_regex": "eslint" }
      ]
    },
    // ...
    {
      "id": "claude-settings-merge",
      "category": "merge-claude-kit",
      "title": "Merge .claude/settings.json",
      "commit_message": "chore(retrofit): merge janus settings into .claude/settings.json",
      "preconditions": [],
      "operations": [
        {
          "op": "claude_settings_merge",
          "additions": {
            "permissions": { "allow": ["Bash(pnpm:*)", "Bash(biome:*)"] },
            "hooks": { "PostToolUse": [/* ... */] }
          }
        }
      ]
    }
  ]
}
```

**Operation vocabulary (closed set):**

| Op                       | Meaning                                                                         |
| ------------------------ | ------------------------------------------------------------------------------- |
| `write_file`             | Write file with given content (utf-8). Fails if exists unless `overwrite: true`.|
| `delete_file`            | Delete file. No-op if missing.                                                  |
| `delete_directory`       | Recursive delete. No-op if missing.                                             |
| `rename_file`            | Move within repo. Fails if destination exists.                                  |
| `json_set`               | Set JSON pointer to value.                                                      |
| `json_remove`            | Remove JSON pointer. No-op if missing.                                          |
| `json_remove_matching`   | Remove keys under pointer whose values match regex.                             |
| `json_merge`             | Deep-merge object into pointer location (additive — no overwrites of scalars).  |
| `claude_settings_merge`  | Specialized: additive merge of `.claude/settings.json` (see §8).                |
| `shell`                  | Run a whitelisted command (`pnpm install`, `pnpm dedupe`). Args are static; no interpolation from snapshot. |

The vocabulary is intentionally closed: the executor is a switch statement, not an interpreter. Adding a new op type is a code change to both plan-builder and executor.

## 8. `.claude/` merge rules

This is the most delicate part of retrofit because `.claude/` accumulates user state.

**`settings.json`** — `claude_settings_merge` op semantics:

- For array fields (`permissions.allow`, `permissions.deny`, `hooks.<event>`): append janus entries that aren't already present. Dedupe by deep equality. Never remove user entries.
- For scalar fields (`model`, `theme`, `cleanupPeriodDays`): if user has set the field, preserve user's value and emit a warning in the plan (`SETTINGS_SCALAR_CONFLICT`). If unset, set to janus's default.
- For object fields not enumerated above: deep-merge with the same scalar-conflict rule applied recursively.

**`CLAUDE.md`** — never merged.

- If existing `CLAUDE.md` is present: rename to `CLAUDE.local.md`, write janus's template at `CLAUDE.md`, add a one-line `@CLAUDE.local.md` import at the top of the new `CLAUDE.md` so the user's prose still loads.
- If `CLAUDE.local.md` already exists at retrofit time: abort step with a specific error; user must resolve.

**Skills, commands, agents, hooks** — overlay-with-replace:

- Janus is the source of truth for any filename it ships. On collision, janus's version wins (the rationale: shipped skills are versioned artifacts, like a package upgrade).
- User-only files (those janus doesn't ship) are preserved untouched.

**Detection of "user-modified" janus files:** out of scope for v0.1. v0.1 always replaces. (Future: compare against the version recorded in `.janus.json` to detect drift.)

## 9. Executor

The executor is a loop over plan steps. Per step:

1. Evaluate preconditions. If any fail, **skip the step** (record as `skipped` in the run report). This is what makes the plan idempotent on re-runs.
2. Execute operations in order. Each operation is either fully applied or throws.
3. `git add` the affected paths, then `git commit -m <step.commit_message>`.
4. On any failure mid-step: abort the entire run. Print which step failed, what error, and the SHA of the last successful commit. Do not attempt to roll back — the user has a clean branch with N successful commits and can `git reset --hard <sha>` if they want to discard.

After all steps complete:

5. Write `.janus.json`.
6. `git add .janus.json && git commit -m "chore(retrofit): write janus marker"`.
7. Print a summary: branch name, commit count, next-step hint (`git push -u origin janus/retrofit && gh pr create`).

The executor does not push. It does not open PRs. It does not call `pnpm install` except as a `shell` op declared in the plan.

**Why no automatic rollback:** rollback in git is `git reset --hard`, which requires a clean tree. After a mid-step failure the tree is dirty (the failing op may have written some files). Telling the user "reset to <sha>" is honest; pretending we can clean up automatically risks losing user work.

## 10. State tracking — `.janus.json`

Lives at the repo root. Committed to git. Format:

```jsonc
{
  "schema_version": "1",
  "janus_version": "0.1.0",
  "archetype": "backend-functions",
  "applied_at": "2026-05-04T15:42:00Z",
  "applied_steps": ["displace-eslint", "displace-prettier", "...", "write-marker"],
  "skipped_steps": []
}
```

**Why at repo root:** same logic as `.nvmrc` or `package.json:packageManager` — discoverability matters. Hiding it inside `.claude/` would mean a future janus engineer doing a code review wouldn't immediately see "this repo was janus-retrofitted at v0.1.0."

**How re-runs work:** on subsequent `diagnose`, if `.janus.json` is present, the analyzer reads it and the plan-builder produces an *update plan* — only steps where janus's baseline has changed since `applied_at` (new conventions, new shared files) appear. The diff between the marker's `janus_version` and the running CLI's version drives this.

For v0.1, "update plan" generation is the same code path as "fresh plan" generation: idempotent step preconditions naturally skip already-applied work. A dedicated `janus update` subcommand can come later.

## 11. CLI surface

```
janus diagnose --archetype <name> [--out <path>]
  - Default --out: ./.janus-retrofit.json
  - Exit 0 if plan generated (even if it has zero steps)
  - Exit 1 on pre-flight failure
  - Exit 2 on internal error

janus retrofit --plan <path> [--dry-run]
  - --dry-run: validate plan + print step summary, exit without committing
  - Exit 0 on success
  - Exit 1 on pre-flight failure
  - Exit 2 on mid-execution failure (prints last-good SHA)
  - Exit 3 on internal error
```

Both subcommands surface in `janus --help`. Existing subcommands (`scaffold`, `bootstrap`) are untouched.

## 12. Testing strategy

**Unit:**

- Analyzer: against ~10 fixture repo directories (greenfield, eslint-only, prettier+husky, pnpm-workspace, npm-with-jest, already-janus, etc.) — each fixture is a directory under `tests/fixtures/repos/<name>/`. Assert on `RepoSnapshot` shape.
- Plan-builder: pure function tests. Given a snapshot + archetype + version, assert the plan matches a golden JSON file. Snapshot tests; update goldens with `--update-snapshots` flag.
- Operation handlers: each op type (`write_file`, `json_remove`, `claude_settings_merge`, etc.) tested in isolation against a temp directory.

**Integration:**

- For each archetype, an end-to-end smoke test: spin up a fixture pre-janus repo in a temp dir, run `diagnose` then `retrofit`, assert the resulting tree matches a golden snapshot.
- Re-run `diagnose` after `retrofit`: assert plan is empty (idempotency check).
- Pre-flight tests: dirty tree, detached HEAD, existing `janus/retrofit` branch, mismatched version — each must exit non-zero with the right error code.

**Manual:**

- Dogfood on at least two real pre-janus repos before declaring v0.1 done. Document any unknown-tool warnings encountered as future work.

Tests run as part of `pnpm test` (alongside existing scaffold/bootstrap smoke tests).

## 13. Out of scope (for v0.1)

- Archetype auto-detection.
- Source code refactoring / file movement.
- Migrating tools outside the displaced-tools list (rome, dprint, lint-staged, etc.) — flagged as warnings.
- `janus update` as a distinct subcommand (re-running diagnose+retrofit serves this need for v0.1).
- Drift detection for janus-shipped files modified by the user.
- Automatic PR creation.
- Automatic rollback on failure.
- Multi-package monorepo retrofit beyond the `monorepo-root` archetype's own files (i.e., we set up the workspace root but don't retrofit each package).
- Windows support (Linux + macOS only; consistent with existing janus tooling).

## 14. Risks & open questions

- **Plan format stability.** Schema is versioned (`schema_version: "1"`), but a v0.2 that adds a new op type means v0.1 plans can still be applied (forward-compat) but v0.2 plans can't be applied by v0.1 retrofit (backward-compat by design — refuse with clear error).
- **`pnpm install` side effects.** The `install-deps` step runs `pnpm install`, which may resolve to slightly different versions over time. Lockfile is committed in the same step, so subsequent runs are deterministic, but the *first* retrofit's lockfile depends on when it was run. Acceptable.
- **`.claude/settings.json` scalar conflicts.** If user has `model: opus` and janus default is `sonnet`, the warning is emitted but execution continues. Verify this matches user intuition; consider promoting to a hard-stop if it causes confusion in dogfooding.
- **Workspace repos.** For `monorepo-root` archetype, retrofit operates only on the root. Per-package retrofit (each workspace package being its own archetype) is deferred. Need to ensure `diagnose` doesn't accidentally classify a workspace member as a standalone repo when run from inside one.
- **CI workflows.** Listed in `RepoSnapshot.ci_workflows` but v0.1 doesn't modify them. If a workflow references `npm ci` or `eslint`, it'll break post-retrofit. Surface these as warnings during diagnose so the user knows what to fix.

## 15. Implementation sketch (informational, not normative)

Layout under `bin/` or a new `src/retrofit/` directory:

```
src/retrofit/
├── analyzer/
│   ├── index.ts            — entry: (repoRoot, archetype) → RepoSnapshot
│   ├── package-manager.ts
│   ├── displaced-tools.ts
│   ├── claude-kit.ts
│   └── baseline-diff.ts
├── plan-builder/
│   ├── index.ts            — entry: (snapshot, archetype, version) → Plan
│   ├── steps/
│   │   ├── displace-tools.ts
│   │   ├── apply-shared-overlay.ts
│   │   ├── apply-archetype-overlay.ts
│   │   ├── merge-claude-kit.ts
│   │   └── ...
├── executor/
│   ├── index.ts            — entry: (plan, repoRoot) → RunReport
│   ├── preflight.ts
│   ├── operations/
│   │   ├── write-file.ts
│   │   ├── json-set.ts
│   │   ├── claude-settings-merge.ts
│   │   └── ...
│   └── git.ts
└── schema/
    ├── plan.schema.json    — JSON schema for the Plan format
    └── marker.schema.json  — JSON schema for .janus.json
```

The CLI subcommands in `bin/janus.js` import from `src/retrofit/` and do nothing more than parse args and dispatch.
