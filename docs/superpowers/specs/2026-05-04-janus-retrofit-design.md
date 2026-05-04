# janus retrofit — design

**Status:** draft (rev 2 — addresses code-review iteration 1)
**Date:** 2026-05-04
**Author:** Daniel (with Claude)
**Scope:** v0.1 of `janus diagnose` and `janus retrofit` subcommands

## 1. Problem

`janus scaffold` is greenfield-only: it writes into a fresh target directory and assumes no prior state. There is no way to bring an existing TypeScript repo onto the janus baseline (biome, lefthook, pnpm, Claude kit, conventions, archetype-specific layout) other than by hand.

The user has several pre-janus repos and wants a tool that produces a deterministic, reviewable PR turning any of them into a janus-conformant repo.

## 2. Goals & non-goals

**Goals (v0.1):**

- `janus diagnose` — read-only analysis. Produces a JSON plan describing every file change needed to bring the repo to the janus baseline.
- `janus retrofit --plan <file>` — executes an approved plan. Lands changes as a series of logical commits on a `janus/retrofit` branch (configurable).
- Cover all six archetypes: `generic-ts`, `backend-functions`, `backend-container-app`, `frontend-vite-react`, `mcp-server`, `monorepo-root`.
- Strip displaced tools (eslint, prettier, husky, jest, npm/yarn lockfiles); install replacements (biome, lefthook, vitest, pnpm).
- Additively merge `.claude/settings.json`. Snapshot existing `CLAUDE.md` to `CLAUDE.pre-janus.md`. Overlay janus's skills/agents/commands.
- Drop a `.janus.json` marker so subsequent runs become "update" operations.
- Idempotent: re-running diagnose against an already-retrofitted repo produces a plan with zero or only-update steps.
- Deterministic: two diagnose runs with identical inputs produce byte-identical plan JSON.

**Non-goals (v0.1):**

- Detecting archetype automatically. User passes `--archetype <name>`.
- Source-code refactoring (moving files into `src/functions/`, renaming exports, etc.).
- Migrating tools outside the displaced-tools list (e.g., rome, dprint, lint-staged, pre-commit) — flagged as warnings.
- Writing into the working tree before user approval — diagnose is strictly read-only.
- Opening a PR. Retrofit pushes nothing.
- Rolling back a partial retrofit automatically.
- Running outside a git repository.
- Repos containing **submodules** — diagnose refuses with a clear error.
- Repos on **case-insensitive filesystems** where a target file collides case-insensitively with an existing one — diagnose refuses.
- Repos with **symlinks** anywhere in the janus-baseline target paths — diagnose refuses (user must resolve before retrofit).
- **Drift detection** for janus-shipped files modified by the user — v0.1 always replaces but emits a warning per overwritten file (see §10 for the SHA-based safeguard).
- Per-package retrofit inside a monorepo — `monorepo-root` archetype sets up the workspace root only.
- Windows support (Linux + macOS only; consistent with existing janus tooling).

## 3. Architecture

Three modules, two commands.

```
janus diagnose ──► analyzer ──► slot-resolver ──► plan-builder ──► .janus-retrofit.json
janus retrofit ──► executor (pre-flight + apply) ──► git ──► .janus.json
```

| Module            | Owns                                                                                                            | Inputs                                          | Outputs                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| **analyzer**      | "What's in this repo?" — pkg manager, lint/format tools, hooks, `.claude/` contents, dirty tree, existing marker | repo path, `--archetype` flag                   | `RepoSnapshot` (in-memory)                               |
| **slot-resolver** | "What template values are needed?" — sources slot values from git remote, `package.json`, prior marker, prompts | `RepoSnapshot`, archetype, prior `.janus.json`  | `SlotMap` (in-memory)                                    |
| **plan-builder**  | "What needs to change?" — renders templates with slots, computes overlay tree, diffs against snapshot, builds steps | `RepoSnapshot`, `SlotMap`, archetype, janus version | `Plan` JSON written to disk                              |
| **executor**      | "Apply this plan" — pre-flight, iterate steps, commit per step, write marker on success                         | `Plan` JSON, repo path                          | git branch with N commits + `.janus.json`                |

The split makes each module independently testable: analyzer is pure-read against fixture repos, slot-resolver is mostly pure (only the prompt path has I/O), plan-builder is a pure function `(snapshot, slots, archetype, version) → plan`, executor is the only module that mutates state.

## 4. Pre-flight checks

Both commands run pre-flight before doing anything substantive.

**Diagnose pre-flight:**

1. CWD inside a git repository (`git rev-parse --show-toplevel` succeeds).
2. `--archetype` is one of the six known values.
3. If `.janus.json` exists, it parses and `schema_version` is recognised.
4. Required tools available: `git`, `jq`, `node`, plus `mo` (vendored).
5. **No git submodules** (`git submodule status` empty).
6. **No symlinks** within paths the chosen archetype's overlay would touch (`find <target_paths> -type l`).
7. **No case-insensitive collisions** between existing files and janus baseline targets (compute target paths, lowercase, check for collisions in `git ls-files`).

**Retrofit pre-flight (in addition to diagnose's):**

8. `--plan <file>` exists, is readable, parses as JSON, validates against the `Plan` JSON schema.
9. Plan's **`schema_version`** matches the running CLI's supported schema version. (Plan's `janus_version` is informational only — drift triggers a warning, not a hard stop. Rationale: schema is the contract; janus_version drift across patch/minor releases shouldn't force regeneration.)
10. Plan's `repo_root` matches current `git rev-parse --show-toplevel`.
11. Working tree clean: `git status --porcelain` empty.
12. HEAD is on a tracking branch (not detached).
13. The **target branch** (default `janus/retrofit`, overridable with `--branch <name>`) does not exist locally or on `origin`. If default is taken and `--branch` is not supplied, suggest `janus/retrofit-2`, `janus/retrofit-3`, etc. and exit. (Re-running retrofit after a partial run is supported by passing a fresh `--branch`.)
14. Required tools for execution: as in diagnose, plus `pnpm`.

Any failure aborts with a specific error message and a suggested remediation. None of the pre-flight checks modify state.

## 5. Analyzer

The analyzer produces a `RepoSnapshot` — a structured description of everything retrofit cares about. It is purely observational; no judgments about what to do are made here. **The analyzer never reads source code under `src/`.** Its scope is config, hooks, docs, and `.claude/`.

**RepoSnapshot fields:**

```ts
type RepoSnapshot = {
  repo_root: string;
  has_janus_marker: boolean;
  prior_marker?: JanusMarker;
  package_manager: 'pnpm' | 'npm' | 'yarn' | 'none';
  lockfiles_present: string[];
  package_json?: PackageJsonSnapshot;
  workspace?: { type: 'pnpm', packages: string[] };
  displaced_tools: DisplacedTool[];           // see detection rules below
  baseline_files: BaselineFileStatus[];        // see §6
  claude_kit: ClaudeKitSnapshot;
  ci_workflows: WorkflowFile[];                // path + 'references_displaced_tool': string[]
  unknown_tools: string[];                     // see §6
  git: { head_branch: string; is_tracking: boolean; tree_clean: boolean; has_submodules: boolean };
  remote: { origin_url?: string; parsed?: { host: string; org: string; repo: string } };
};
```

**Detection rules — concrete, not heuristic:**

- `pnpm` if `pnpm-lock.yaml` present OR `package.json:packageManager` starts with `pnpm@`. Else `npm` if `package-lock.json`. Else `yarn` if `yarn.lock`. Else `none`.
- `displaced_tools.eslint` if any of: `.eslintrc.{js,cjs,json,yaml}`, `eslint.config.{js,mjs,ts}`, `package.json:devDependencies.eslint`, `package.json:eslintConfig`.
- `displaced_tools.prettier` if any of: `.prettierrc*`, `prettier.config.*`, `package.json:devDependencies.prettier`, `package.json:prettier`.
- `displaced_tools.husky` if `.husky/` directory exists OR `package.json:devDependencies.husky`.
- `displaced_tools.jest` if `jest.config.*`, `package.json:devDependencies.jest`, `package.json:jest`.
- `displaced_tools.commitlint_old` if commitlint is present but configured differently than janus's `commitlint.config.js`.

**`baseline_files`** is computed by walking the *rendered overlay tree* (see §6) and comparing each target file. For every target path:

```ts
type BaselineFileStatus = {
  path: string;                                  // relative to repo_root
  status: 'missing' | 'present_identical' | 'present_differs';
  pre_state_hash?: string;                       // sha256 of current file content; only when status != 'missing'
};
```

**`unknown_tools`** is populated against a curated denylist of known TS-ecosystem tools we don't have an opinion on yet. **The denylist lives in `docs/conventions/dependencies.md`** (currently a stub — perfect home), so the rule is reviewable in the conventions doc rather than buried in code.

## 5a. Slot resolution

janus templates use Mustache `<%snake_case%>` placeholders (workload, github_org, author_name, etc.). For greenfield, scaffold.sh prompts the user. For retrofit, we want a deterministic, hand-editable plan, so slots are resolved up front.

**Source order per slot (first hit wins):**

1. **Prior `.janus.json`** — if `slots` block present, use those values. (This makes re-runs frictionless.)
2. **Auto-source from snapshot:**
   - `github_org`, `workload` ← parsed from `RepoSnapshot.remote.parsed`
   - `author_name`, `author_email` ← `package.json:author` (string parse) or `git config`
   - `description` ← `package.json:description`
   - `node_version` ← `.nvmrc` or `package.json:engines.node`
3. **Interactive prompt** — only for slots still unresolved after steps 1–2.
4. **`--slot key=value` CLI flags** — override any of the above. Repeatable. Useful for non-interactive / CI runs.

**Required slots vary by archetype.** A static manifest at `templates/<archetype>/slots.json` declares which slots that archetype's templates reference and which are required vs. defaultable. plan-builder fails fast if a required slot is unresolved at end of the source chain.

**`SlotMap` is persisted in two places:**
- Inside the plan JSON (so retrofit doesn't re-prompt).
- Inside `.janus.json` (so future diagnose runs reuse).

This makes the diagnose step **deterministic given the same inputs**: identical snapshot + identical slots → identical plan JSON. Two diagnose invocations on a clean repo will produce byte-identical plans only if either (a) interactive prompts are answered identically or (b) `--slot` flags supply all values. CI/test fixtures use the latter.

## 6. Plan-builder

Pure function: `buildPlan(snapshot, slotMap, archetype, janus_version) → Plan`.

**Overlay tree computation (mirrors `scripts/scaffold.sh` exactly):**

The plan-builder builds a single in-memory **rendered overlay tree** before producing steps. This is the source of truth for "what janus says this repo should contain."

Algorithm (matches scaffold.sh):

1. Walk `templates/_shared/`. For each file:
   - Skip if it matches a path in `templates/<archetype>/.exclude`.
   - If filename ends in `.tmpl`, render via `mo` with `slotMap`; output path drops `.tmpl`.
   - Otherwise copy verbatim.
   - Add to tree at the resulting path.
2. Walk `templates/<archetype>/`. For each file:
   - Skip `.exclude` itself, and any other meta files documented in the archetype manifest.
   - **`package.json.tmpl` is special:** render with `mo`, then jq deep-merge over the shared `package.json` already in the tree (`jq -s '.[0] * .[1]'`).
   - **`.env.example` is special:** append to shared file (if shared has one), don't replace.
   - Otherwise: render-or-copy and **overwrite** any same-path entry from step 1. (Per AGENTS.md: archetype takes precedence on collision.)
3. If the archetype excludes `infra/`, strip `deploy:staging` and `deploy:prod` from `package.json:scripts` (matches scaffold.sh's special-case at line 314).

The result is a flat map `{ path → { content_bytes, mode } }`. Plan-builder uses this as its target-state input. **No "_shared then archetype" two-pass at execution time** — the overlay collapse happens in plan-builder; executor sees only the final desired contents.

**Steps (each becomes one commit):**

Steps are grouped by category for readability and review. **Within a category, ordering is alphabetical by step `id`** to guarantee determinism across diagnose runs.

1. `displace-tools` — one step per displaced tool. Each removes config files, removes devDependencies, removes scripts that reference the tool.
2. `set-package-manager` — one step. Sets `package.json:packageManager` to `pnpm@<version-from-shared-template>`, deletes non-pnpm lockfiles.
3. `apply-shared-overlay` — one step per file group from the rendered overlay tree:
   - `configs` (`biome.jsonc`, `lefthook.yml`, `commitlint.config.js`, `tsconfig.base.json`, `tsconfig.json`)
   - `root-docs` (`AGENTS.md`, `README.md`, `LICENSE`, `SECURITY.md`, `CODEOWNERS`)
   - `conventions` (`docs/conventions/*`)
4. `apply-archetype-overlay` — one step per file group within the archetype (config, infra, src skeleton, tests skeleton). The plan-builder selects only files in the rendered tree that came from the archetype overlay (or were modified by it), to keep step diffs reviewable.
5. `merge-claude-kit`:
   - `claude-settings-merge` — additive merge of `settings.json` (rules in §8).
   - `claude-md-snapshot` — rename existing `CLAUDE.md` → `CLAUDE.pre-janus.md`, write janus's `CLAUDE.md`, insert `@CLAUDE.pre-janus.md` as the second line of the new file (after the existing `@AGENTS.md` import, so AGENTS conventions load first and the user's prior prose loads as supplementary context).
   - `claude-skills-overlay`, `claude-commands-overlay`, `claude-agents-overlay`, `claude-hooks-overlay` — overlay-with-replace; each janus-shipped file that already exists in the target generates a `WARN_OVERWRITE_USER_KIT` warning if its `pre_state_hash` doesn't match the hash recorded for that file in janus's release manifest (or unconditionally for v0.1, since no release manifest exists yet).
6. `install-deps` — **omitted entirely if `archetype === 'monorepo-root'`** (workspace install is left to the user; documented in plan output). Otherwise: writes the merged `package.json` from the rendered tree, runs `pnpm install`, commits the resulting `pnpm-lock.yaml`. See §9 for failure handling.
7. `write-marker` — one step. Writes `.janus.json`.

**Idempotency on re-run:** if the snapshot shows a category is already in the desired state (e.g., repo already on pnpm; biome.jsonc byte-identical to rendered version), the corresponding step is omitted. Diagnose against an already-retrofitted repo produces a plan with zero or only-update steps.

## 7. Plan JSON schema

The plan file is the contract between diagnose and retrofit. Validated against `src/retrofit/schema/plan.schema.json` at retrofit pre-flight (check #8).

```jsonc
{
  "schema_version": "1",                       // ← retrofit checks this, not janus_version
  "janus_version": "0.1.0",                    // informational; warning on mismatch
  "generated_at": "2026-05-04T15:30:00Z",
  "repo_root": "/home/skip/git/foo",
  "archetype": "backend-functions",
  "target_branch": "janus/retrofit",           // from --branch or default
  "slots": {                                    // resolved values from §5a
    "workload": "foo",
    "github_org": "pantheon-tech",
    "author_name": "Daniel Smith",
    "author_email": "daniel@skipper.kiwi",
    "node_version": "24",
    "region": "westus2"
  },
  "prior_marker": null,                         // contents of existing .janus.json or null
  "warnings": [
    { "code": "UNKNOWN_TOOL", "message": "lint-staged detected; not migrated", "evidence": ["package.json:devDependencies.lint-staged"] },
    { "code": "WORKFLOW_REFERENCES_DISPLACED_TOOL", "message": ".github/workflows/ci.yml runs `npm ci` and `eslint`", "evidence": [".github/workflows/ci.yml"] }
  ],
  "steps": [
    {
      "id": "displace-eslint",
      "category": "displace-tools",
      "title": "Remove eslint",
      "commit_message": "chore: remove eslint in favor of biome",
      "preconditions": [
        { "type": "file_exists", "path": ".eslintrc.json" }
      ],
      "operations": [
        { "op": "delete_file", "path": ".eslintrc.json" },
        { "op": "json_remove", "path": "package.json", "pointer": "/devDependencies/eslint" },
        { "op": "json_remove_matching", "path": "package.json", "pointer": "/scripts", "value_regex": "eslint" }
      ],
      "commit_paths": [".eslintrc.json", "package.json"]
    }
    // ...
  ]
}
```

**Commit message convention:** all retrofit commits use **`chore:` with no scope**. Rationale:
- The Conventional Commits specification accepts `<type>:` without scope.
- The very first retrofit commit may land *before* janus's lefthook/commitlint config is installed, so commit-msg hooks may not yet enforce anything; commits *after* will be validated by the just-installed config. `chore:` is valid in both states.
- This avoids inventing a `retrofit` scope that conflicts with the user's pre-existing commitlint config (if any).
- Executor never uses `--no-verify`. If a commit-msg hook fails, the executor aborts and the user is told why.

**Operation vocabulary (closed set, executor refuses unknown ops at pre-flight):**

| Op                       | Meaning                                                                         |
| ------------------------ | ------------------------------------------------------------------------------- |
| `write_file`             | Write file with given content (utf-8). Required: `path`, `content`. Optional: `pre_state_hash` (executor verifies if the path exists; aborts on mismatch — closes TOCTOU window). Optional: `overwrite: true` (default false; required if file exists). |
| `delete_file`            | Delete file. No-op if missing. Optional: `pre_state_hash`.                      |
| `delete_directory`       | Recursive delete. No-op if missing.                                             |
| `rename_file`            | Move within repo. Fails if destination exists.                                  |
| `json_set`               | Set JSON pointer to value.                                                      |
| `json_remove`            | Remove JSON pointer. No-op if missing.                                          |
| `json_remove_matching`   | Remove keys under pointer whose values match regex.                             |
| `json_merge`             | Deep-merge object into pointer location (additive — no overwrites of scalars).  |
| `claude_settings_merge`  | Specialized: per-field merge of `.claude/settings.json` (see §8).                |
| `shell`                  | Run a whitelisted command. **Whitelist (closed):** `pnpm install`, `pnpm dedupe`. Args are static literals defined in plan; executor refuses any `shell` op whose `command` is not on the whitelist, even if the JSON parses. **`commit_paths` field is required** for shell ops — executor stages only those paths after the command runs; any other modified files trigger an abort with `EXTRANEOUS_FILE_MODIFICATIONS`. |

**Step-level fields:**

- `commit_paths: string[]` — paths the executor will `git add` for this step's commit. Defined per-step (not per-op) so monitoring extraneous changes is straightforward. Executor validates that no other files are modified before committing.
- `preconditions` are AND-combined; if any fails, the step is **skipped** (recorded as `skipped` in the run report). This is what makes plans idempotent across re-runs.

**Determinism:** plan-builder must produce byte-identical JSON for identical inputs. This is a **testable contract**: a CI test runs diagnose against a fixture repo with fixed slots, hashes the plan output, asserts the hash matches a golden value.

## 8. `.claude/` merge rules

This is the most delicate part of retrofit because `.claude/` accumulates user state. The rules below apply per known field — there is **no generic "deep merge" fallback**, since deep-merge of arbitrary user state has too many failure modes.

**`.claude/settings.json`** — `claude_settings_merge` op. Per-field rules:

| Field                                  | Merge rule                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `permissions.allow`, `permissions.deny`| Append janus's entries that aren't string-identical to any existing entry. Don't try to detect glob coverage (too clever). Emit `SETTINGS_PERMISSION_REDUNDANT` warning if both a broad (`Bash(pnpm *)`) and a narrower (`Bash(pnpm install)`) entry end up present after merge. |
| `hooks.<event>` (array of objects)     | For each janus entry, look for an existing entry with the same `(matcher, hook command basename)` pair. If absent, append. If present and command differs → emit `SETTINGS_HOOK_CONFLICT` warning, keep user's. If present and command identical → no-op.    |
| `enabledPlugins` (object)              | Shallow merge: union of keys. On key conflict, **janus wins** (plugin enable/disable is authoritative). Emit warning per overridden key. |
| `model`, `theme`, `cleanupPeriodDays`, other top-level scalars | If user has set the field, **preserve user's value** and emit `SETTINGS_SCALAR_CONFLICT` warning. If unset, write janus default.       |
| Top-level fields janus doesn't ship    | Untouched.                                                                                                                   |

The canonical "what janus ships in settings.json" is defined by `SETTINGS_BASE` in `scripts/scaffold.sh` (lines 354+). plan-builder reuses the same construction logic so retrofit and scaffold stay aligned.

**`CLAUDE.md`** — never merged.

- If existing `CLAUDE.md` is present: rename to `CLAUDE.pre-janus.md`, write janus's template (rendered via `mo`), and **insert `@CLAUDE.pre-janus.md` as the second line** (after the existing `@AGENTS.md` import in the janus template). User's prose still loads, AGENTS conventions load first.
- **Why `CLAUDE.pre-janus.md` and not `CLAUDE.local.md`:** `CLAUDE.local.md` is conventionally git-ignored by Claude Code (it's the local-only override file). Snapshot is meant to *preserve* user intent, not silently drop it from version control. The `pre-janus` name is also self-documenting.
- If `CLAUDE.pre-janus.md` already exists at retrofit time: abort step with `CLAUDE_PRE_JANUS_EXISTS` error; user must rename or delete first.
- Plan-builder writes the chosen target path as `claude_md_snapshot.target_path` in the step JSON so the user can audit (and override by hand-editing the plan) before approving.

**Skills, commands, agents, hooks** — overlay-with-replace:

- Janus is the source of truth for any filename it ships. On collision, janus's version wins (rationale: shipped skills are versioned artifacts, like a package upgrade).
- User-only files (those janus doesn't ship) are preserved untouched.
- Each overwrite of a pre-existing user file emits a `WARN_OVERWRITE_USER_KIT` warning in the plan, with the file path. v0.1 surfaces these so the user knows what's about to change. Drift detection (skip overwrite if user modified) is deferred — see §13.

## 9. Executor

The executor is a loop over plan steps. Per step:

1. Evaluate `preconditions`. If any fail, **skip the step** (record as `skipped`). Idempotent on re-runs.
2. For each operation that has a `pre_state_hash`: read the file, compute SHA-256, abort step if mismatch (`PRE_STATE_HASH_MISMATCH`). Closes the TOCTOU window between diagnose and retrofit.
3. Execute operations in order. Each operation is fully applied or throws.
4. Compute the actual set of modified paths (`git status --porcelain`); compare against `step.commit_paths`. If any extra path was modified → abort with `EXTRANEOUS_FILE_MODIFICATIONS`.
5. `git add` the paths in `commit_paths`, then `git commit -m <step.commit_message>`. **No `--no-verify`.** If a commit-msg hook fails (e.g., commitlint rejects), executor aborts and prints the hook output.

**On abort:**
- Print which step failed, the error code, the SHA of the last successful commit, and a `git reset --hard <sha>` hint.
- **Do not attempt rollback.** The user has a clean branch with N successful commits and one failed step. They can fix forward (resolve the issue, re-run retrofit on a fresh `--branch`) or `git reset --hard` to discard.
- Why no rollback: rollback in git is `git reset --hard`, which loses any user-side fix-in-progress. Telling the user explicitly is honest; pretending we can clean up automatically risks losing work.

**`pnpm install` failure (step `install-deps`):**
- The `package.json` write happens in the same step as the `pnpm install` shell op. If the shell op fails, the step's commit hasn't been made yet. The executor aborts; `package.json` is left modified in the working tree.
- User options: fix the underlying issue (peer dep, registry auth, network) and re-run retrofit on a fresh `--branch` (idempotency skips already-applied steps), or `git reset --hard` to discard the package.json edit.
- Documented in the plan's `warnings` if `install-deps` is present (`INSTALL_DEPS_MAY_FAIL`).

**After all steps complete:**

6. Write `.janus.json`.
7. `git add .janus.json && git commit -m "chore: write janus marker"`.
8. Print summary: branch name, commit count, warnings count, next-step hint:

```
✓ Retrofit complete on branch janus/retrofit (12 commits, 2 warnings)

Next steps:
  git push -u origin janus/retrofit
  gh pr create --base staging   # janus convention: feature PRs target staging, not main
```

The PR base hint matches `docs/conventions/git-workflow.md`. The branch name `janus/<...>` is a deliberate exception to the `feat/`/`fix/`/`chore/` naming convention — this is tooling-driven, not author-driven, and `janus/` makes its origin obvious. Documented as such in the plan output.

## 10. State tracking — `.janus.json`

Lives at the repo root. Committed to git. Format:

```jsonc
{
  "schema_version": "1",
  "janus_version": "0.1.0",
  "archetype": "backend-functions",
  "applied_at": "2026-05-04T15:42:00Z",
  "applied_steps": ["displace-eslint", "displace-prettier", "...", "write-marker"],
  "skipped_steps": [],
  "slots": {                                  // ← persisted from plan; powers re-run frictionlessness
    "workload": "foo",
    "github_org": "pantheon-tech",
    "author_name": "Daniel Smith",
    "author_email": "daniel@skipper.kiwi",
    "node_version": "24",
    "region": "westus2"
  },
  "shared_overlay_version": "0.1.0",          // ← copied from janus_version at write time; future drift-detection input
  "archetype_overlay_version": "0.1.0"
}
```

**Why at repo root:** discoverability — same logic as `.nvmrc` or `package.json:packageManager`. A future janus engineer doing a code review immediately sees "this repo was retrofitted at v0.1.0."

**How re-runs work:**
- Subsequent `diagnose` reads `.janus.json`, populates `slots` from it without re-prompting (unless `--slot key=value` overrides), and produces an update plan.
- For v0.1, "update plan" generation is the same code path as "fresh plan." Idempotent step preconditions naturally skip already-applied work. A dedicated `janus update` subcommand can come later.
- The `shared_overlay_version` and `archetype_overlay_version` fields are written but not yet *read* by v0.1 — they're forward-compat input for future drift detection and update-only step selection.

## 11. CLI surface

```
janus diagnose --archetype <name> [--out <path>] [--slot key=value ...]
  - Default --out: ./.janus-retrofit.json
  - --slot key=value (repeatable) overrides any auto-sourced or prompted slot
  - Stdout: human summary at end (see below)
  - Exit 0 if plan generated (even if it has zero steps)
  - Exit 1 on pre-flight failure
  - Exit 2 on internal error

janus retrofit --plan <path> [--branch <name>] [--dry-run]
  - --branch defaults to 'janus/retrofit'; if taken and not overridden, exits with suggestion
  - --dry-run: validate plan + print step summary, exit without committing
  - Exit 0 on success
  - Exit 1 on pre-flight failure
  - Exit 2 on mid-execution failure (prints last-good SHA + suggested git reset command)
  - Exit 3 on internal error
```

**Diagnose stdout format (human-readable summary, after writing JSON):**

```
janus diagnose v0.1.0 — backend-functions archetype

Plan: 12 steps (3 displace-tools, 4 apply-overlay, 4 merge-claude-kit, 1 install-deps)
Warnings: 2
  - UNKNOWN_TOOL: lint-staged detected; not migrated (package.json:devDependencies.lint-staged)
  - WORKFLOW_REFERENCES_DISPLACED_TOOL: .github/workflows/ci.yml runs `npm ci` and `eslint`

Files to be overwritten (5):
  package.json                 (sha256:abc1234… → merged content)
  .claude/settings.json        (sha256:def5678… → additive merge)
  README.md                    (sha256:ghi9abc… → janus template)
  .claude/skills/foo.md        (sha256:jkl3def… → janus version) [WARN_OVERWRITE_USER_KIT]
  .claude/hooks/session.sh     (sha256:mno6ghi… → janus version) [WARN_OVERWRITE_USER_KIT]

Plan written to .janus-retrofit.json
Next: review the plan, then run `janus retrofit --plan .janus-retrofit.json`
```

Both subcommands surface in `janus --help`. Existing subcommands (`scaffold`, `bootstrap`) are untouched.

## 12. Testing strategy

**Unit:**

- Analyzer: against ~10 fixture repo directories under `tests/fixtures/repos/<name>/` (greenfield, eslint-only, prettier+husky, pnpm-workspace, npm-with-jest, already-janus, repo-with-submodule, repo-with-symlink, repo-with-user-modified-skill, monorepo). Assert on `RepoSnapshot` shape.
- Slot-resolver: assert correct values pulled from each source; assert prompt-only-for-missing.
- Plan-builder: pure function tests. Given a snapshot + slots + archetype + version, assert plan matches a golden JSON file (snapshot tests; update goldens with `--update-snapshots` flag). **One test per archetype × per fixture-repo-shape** asserts byte-identical plan output across runs (determinism contract).
- Operation handlers: each op type tested in isolation against a temp directory.

**Integration:**

- For each archetype, end-to-end smoke test: spin up a fixture pre-janus repo in a temp dir, run `diagnose --slot ...` (non-interactive), then `retrofit`, assert resulting tree matches a golden snapshot, assert all expected commits exist with the right messages.
- Re-run `diagnose` after `retrofit`: assert plan is empty (idempotency check).
- Pre-flight tests: dirty tree, detached HEAD, existing target branch, mismatched schema_version, repo-with-submodule, repo-with-symlink, case-collision — each must exit non-zero with the right error code.
- **`WARN_OVERWRITE_USER_KIT` test**: fixture has a user-modified `.claude/skills/foo.md`; diagnose must include the warning; retrofit must overwrite (v0.1 behavior) but the warning must be visible in the plan and stdout.
- **commit-msg hook collision test**: fixture has a pre-existing commitlint config that disallows `chore:` (artificial — to verify executor surfaces the hook failure cleanly rather than swallowing it).

**Manual:**

- Dogfood on at least two real pre-janus repos before declaring v0.1 done. Document any unknown-tool warnings encountered as future work.

Tests run as part of `pnpm test` (alongside existing scaffold/bootstrap smoke tests).

## 13. Out of scope (for v0.1)

- Archetype auto-detection.
- Source code refactoring / file movement.
- Migrating tools outside the displaced-tools list (rome, dprint, lint-staged, etc.) — flagged as warnings.
- `janus update` as a distinct subcommand (re-running diagnose+retrofit serves this need for v0.1; `shared_overlay_version` field in `.janus.json` is forward-compat input for the future implementation).
- Drift detection for janus-shipped files modified by the user (skip overwrite if drift detected). v0.1 always replaces and warns.
- Automatic PR creation.
- Automatic rollback on failure.
- Per-package retrofit inside a monorepo. `monorepo-root` archetype sets up the workspace root only; `install-deps` step is omitted for that archetype.
- Submodules, symlinks within target paths, case-insensitive FS collisions — diagnose refuses with clear errors.
- Windows.

## 14. Risks & open questions

- **Plan format stability.** Schema is versioned (`schema_version: "1"`); v0.2 plans with new op types are refused by v0.1 retrofit. v0.1 plans applied by future versions remain forward-compatible if op semantics don't change.
- **`pnpm install` non-determinism.** Lockfile content depends on registry state at retrofit time. Acceptable — once committed, future runs are deterministic.
- **`.claude/settings.json` scalar conflicts.** Verify in dogfooding that warning + preserve-user is the right default; consider promoting to hard-stop if confusion arises.
- **Workspace repos.** v0.1 explicitly limits `monorepo-root` to root setup only. Need to ensure diagnose run from inside a workspace member errors clearly (since `git rev-parse --show-toplevel` returns the workspace root, not the member; we should detect this and refuse).
- **CI workflows.** v0.1 emits `WORKFLOW_REFERENCES_DISPLACED_TOOL` warnings but never modifies workflows. Post-retrofit, the user must update CI by hand. Surfaced explicitly so it's not a surprise.
- **`unknown_tools` denylist drift.** Curated list lives in `docs/conventions/dependencies.md`; needs a process for keeping it current. Acceptable maintenance cost given solo-dev usage.
- **Slot resolution ergonomics.** First-time retrofit may need 4-6 prompts; subsequent runs reuse `.janus.json`. Good. CI/test runs use `--slot` flags exclusively.

## 15. Implementation sketch (informational, not normative)

Layout under `src/retrofit/`:

```
src/retrofit/
├── analyzer/
│   ├── index.ts            — entry: (repoRoot, archetype) → RepoSnapshot
│   ├── package-manager.ts
│   ├── displaced-tools.ts
│   ├── claude-kit.ts
│   ├── baseline-diff.ts    — uses overlay-tree from plan-builder
│   └── git-state.ts
├── slot-resolver/
│   ├── index.ts            — entry: (snapshot, archetype, priorMarker, cliOverrides) → SlotMap
│   ├── auto-sources.ts     — git remote, package.json, etc.
│   └── prompt.ts           — interactive prompts for missing slots
├── plan-builder/
│   ├── index.ts            — entry: (snapshot, slotMap, archetype, version) → Plan
│   ├── overlay-tree.ts     — mirrors scaffold.sh: walk shared, walk archetype, jq-merge package.json
│   ├── steps/
│   │   ├── displace-tools.ts
│   │   ├── apply-shared-overlay.ts
│   │   ├── apply-archetype-overlay.ts
│   │   ├── merge-claude-kit.ts
│   │   └── install-deps.ts
│   └── determinism.ts      — sort steps, sort warnings, etc.
├── executor/
│   ├── index.ts            — entry: (plan, repoRoot, branch) → RunReport
│   ├── preflight.ts
│   ├── operations/
│   │   ├── write-file.ts   — handles pre_state_hash check
│   │   ├── json-set.ts
│   │   ├── claude-settings-merge.ts
│   │   └── shell.ts        — refuses non-whitelisted commands
│   └── git.ts
└── schema/
    ├── plan.schema.json
    └── marker.schema.json
```

CLI subcommands in `bin/janus.js` import from `src/retrofit/` and do nothing more than parse args and dispatch.
