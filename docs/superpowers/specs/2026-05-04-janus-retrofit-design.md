# janus retrofit — design

**Status:** draft (rev 8 — addresses code-review iterations 1–7)
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
- Additively merge `.claude/settings.json`. Snapshot existing `CLAUDE.md` to `CLAUDE.pre-janus.md`. Overlay janus's hooks and skills.
- Drop a `.janus.json` marker so subsequent runs become "update" operations.
- Idempotent: re-running diagnose against an already-retrofitted repo produces a plan with zero or only-update steps.
- **Deterministic** (testable contract): two diagnose runs with identical inputs produce plan JSON whose **`payload` object hashes identically**. (`meta.generated_at` is excluded from the hash by design — see §7.)

**Non-goals (v0.1):**

- Detecting archetype automatically. User passes `--archetype <name>`.
- Source-code refactoring (moving files into `src/functions/`, renaming exports, etc.).
- Migrating tools outside the displaced-tools list (e.g., rome, dprint, lint-staged, pre-commit) — flagged as warnings.
- Writing into the working tree before user approval — diagnose is strictly read-only.
- Opening a PR. Retrofit pushes nothing.
- Rolling back a partial retrofit automatically.
- Running outside a git repository.
- **Submodules** — diagnose refuses with a clear error.
- **Case-insensitive filesystems** where a target file collides case-insensitively with an existing one — diagnose refuses.
- **Symlinks** anywhere in the janus-baseline target paths — diagnose refuses.
- **Drift detection** for janus-shipped files modified by the user — v0.1 always replaces but emits a warning per overwritten file (SHA-based safeguard in §10).
- Per-package retrofit inside a monorepo — `monorepo-root` archetype sets up the workspace root only.
- `.claude/agents/` and `.claude/commands/` overlays — janus ships no files in those directories yet (see §13).
- Windows support (Linux + macOS only).
- Concurrent retrofits in the same repo — caller must serialize. Diagnose is read-only and concurrency-safe within a repo, but two diagnose runs writing to the same `--out` path race on the file write (last-writer-wins).

## 3. Architecture

Three modules, two commands.

```
janus diagnose ──► analyzer ──► slot+plugin resolver ──► plan-builder ──► .janus-retrofit.json
janus retrofit ──► executor (pre-flight + apply) ──► git ──► .janus.json
```

| Module               | Owns                                                                                                            | Inputs                                          | Outputs                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| **analyzer**         | "What's in this repo?" — pkg manager, lint/format tools, hooks, `.claude/` contents, dirty tree, existing marker, plugin-evidence files | repo path, `--archetype` flag                   | `RepoSnapshot` (in-memory)                               |
| **slot+plugin resolver** | "What template values + which plugins?" — sources from prior marker, snapshot, CLI flags, prompts          | `RepoSnapshot`, archetype, prior `.janus.json`  | `SlotMap`, `PluginSet` (in-memory)                       |
| **plan-builder**     | "What needs to change?" — renders templates with slots, computes overlay tree, diffs against snapshot, builds steps | `RepoSnapshot`, `SlotMap`, `PluginSet`, archetype, janus version | `Plan` JSON written to disk                              |
| **executor**         | "Apply this plan" — pre-flight, iterate steps, commit per step, write marker on success                         | `Plan` JSON, repo path                          | git branch with N commits + `.janus.json`                |

The split makes each module independently testable.

## 4. Pre-flight checks

**Diagnose pre-flight:**

1. CWD inside a git repository (`git rev-parse --show-toplevel` succeeds).
2. `--archetype` is one of the six known values.
3. If `.janus.json` exists, it parses and validates against `marker.schema.json`; `schema_version` is recognised.
4. Required tools available: `git`, `jq`, `node`, plus `mo` (vendored).
5. **No git submodules** (`git submodule status` empty).
6. **No symlinks** within paths the chosen archetype's overlay would touch (`find <target_paths> -type l`). Computing the target-path set requires the rendered overlay tree, so this check runs after overlay-tree computation per the pre-flight ordering rule below.
7. **No case-insensitive collisions** between existing files and janus baseline targets.
8. If `--archetype monorepo-root`: search ancestors of `pwd` for a `pnpm-workspace.yaml`. If one is found AND its directory differs from `git rev-parse --show-toplevel`, refuse with `INVOKED_FROM_WORKSPACE_MEMBER`: user has invoked diagnose from inside a workspace member, not the root. (If no `pnpm-workspace.yaml` exists anywhere, the check is a no-op — diagnose proceeds and the resulting plan creates the workspace from scratch.)

**Retrofit pre-flight (in addition to diagnose's):**

9. `--plan <file>` exists, is readable, parses as JSON, validates against `plan.schema.json`.
10. Plan's **`schema_version` is exactly equal** to the running CLI's supported schema version (string equality on `"1"`). `janus_version` mismatch is a warning only.
11. Plan's `repo_root` matches current `git rev-parse --show-toplevel`.
12. Working tree clean: `git status --porcelain` empty, **excluding the `--plan` path itself** (which is expected to be present and untracked or modified).
13. HEAD is on a tracking branch (not detached).
14. The **target branch** (default `janus/retrofit`, overridable with `--branch <name>`) does not exist locally or on `origin`. The remote check uses `git ls-remote --heads origin <branch>` (network call). If `origin` is unreachable (offline / auth failure), exit with `REMOTE_UNREACHABLE` — the user can re-run with `--no-remote-check` (§11) to fall back to local-only verification, accepting the risk of a remote collision discovered at push time. If default is taken and `--branch` is not supplied, search `janus/retrofit-2` … `janus/retrofit-99` for the first free name; **print the suggested name and exit (soft failure with remediation)** — the explicit-opt-in via `--branch <suggested-name>` keeps the destructive operation deliberately under user control. **Under `--no-remote-check`, the suggestion search is local-only; the user accepts the risk that the suggested name may collide on push.** If all 99 are taken, exit with `BRANCH_SUGGESTION_EXHAUSTED`.
15. Required tools for execution: as in diagnose, plus `pnpm`.
16. **Not invoked from a linked git worktree.** The `displace-husky` step's `git config --unset core.hooksPath` writes to the *shared* main `.git/config` from a normal checkout; from a linked worktree it may fail to clear inherited values, leaving the main checkout's husky config untouched. Check via `[ "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)" ]`; if not equal, abort with `INVOKED_FROM_WORKTREE` and instruct the user to run from the main checkout.

**Pre-flight ordering:** checks run in numeric order #1 → #16, except #6 and #7 are deferred until after the analyzer + slot/plugin resolver + overlay-tree computation produce the rendered tree (since computing target paths requires that tree). First failure aborts and emits its specific error code; subsequent checks are not run. This makes test assertions deterministic — for a fixture violating multiple checks, the test asserts the lowest-numbered violator's error code.

Any failure aborts with a specific error message and a suggested remediation. None of the pre-flight checks modify state.

## 5. Analyzer

The analyzer produces a `RepoSnapshot`. It is purely observational. **It never reads source code under `src/`** — its scope is config, hooks, docs, `.claude/`, and a small fixed list of plugin-evidence file globs (see §5b).

**RepoSnapshot fields:**

```ts
type RepoSnapshot = {
  repo_root: string;
  has_janus_marker: boolean;
  prior_marker?: JanusMarker;
  package_manager: 'pnpm' | 'npm' | 'yarn' | 'none';
  lockfiles_present: string[];
  package_json?: PackageJsonSnapshot;             // parsed; never mutated here
  has_package_json: boolean;
  workspace?: { type: 'pnpm', packages: string[] };
  displaced_tools: DisplacedTool[];
  baseline_files: BaselineFileStatus[];           // see §6
  claude_kit: ClaudeKitSnapshot;
  ci_workflows: WorkflowFile[];                   // path + 'references_displaced_tool': string[]
  unrecognized_tools: string[];                   // see "warning allowlist" below
  plugin_evidence: PluginEvidence;                // see §5b
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
- **Dependency-version conflicts:** for each devDep janus's `_shared/package.json.tmpl` (or chosen archetype's `package.json.tmpl`) pins, if the user already has the same dep at a *non-overlapping* range (e.g., user `@biomejs/biome ^1` vs janus `~2.4`), record as `DEP_VERSION_CONFLICT` warning with both ranges. Warning is informational; v0.1 lets jq-merge proceed (janus's pin wins per §6.5) and `pnpm install` is the safety net (peer-dep failure surfaces at `install-deps`).

**Repos with no `package.json`:** snapshot still produced; `has_package_json: false`. Plan-builder treats this as "create from scratch" — the rendered shared `package.json.tmpl` becomes the file content directly (no jq merge needed). Documented in §6.

**`baseline_files`** is computed by walking the *rendered overlay tree* (§6) and comparing each target file:

```ts
type BaselineFileStatus = {
  path: string;                                  // relative to repo_root
  status: 'missing' | 'present_identical' | 'present_differs';
  pre_state_hash?: string;                       // sha256 of current file content; present iff status != 'missing'
  current_mode?: number;                         // file mode (e.g., 0o644, 0o755) iff present
};
```

**`unrecognized_tools` (warning allowlist, not denylist):** A curated list of TS-ecosystem tools janus has *no opinion on yet*. Detection of any of these surfaces a warning in the plan but does not block. **The list lives in `docs/conventions/dependencies.md` under a new heading `## Unrecognized tools (retrofit warning allowlist)`** — adding a tool to the list is a one-PR docs change reviewable on its own.

## 5a. Slot resolution

**Source order per slot (first hit wins):**

1. **Prior `.janus.json:slots`** — frictionless re-runs.
2. **Auto-source from snapshot:**
   - `github_org`, `workload` ← parsed from `RepoSnapshot.remote.parsed`
   - `author`, `author_email` ← `package.json:author`, with both shapes supported: if object form `{ "name": "X", "email": "y@z" }`, read `.name` → `author` and `.email` → `author_email` directly. If string form `"X <y@z>"`, split on the angle brackets. If `package.json:author` is missing/empty/unparseable, fall through to `git config user.name`/`user.email`. If both `git config` keys are also empty/unset, treat as unresolved (→ prompt, or fail under `--non-interactive`).
   - `description` ← `package.json:description` (treats empty string as unresolved → falls through)
   - `node_version` ← `.nvmrc` (raw) or `package.json:engines.node` (parsed: leading integer extracted from range expressions like `>=24`, `^20.0.0`, `24.x`, `24.5.0` → `24`); if no leading integer, treat as unresolved
   - `archetype` ← passed in via `--archetype` flag (always present; not auto-sourced from repo)
3. **Interactive prompt** — only for slots still unresolved.
4. **`--slot key=value` CLI flags** — override any of the above. Repeatable. Required for non-interactive / CI runs.

**Required slot set per archetype** is declared in `templates/<archetype>/slots.json` (a new manifest file, one per archetype). Plan-builder fails fast if a required slot is unresolved.

**Full slot vocabulary (matches `scripts/scaffold.sh` exports lines 203–219, normative):** `workload`, `description`, `archetype`, `github_org`, `author`, `author_email`, `node_version`, `license`, `region`, `template_version`, `year`, `date`, `base_branch`. Auto-sources defined above for the user-derivable ones; the rest have static defaults (`license=MIT`, `region=australiaeast` matching scaffold.sh line 90, `template_version=v<janus_version>`, `node_version=24` if no auto-source hits, `year=<UTC year at retrofit time>`, `date=<UTC date at retrofit time>`, `base_branch=staging`).

(Pre-existing scaffold.sh issues that surface during retrofit are listed in §14 risks, not here.)

**Validation (rev-3 addition):** Every resolved slot is validated against the same regex/format rules `scripts/scaffold.sh` enforces, which are the **normative source of truth**:

| Slot          | Rule                                        |
| ------------- | ------------------------------------------- |
| `workload`    | `^[a-z][a-z0-9]{2,11}$`                     |
| `github_org`  | GitHub username/org rules (1-39 chars, alphanumeric + `-`, no leading/trailing `-`) |
| `author_email`| Standard email regex                        |
| `node_version`| Resolved value must be a major version integer (e.g., `20`, `22`, `24`) **after normalization** in step 2 above. Range expressions like `>=24` or `^20.0.0` are normalized to their leading integer before validation. |

Auto-sourced values that fail validation cause the slot-resolver to fall back to **prompt** (treating the auto-sourced value as absent) so the user can correct. Prompt-supplied values that fail validation re-prompt. `--slot` flag values that fail validation cause `SLOT_VALIDATION_FAILED` exit (exit code 1).

**Under `--non-interactive`** (CLI flag in §11), no prompts are issued. Resolution behavior:

| Situation under `--non-interactive`                                         | Result                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| All required slots resolved through steps 1, 2, or 4 with valid values      | Proceed                                           |
| Required slot has no source (1, 2, 4 all empty) — would normally prompt     | Exit 1, `SLOT_UNRESOLVED_NON_INTERACTIVE`         |
| Auto-sourced value fails validation — would normally fall back to prompt    | Exit 1, `SLOT_UNRESOLVED_NON_INTERACTIVE` (treats fall-back-to-prompt as a non-interactive failure mode) |
| `--slot` flag value fails validation                                        | Exit 1, `SLOT_VALIDATION_FAILED` (same as interactive) |

This makes CI/test runs fail fast and predictably regardless of the source of the slot value.

**Persistence:** resolved `SlotMap` is persisted in both the plan JSON and `.janus.json`.

**Determinism:** identical snapshot + identical slots + identical PluginSet → identical plan `payload` (modulo `meta.generated_at` per §7). CI/test runs use `--slot` exclusively.

## 5b. Plugin resolution

`enabledPlugins` is the only `.claude/settings.json` field whose values come from interactive choice in scaffold.sh, not from templates. Retrofit needs the same input. Source order per plugin (mirrors §5a):

1. **Prior `.janus.json:plugins`** — frictionless re-runs.
2. **Auto-detect from `RepoSnapshot.plugin_evidence`** — fixed list of file globs (the evidence basis is ordered and exhaustive for v0.1):
   - `frontend-design@claude-plugins-official` ← `vite.config.{js,ts,mjs}` OR `next.config.*` OR `react` in `package.json:dependencies`
   - `playwright@claude-plugins-official` ← `playwright.config.{js,ts}` OR `@playwright/test` in `devDependencies`
   - `pyright-lsp@claude-plugins-official` ← `pyproject.toml` OR `requirements*.txt` OR `Pipfile`. (Bare `*.py` at repo root is *not* sufficient — too many false positives from vendored helper scripts.)
   - **`banana-claude@banana-claude-marketplace` is not auto-detected** (no reliable evidence file). Only reachable via `--plugin banana-claude@banana-claude-marketplace` or interactive prompt confirmation. scaffold.sh prompts for this one explicitly; retrofit's parallel is the `--plugin` flag.
3. **`--plugin name@source` CLI flags** — additive. Repeatable. Authoritative for non-interactive / CI runs.
4. **`--no-plugin name` CLI flags** — subtractive. Removes a plugin auto-detected in step 2.
5. **Interactive prompt** — confirm the resolved set ("Enable these N plugins? [Y/n] / Add another? [name@source]"). Skipped under `--non-interactive`.

**Persistence:** resolved `PluginSet` (ordered list of `name@source` strings) is persisted in both plan JSON and `.janus.json`. Order matters for deterministic plan hashing.

## 6. Plan-builder

Pure function: `buildPlan(snapshot, slotMap, pluginSet, archetype, janus_version) → Plan`.

### Overlay tree computation (mirrors `scripts/scaffold.sh` exactly)

The plan-builder builds a single in-memory **rendered overlay tree** before producing steps. This is the source of truth for "what janus says this repo should contain."

The result is a flat map `{ path → { content_bytes, mode } }`. The `mode` field is preserved from source (so `chmod +x` on hook scripts is encoded as `mode: 0o755` in the rendered entry, then propagated to the `write_file` op).

Algorithm (matches scaffold.sh lines 230–325):

1. Walk `templates/_shared/`. For each file:
   - **Skip if it matches a path in `templates/<archetype>/.exclude`** per `is_excluded()` semantics: each non-comment line is a path relative to `_shared/`; **a trailing slash matches the directory and everything under it** (e.g., `src/` excludes all of `src/**`); without trailing slash it matches the exact relative path. (Restating scaffold.sh's `is_excluded` is normative — implementer must use this rule, not naive exact-match.)
   - If filename ends in `.tmpl`, render via `mo` with `slotMap`; output path drops `.tmpl`.
   - Otherwise copy verbatim.
   - Capture file mode from source (`stat -c '%a'` or equivalent). Hook scripts under `_shared/.claude/hooks/` are mode `0755`; everything else is `0644`. (scaffold.sh lines 431–433 chmod +x the hooks post-write; we encode the mode in the overlay tree so the executor restores it directly.)
   - Add to tree at the resulting path.
   - **`.gitignore` is special** (the only `.gitignore` in any janus template is `_shared/.gitignore` — there is none in any archetype, so this rule lives at the `_shared` walk, not the archetype walk): rather than adding a `write_file` op to the overlay tree, plan-builder defers the decision: if the user's repo has an existing `.gitignore`, emit a `gitignore_merge` op (see §7) that appends janus's lines inside a delimited block:
     ```
     # --- janus baseline (managed by janus retrofit; do not edit) ---
     <janus's lines>
     # --- end janus baseline ---
     ```
     If the block already exists from a prior retrofit, replace its body in place (idempotent). If absent, append at end of file (with one blank line separator). User's pre-existing ignores are preserved verbatim. If the user has no `.gitignore`, fall back to a plain `write_file` op carrying the full janus content. Without this special case, retrofit would silently strip user-defined ignores and the next commit would start tracking previously-ignored files — a far worse outcome than `MODULE_TYPE_CHANGE`.
2. Walk `templates/<archetype>/`. For each file:
   - Skip `.exclude`, `slots.json`, and any other `meta` files documented in the archetype manifest.
   - **`package.json.tmpl` is special:** render with `mo`, then jq deep-merge over the shared `package.json` already in the tree using `jq -s '.[0] * .[1]'`. **Note: jq's `*` operator merges objects recursively but overwrites scalars and arrays at leaves.** This means user-side merging (in step 4 below) will *intentionally clobber* user values for any key that janus's templates also set — see §6.5.
   - **`.env.example` is special:** append to shared file (if shared has one), don't replace.
   - Otherwise: render-or-copy and **overwrite** any same-path entry from step 1 (per AGENTS.md: archetype takes precedence on collision).
3. If the archetype excludes `infra/`, strip `deploy:staging` and `deploy:prod` from `package.json:scripts` (matches scaffold.sh line 314).
4. **User-side `package.json` merge for retrofit** (this step is retrofit-specific; scaffold.sh has no user-side input): if the user's repo has an existing `package.json`, jq-deep-merge `{user_pkg} * {janus_rendered_pkg}` → `final_pkg`. Same merge operator (`*`); janus wins on key collisions. The `final_pkg` becomes the overlay-tree content for `package.json`. If the repo has no `package.json`, use `janus_rendered_pkg` directly.
5. **`.claude/settings.json`** is *not* in the overlay tree — it's constructed by the `claude_settings_merge` op at execution time using snapshot data. The op's "additions" payload is computed by plan-builder using the same `SETTINGS_BASE` jq construction as scaffold.sh lines 354–426 (with `pluginSet` plugged into `enabledPlugins`).

### 6.5 What jq-merge clobbers in user `package.json`

jq's `*` is recursive object merge with leaf overwrite for scalars and arrays. Plan-builder applies the merge as `jq -s '.[0] * .[1]' user_pkg.json janus_rendered_pkg.json` — **right operand wins at leaf positions**, so janus wins on every key it sets. Concretely, the user loses:

- **`scripts.<key>`** for any key janus sets (typically: `lint`, `format`, `check`, `build`, `test`, `dev`, `deploy:staging`, `deploy:prod`, `prepare`). Intentional — this is the tool migration. User's *additional* scripts (keys janus doesn't touch) survive.
- **`type`** — janus sets `"module"`. If the user is on CommonJS, this breaks `require()`. Plan-builder emits `MODULE_TYPE_CHANGE` warning when user has `type: "commonjs"` or no `type` field; warning is loud and the user must either accept or hand-edit the plan to remove the `package.json` step. **No automatic refusal in v0.1** — the warning is the safeguard.
- **`engines.node`** — janus sets to a specific major (matching `slot.node_version`). Likely fine; warn anyway.
- **`packageManager`** — janus sets to current pnpm version.
- **`license`** — janus sets per slot. Warn if user has a different license string.
- **`keywords`** (array) — entirely replaced if janus's template sets it. Currently it doesn't, but `WARN_PKG_ARRAY_REPLACED` is reserved.
- **`devDependencies.<dep>`** — additive at the object level (jq's `*` recurses); on collision, janus's pin wins. (Same for `dependencies`.)

Plan-builder produces a `PKG_FIELDS_OVERWRITTEN` warning for each affected leaf, listed in plan stdout (§11).

### 6.6 Steps (each becomes one commit)

Steps are grouped by category. **Within a category, ordering is alphabetical by step `id`** to guarantee determinism. **Within a step, `operations[]` ordering is fixed by the plan-builder per step type (not sorted) — semantically meaningful order, e.g., `delete_file` before `json_remove`.** **`payload.warnings[]` is sorted by `(code, evidence[0], message)`** so that warning order doesn't depend on filesystem walk order; `evidence[0]` falls back to empty string when `evidence` is empty, and `message` breaks ties on identical `(code, evidence[0])`. **`payload.steps[].operations[*].commit_paths` order is fixed; per-step `commit_paths[]` is sorted alphabetically.** Together these rules make the full `payload` byte-stable across runs and hosts (a tested CI contract, not a vague aspiration).

1. `displace-tools` — one step per displaced tool.

   **`displace-husky` is special** because husky leaves state outside `.husky/` that lefthook's install will trip over. Operations (in this order):

   1. `delete_directory` `.husky/`
   2. `json_remove` `package.json:devDependencies.husky`
   3. `json_remove_matching` (key_regex `^(prepare|postinstall)$`) on `package.json:scripts` whose value matches `husky` (uses the value-regex form documented in §7)
   4. `shell` `git config --unset core.hooksPath` (whitelist entry (c) — exit code ignored: no-op if key not set)
   5. `shell` `find .git/hooks -type f -not -name "*.sample" -delete` (whitelist entry (d) — exit code ignored: no-op if dir empty)

   Why ops 4 and 5: modern husky sets `core.hooksPath = .husky/_` and seeds `.git/hooks/<event>` shim files that delegate into `.husky/`. Deleting `.husky/` alone leaves an orphaned config pointing nowhere and orphan shims. lefthook's later install (via the `prepare` script in step 6) needs both cleared to install cleanly.

   Other `displace-*` steps are conventional `delete_file` / `json_remove` sequences with no `.git/`-side cleanup needed.
2. `set-package-manager` — one step. **Operations are limited to deleting non-pnpm lockfiles** (`package-lock.json`, `yarn.lock`). The `package.json:packageManager` field is set later by `apply-shared-overlay/root-configs` via the rendered overlay tree (the user-side jq merge in §6 step 4 produces a `package.json` with janus's `packageManager`). Step is omitted entirely if the repo is already on pnpm with no other lockfiles present.
3. `apply-shared-overlay` — **one step per top-level group**. The categorization rule is **data-driven** (not hardcoded): walk the rendered overlay tree, and for each entry the group is the entry's first path segment. Files at the repo root (no first segment that is a directory) are grouped under the synthetic name `root`. **The `_shared/.claude/**` subtree is explicitly excluded from the walker for step 3 (and step 4) — it is owned exclusively by step 5 (`merge-claude-kit`).** Without this exclusion a naive walker would create a `.claude` group here and double-write everything in step 5. The list below is **illustrative for the present-day `_shared/` tree, not normative** — future janus additions slot in automatically:
   - `root` — files with no directory prefix, partitioned for review-friendliness into three commits via stable id suffix (so alphabetical step ordering still works): `root-dotfiles` (`.editorconfig`, `.gitattributes`, `.gitignore`, `.nvmrc`, `.node-version`, `.env.example`), `root-configs` (`biome.jsonc`, `lefthook.yml`, `commitlint.config.js`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `package.json`), `root-docs` (`AGENTS.md`, `CLAUDE.md`, `README.md`, `LICENSE`, `SECURITY.md`, `CODEOWNERS`). The split is plan-builder logic over the `root` group, not a separate categorization rule. **Attachment of overlay-tree-excluded ops:** `gitignore_merge` (and any future op that is excluded from the overlay tree by §6 step 1's special-case logic) is attached to whichever step would have contained its target file's `write_file` op — for `.gitignore`, that's `root-dotfiles` per the partition above.
   - `infra` (everything under `infra/` if not excluded by archetype)
   - `.github` (everything under `.github/` — workflows, dependabot, issue templates, PR templates, prompts/)
   - `docs` (everything under `docs/` — `conventions/`, `architecture.md`, `adr/`, `plans/`, `runbooks/`)
   - `src` (everything under `src/` if not excluded)
   - `tests` (everything under `tests/` if not excluded)
   - Future top-level dirs added to `_shared/` produce new groups automatically.
4. `apply-archetype-overlay` — one step per file group within the archetype, organized by the same top-level-path rule.
5. `merge-claude-kit`:
   - `claude-settings-merge` — additive merge of `settings.json` (rules in §8).
   - `claude-md-snapshot` — rename existing `CLAUDE.md` → `CLAUDE.pre-janus.md`, write janus's `CLAUDE.md`, insert `@CLAUDE.pre-janus.md` as the second line of the new file.
   - `claude-skills-overlay` — overlay-with-replace **per-file within `.claude/skills/`** (recursive). Janus-shipped skill files (e.g., `.claude/skills/fix/skill.md`) overwrite same-path user files; user-only files at any depth (e.g., `.claude/skills/custom-thing/anything.md`) survive untouched. **Subdirectory-as-unit replacement is NOT v0.1 behavior** — that would clobber user additions inside janus-named skill dirs.
   - `claude-hooks-overlay` — same per-file rule for `.claude/hooks/` (preserves mode 0755 from the rendered overlay tree).
   - `claude-misc-overlay` — overlay-with-replace for any non-template top-level files in `_shared/.claude/` that aren't owned by another substep. v0.1 covers `.claude/README.md` and `.claude/reconcile.config.example` (the only such files currently shipped). Implementation: walk `_shared/.claude/` excluding `hooks/`, `skills/`, and any rendered `settings.json` source — everything left is `claude-misc`. Data-driven so future janus additions slot in automatically.
   - **`claude-agents-overlay` and `claude-commands-overlay` are not v0.1 steps** — janus ships no files in those directories yet. Future janus versions that add agents/commands trigger the corresponding step on next retrofit (the substep enumeration is data-driven, not hardcoded).
   - Each overwrite of a pre-existing user file emits a `WARN_OVERWRITE_USER_KIT` warning in the plan, with the file path.
6. `install-deps` — **omitted entirely if `archetype === 'monorepo-root'`** (workspace install left to user; documented in plan output). Otherwise: writes the merged `package.json` (already done by `apply-shared-overlay/root-configs` — this step just runs `pnpm install` and commits the resulting `pnpm-lock.yaml`). **`commit_paths` is exactly `["pnpm-lock.yaml"]`.** This depends on `.gitignore` already covering `node_modules/`; that's why `apply-shared-overlay/root-dotfiles` (which writes `.gitignore`) MUST run before `install-deps` — enforced by alphabetical step ordering and verified by the test in §12. **Why bare `pnpm install`, not `--lockfile-only` (scaffold.sh's choice):** scaffold.sh produces a fresh project where the user follows up with their own `pnpm install`; retrofit produces a branch the user is about to push and review, so a working install (with `node_modules/`) is more useful for verifying the result locally before pushing. Trade-off: slower step, larger working tree. See §9 for failure handling.
7. `write-marker` — one step. Writes `.janus.json`.

### 6.6.5 Archetype-overlay vs displaced-tools rule

**Archetype overlay files MUST NOT be in the displaced-tools allowlist.** If a future archetype shipped an `.eslintrc.json`, the `displace-eslint` step would delete it and the `apply-archetype-overlay` step would recreate it — a noisy and incoherent commit pair. v0.1 archetypes don't trip this rule (none ship lint/format configs of their own), but the constraint is normative for future archetypes.

### 6.7 Workflow overlay vs. WORKFLOW_REFERENCES_DISPLACED_TOOL warning

The `apply-shared-overlay/.github` step ships janus's named workflow files (group ids preserve the leading-dot of the source directory; the data-driven first-segment rule does not strip dot-prefixes) (e.g., `.github/workflows/ci.yml.tmpl`, `deploy.yml.tmpl`, `infra-preview.yml.tmpl`, `claude-autofix.yml.tmpl`). On collision (user has a same-named file), the overlay-with-replace policy applies: janus wins, `WARN_OVERWRITE_USER_KIT` is emitted.

**`WORKFLOW_REFERENCES_DISPLACED_TOOL` warnings** apply to **user-authored, non-janus-named** workflows that reference displaced tools (e.g., the user has `.github/workflows/qa.yml` running `npm ci && eslint`). v0.1 does not modify these — only warns. The user fixes by hand post-retrofit.

### 6.7.5 Out-of-scope ignore mechanisms

janus does not read or modify `.git/info/exclude` (per-checkout local ignores). Users who use it should be aware: retrofitted files matched by `.git/info/exclude` will appear ignored to git but visible to the executor's overlay tree, with no special handling. v0.1 makes no attempt to merge into or warn about it.

### 6.8 Idempotency on re-run — per-op omission rule

**Granularity is per-op, not per-step.** For each kind of op, plan-builder applies a "would this op produce any change?" check at diagnose time and omits the op entirely when the answer is no:

- **`write_file`:** emit only for paths whose `BaselineFileStatus` is `missing` or `present_differs`. `present_identical` paths produce no op.
- **`gitignore_merge`:** plan-builder computes the would-be merged content (read user's `.gitignore`, splice janus's lines into the delimited block per §7 rules); if the result is byte-identical to the existing file, omit the op. Otherwise emit with `pre_state_hash`.
- **`claude_settings_merge`:** plan-builder computes the would-be merged JSON (per §8 rules); if the result is byte-identical (canonicalized — sorted keys, normalized whitespace) to the existing `.claude/settings.json`, omit the op. Otherwise emit.
- **`json_set` / `json_remove` / `json_remove_matching`:** for each op, plan-builder reads the target file at diagnose time and checks whether the op would actually mutate. If not, omit. (e.g., `json_remove` on a missing pointer is omitted; `json_set` on a pointer already at the target value is omitted.)
- **`delete_file` / `delete_directory`:** omit if the path is already absent.
- **`rename_file`:** omit if source absent and destination present (already renamed).
- **`chmod`:** omit if file already at the target mode.
- **`shell` (whitelist entries (a) `pnpm install`, (b) `pnpm dedupe`):** non-omittable — always emitted when the parent step is present, since their effect (lockfile state, dep graph) is hard to predict from snapshot alone.
- **`shell` (whitelist entries (c) and (d) — husky cleanup):** emit only if `displace-husky` is in the plan (i.e., husky was detected). Already covered by step-level inclusion logic.

**Step-level consequences:**

- A step whose op list becomes empty after per-op omission is **dropped from `payload.steps[]`** entirely. v0.1 does not emit empty steps.
- The executor therefore never encounters a no-op step; "nothing to commit" cannot occur from omission. (Belt-and-braces: if a logic bug causes an empty step to slip through, the executor treats `git status --porcelain` empty after staging as success — `git commit --allow-empty` is **NOT** used; instead the step is recorded as `committed_empty: skipped` in the run report and execution continues.)

Diagnose against an already-retrofitted repo produces a plan with very few or zero steps. Re-running retrofit on a zero-step plan: pre-flight passes (the `.janus.json` marker still gets written, in a single commit); exits 0 with summary "no changes needed."

## 7. Plan JSON schema

Validated against `src/retrofit/schema/plan.schema.json` at retrofit pre-flight (#9).

```jsonc
{
  "schema_version": "1",                       // exact-match check at pre-flight #10
  "meta": {                                     // ← excluded from determinism hash
    "janus_version": "0.1.0",                   // informational; mismatch → warning, not error
    "generated_at": "2026-05-04T15:30:00Z"
  },
  "payload": {                                  // ← all hashing/determinism asserted on this object
    "repo_root": "/home/skip/git/foo",
    "archetype": "backend-functions",
    "target_branch": "janus/retrofit",
    "slots": {
      "workload": "foo",
      "description": "Foo service",
      "archetype": "backend-functions",
      "github_org": "pantheon-tech",
      "author": "Daniel Smith",
      "author_email": "daniel@skipper.kiwi",
      "node_version": "24",
      "license": "MIT",
      "region": "australiaeast",
      "template_version": "v0.1.0",
      "year": "2026",
      "date": "2026-05-04",
      "base_branch": "staging"
    },
    "plugins": [
      "frontend-design@claude-plugins-official",
      "playwright@claude-plugins-official"
    ],
    "prior_marker": null,
    "warnings": [
      { "code": "UNKNOWN_TOOL", "message": "lint-staged detected; not migrated", "evidence": ["package.json:devDependencies.lint-staged"] },
      { "code": "WORKFLOW_REFERENCES_DISPLACED_TOOL", "message": ".github/workflows/qa.yml runs `npm ci` and `eslint`", "evidence": [".github/workflows/qa.yml"] },
      { "code": "MODULE_TYPE_CHANGE", "message": "package.json type will change from 'commonjs' to 'module'", "evidence": ["package.json:type"] },
      { "code": "PKG_FIELDS_OVERWRITTEN", "message": "package.json:scripts.test will be overwritten ('jest' → 'vitest run')", "evidence": ["package.json:scripts.test"] },
      { "code": "WARN_OVERWRITE_USER_KIT", "message": ".claude/skills/foo.md will be overwritten by janus version", "evidence": [".claude/skills/foo.md"] }
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
          { "op": "delete_file", "path": ".eslintrc.json", "pre_state_hash": "sha256:abc..." },
          { "op": "json_remove", "path": "package.json", "pointer": "/devDependencies/eslint" },
          { "op": "json_remove_matching", "path": "package.json", "pointer": "/scripts", "value_regex": "eslint" }
        ],
        "commit_paths": [".eslintrc.json", "package.json"]
      }
      // ...
    ]
  }
}
```

**Determinism contract (testable):** `sha256(JSON.stringify(plan.payload, sortedKeys))` is identical for two diagnose runs with identical inputs. `meta.generated_at` is by definition non-deterministic and is excluded. Schema version stays in `payload` because changes to it would invalidate the determinism contract anyway.

**Commit message convention:** all retrofit commits use **`chore:` with no scope**.
- Conventional Commits accepts `<type>:` without scope.
- The very first commit may land *before* janus's lefthook is installed in `.git/hooks/` (lefthook installs via `prepare` script during `pnpm install`, which runs in step `install-deps` — usually the second-to-last step). So commit-msg validation only kicks in for the `write-marker` commit (and only if the archetype isn't `monorepo-root`, since that archetype omits `install-deps`). `chore:` is valid both pre- and post-install.
- Executor never uses `--no-verify`. If a commit-msg hook fails, executor aborts and prints the hook output.

**Operation vocabulary (closed set; executor refuses unknown ops at pre-flight):**

| Op                       | Meaning                                                                         |
| ------------------------ | ------------------------------------------------------------------------------- |
| `write_file`             | Write file. Required: `path`, `content`. Optional: `mode` (octal int, default `0o644`), `pre_state_hash` (executor verifies if path exists; aborts on mismatch — closes TOCTOU window), `overwrite: true` (default false; required if file exists). **Per the per-file omission rule (§6.8), `write_file` ops are emitted only for `missing` or `present_differs` paths. For `present_differs`, plan-builder MUST emit both `pre_state_hash` and `overwrite: true`. For `missing`, neither is emitted (file isn't there, no TOCTOU concern, default `overwrite: false` is correct).** |
| `delete_file`            | Delete file. Optional: `pre_state_hash`. **If `pre_state_hash` is supplied and the file is missing, abort with `PRE_STATE_HASH_MISSING_FILE`.** If `pre_state_hash` is absent and the file is missing, no-op silently. |
| `delete_directory`       | Recursive delete. No-op if missing.                                             |
| `rename_file`            | Move within repo. Fails if destination exists. Optional: `pre_state_hash` on source. |
| `chmod`                  | Set file mode. Required: `path`, `mode`. (Provided as a separate op so mode-only changes don't require a rewrite.) |
| `json_set`               | Set JSON pointer to value.                                                      |
| `json_remove`            | Remove JSON pointer. No-op if missing.                                          |
| `json_remove_matching`   | Remove keys under `pointer` whose **value matches `value_regex`**, OR (alternative form) keys whose **name matches `key_regex`**. Op accepts exactly one of `value_regex` / `key_regex`. **Regex flavor: ECMA (JavaScript `RegExp`)**, case-sensitive, not auto-anchored — the implementer wraps with `^...$` if anchoring is intended. Specified to remove the "which regex dialect" decision from the implementer.|
| `json_merge`             | Deep-merge object into pointer location. **Additive only**: object recursion, no scalar overwrite, no array overwrite. (This op is distinct from the jq `*` semantics used internally by plan-builder for `package.json.tmpl` merging — that's not exposed as an op.) |
| `claude_settings_merge`  | Specialized: per-field merge of `.claude/settings.json` (see §8). Carries `additions: { permissions, hooks, enabledPlugins, scalars }`. Optional: `pre_state_hash` (sha256 of user's existing `.claude/settings.json` at diagnose time; executor verifies and aborts with `PRE_STATE_HASH_MISMATCH` on drift, mirroring `write_file` and `gitignore_merge`). Plan-builder MUST emit `pre_state_hash` whenever the user has a pre-existing `.claude/settings.json`. |
| `gitignore_merge`        | Specialized: append-or-replace janus's lines inside a delimited block in `.gitignore`. Required: `lines: string[]` (order is fixed by plan-builder — same order as appears in janus's `_shared/.gitignore` source — and is part of the determinism contract). Optional: `pre_state_hash` (sha256 of the user's existing `.gitignore` at diagnose time; executor verifies and aborts with `PRE_STATE_HASH_MISMATCH` on drift, mirroring `write_file`). Block markers fixed: `# --- janus baseline (managed by janus retrofit; do not edit) ---` / `# --- end janus baseline ---`. Idempotent: replaces block body if both markers found in order, otherwise appends with one blank line separator. **Malformed-marker handling:** if exactly one of the two markers is present, OR markers appear in reverse order, OR markers appear more than once, abort step with `GITIGNORE_BLOCK_MALFORMED` and instruct the user to clean up by hand. Preserves all user content outside the block. Used only when target `.gitignore` already exists; if absent, plan-builder emits a plain `write_file` op instead. |
| `shell`                  | Run a whitelisted command. **Whitelist (closed, with per-entry behavior flags):** (a) `pnpm install` — must succeed; (b) `pnpm dedupe` — must succeed; (c) `git config --unset core.hooksPath` — exit code ignored (no-op if key absent); (d) `find .git/hooks -type f -not -name "*.sample" -delete` — exit code ignored (no-op if dir empty). The four entries above are the **only** strings the executor will accept (no argv variations). **`commit_paths` field is required at the step level** — executor stages only those paths after the command runs; any other modified files trigger `EXTRANEOUS_FILE_MODIFICATIONS`. (`git config` and `find` operate on `.git/`, which git itself doesn't track, so they produce no `commit_paths`.) Executor refuses any `shell` op whose `command` is not on the whitelist, even if the JSON parses. |

**Step-level fields:**

- `commit_paths: string[]` — paths the executor will `git add` for this step's commit. Used to detect extraneous changes.
- `preconditions` are AND-combined; if any fails, the step is **skipped** (idempotency).

## 8. `.claude/` merge rules

**`.claude/settings.json`** — `claude_settings_merge` op. Per-field rules (no generic deep-merge fallback):

| Field                                  | Merge rule                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `permissions.allow`, `permissions.deny`| Append janus's entries that aren't string-identical to any existing entry. Don't try to detect glob coverage. Emit `SETTINGS_PERMISSION_REDUNDANT` warning if both a broad and narrower entry end up present after merge.        |
| `hooks.<event>` (array of objects)     | For each janus entry, look for an existing entry whose **`(matcher_or_empty, hook command basename)` pair matches** (where `matcher_or_empty` is `entry.matcher ?? ""` — many janus hooks like `WorktreeCreate`, `WorktreeRemove`, `SessionEnd` have no matcher field; treat absence as empty string). If absent, append. If present and command identical → no-op. If present and command differs → emit `SETTINGS_HOOK_CONFLICT` warning, keep user's. |
| `enabledPlugins` (object)              | Shallow merge: union of keys. On key conflict, **janus wins**. Emit warning per overridden key. (Source of janus's plugin set: `pluginSet` from §5b.) |
| `model`, `theme`, `cleanupPeriodDays`, other top-level scalars | If user has set the field, **preserve user's value** and emit `SETTINGS_SCALAR_CONFLICT` warning. If unset, write janus default.       |
| Top-level fields janus doesn't ship    | Untouched.                                                                                                                   |

The canonical "what janus ships in settings.json" is `SETTINGS_BASE` in `scripts/scaffold.sh` (lines 354–426). plan-builder reuses the same construction logic — slot values flow into `OTEL_RESOURCE_ATTRIBUTES`; pluginSet flows into `enabledPlugins`.

**Slot interpolation safety rule (normative):** Only slots that pass a §5a regex validation rule MAY be interpolated into `claude_settings_merge` payload string positions. v0.1 interpolates only `workload` (matches `^[a-z][a-z0-9]{2,11}$`, so jq/JSON injection is impossible). Free-form slots like `description` MUST NOT appear in any settings.json content the plan-builder constructs. This is a closed allowlist, not a deny-list — adding a new slot to the interpolation set requires updating both this rule and the slot's validation rule in §5a.

**`CLAUDE.md`** — never merged.

- If existing `CLAUDE.md` is present: rename to `CLAUDE.pre-janus.md`, write janus's template (rendered via `mo`), then insert the literal line `@CLAUDE.pre-janus.md\n` at byte offset corresponding to immediately-after the first `@AGENTS.md\n` line. The resulting head of `CLAUDE.md` is exactly: `@AGENTS.md\n@CLAUDE.pre-janus.md\n\n## Claude-specific\n…`. (Two `@`-imports stacked with no blank line between, then the existing template body resumes after one blank line.) User's prose still loads, AGENTS conventions load first.
- **Plan-builder safeguard:** if the rendered janus `CLAUDE.md` does not begin with the literal bytes `@AGENTS.md\n`, plan-builder aborts with `CLAUDE_TEMPLATE_UNEXPECTED_HEAD`. Cheap insurance against silent breakage if a future janus version reorganizes its template head.
- **Why `CLAUDE.pre-janus.md`:** `CLAUDE.local.md` is conventionally git-ignored by Claude Code; snapshot is meant to *preserve* user intent in version control.
- If `CLAUDE.pre-janus.md` already exists at retrofit time: abort step with `CLAUDE_PRE_JANUS_EXISTS`; user must rename or delete first.
- Plan-builder writes the snapshot target path as `claude_md_snapshot.target_path` in the step JSON for auditability.

**Skills, hooks** — overlay-with-replace:

- Janus is the source of truth for any filename it ships. On collision, janus wins (rationale: shipped artifacts are versioned, like a package upgrade).
- User-only files preserved untouched.
- `WARN_OVERWRITE_USER_KIT` per overwrite.
- File mode preserved per the rendered overlay tree (hooks: `0755`).

## 9. Executor

Loop over plan steps. Per step:

1. Evaluate `preconditions`. If any fail, **skip the step** (record as `skipped`).
2. For each operation with `pre_state_hash`: read file, compute SHA-256, abort step if mismatch (`PRE_STATE_HASH_MISMATCH`).
3. Execute operations in order. Each op fully applied or throws.
4. Compute actual modified paths via `git status --porcelain` (which already filters per `.gitignore`); compare against `step.commit_paths`. Any extra path → abort `EXTRANEOUS_FILE_MODIFICATIONS`. **Ops that touch `.git/` (`shell` whitelist entries (c) and (d) — `git config --unset core.hooksPath`, `find .git/hooks ...`) are exempt from the check by definition: git doesn't track `.git/`, so `git status` cannot see them. Ops that touch `node_modules/` rely on `.gitignore` (already in place from the earlier `apply-shared-overlay/root-dotfiles` step) to keep `git status` clean.**
5. `git add` the paths in `commit_paths`, then `git commit -m <step.commit_message>`. **No `--no-verify`.** If a commit-msg hook fails, abort and print the hook output.

**On abort:**

- Print which step failed, error code, SHA of last successful commit, `git reset --hard <sha>` hint.
- **Do not attempt rollback.** Telling the user explicitly is honest.

**`pnpm install` failure (`install-deps` step):**

- The `package.json` write happens in `apply-shared-overlay/root-configs` (already committed). The `install-deps` step's commit (which contains `pnpm-lock.yaml` and any side effects) hasn't been made when `pnpm install` fails.
- Executor aborts; lockfile and `node_modules/` may be left dirty in the working tree.
- User options: fix underlying issue (peer dep, registry auth, network) and re-run retrofit on a fresh `--branch` (idempotency skips already-applied steps); or `git reset --hard` + clean `node_modules/` to discard.
- `INSTALL_DEPS_MAY_FAIL` warning emitted in plan whenever the step is present.

**After all steps complete:**

6. Write `.janus.json`.
7. `git add .janus.json && git commit -m "chore: write janus marker"`.
8. Print summary:

```
✓ Retrofit complete on branch janus/retrofit (12 commits, 5 warnings)

Next steps:
  git push -u origin janus/retrofit
  gh pr create --base staging   # janus convention: feature PRs target staging, not main
```

The `janus/<...>` branch name is a deliberate exception to the `feat/`/`fix/`/`chore/` naming in `docs/conventions/git-workflow.md`. Tooling-driven, not author-driven; the `janus/` prefix makes origin obvious.

## 10. State tracking — `.janus.json`

Lives at the repo root. Committed to git. Validated against `src/retrofit/schema/marker.schema.json` at diagnose pre-flight #3.

```jsonc
{
  "schema_version": "1",
  "janus_version": "0.1.0",
  "archetype": "backend-functions",
  "applied_at": "2026-05-04T15:42:00Z",
  "applied_steps": ["displace-eslint", "displace-prettier", "...", "write-marker"],
  "skipped_steps": [],
  "slots": { /* full SlotMap from §5a */ },
  "plugins": ["frontend-design@claude-plugins-official", "playwright@claude-plugins-official"],
  "shared_overlay_version": "0.1.0",
  "archetype_overlay_version": "0.1.0"
}
```

**Why at repo root:** discoverability — same logic as `.nvmrc`. Code reviewers see "this repo was retrofitted at v0.1.0" immediately.

**How re-runs work:** subsequent `diagnose` reads `.janus.json`, populates `slots` and `plugins` from it (no re-prompt unless `--slot` / `--plugin` overrides), produces an update plan. v0.1: same code path as fresh plan generation — idempotent step preconditions naturally skip already-applied work.

`shared_overlay_version` and `archetype_overlay_version` are written but not yet *read* by v0.1 — forward-compat input for future drift detection and update-only step selection.

## 11. CLI surface

```
janus diagnose --archetype <name> [--out <path>] [--slot key=value ...] [--plugin name@source ...] [--no-plugin name ...] [--non-interactive]
  - --out default: ./.janus-retrofit.json
  - --non-interactive: fail if any required slot or plugin can't be resolved without prompting
  - Stdout: human summary (see below)
  - Exit 0 if plan generated (zero or more steps)
  - Exit 1 on pre-flight failure
  - Exit 2 on internal error

janus retrofit --plan <path> [--branch <name>] [--dry-run] [--no-remote-check]
  - --branch default: 'janus/retrofit'; if taken and not overridden, search -2..-99 and exit with suggestion
  - --dry-run: run **all** pre-flight checks (#9–#16, including network ls-remote unless --no-remote-check), then print a per-step summary (id, title, op count, expected commit_paths), and exit. Does NOT execute any operations and does NOT touch the working tree. Useful for validating a hand-edited plan before applying.
  - --no-remote-check: skip `git ls-remote` for branch-existence (local-only check); useful offline
  - Exit 0 on success
  - Exit 1 on pre-flight failure
  - Exit 2 on mid-execution failure (prints last-good SHA + suggested git reset command)
  - Exit 3 on internal error
```

**Diagnose stdout summary (after writing JSON):**

```
janus diagnose v0.1.0 — backend-functions archetype

Plan: 12 steps (3 displace-tools, 4 apply-overlay, 4 merge-claude-kit, 1 install-deps)
Slots: workload=foo, archetype=backend-functions, github_org=pantheon-tech, author=Daniel Smith <daniel@skipper.kiwi>, node=24, region=australiaeast
Plugins: frontend-design, playwright

Warnings: 5
  - UNKNOWN_TOOL: lint-staged detected; not migrated (package.json:devDependencies.lint-staged)
  - WORKFLOW_REFERENCES_DISPLACED_TOOL: .github/workflows/qa.yml runs `npm ci` and `eslint`
  - MODULE_TYPE_CHANGE: package.json type will change from 'commonjs' to 'module'
  - PKG_FIELDS_OVERWRITTEN: package.json:scripts.test ('jest' → 'vitest run')
  - WARN_OVERWRITE_USER_KIT: .claude/skills/foo.md (sha256:jkl3def…)

Files to be overwritten (3):
  README.md                    (sha256:ghi9abc… → janus template)
  .claude/skills/foo.md        (sha256:jkl3def… → janus version)
  .claude/hooks/session.sh     (sha256:mno6ghi… → janus version)

Files to be merged (3, additive — user content preserved):
  package.json                 (sha256:abc1234… → jq deep-merge over user)
  .claude/settings.json        (sha256:def5678… → claude_settings_merge per §8 rules)
  .gitignore                   (sha256:pqr0xyz… → janus baseline block appended/replaced)

Plan written to .janus-retrofit.json
Next: review the plan, then run `janus retrofit --plan .janus-retrofit.json`
```

Both subcommands surface in `janus --help`. Existing subcommands (`scaffold`, `bootstrap`) untouched.

## 12. Testing strategy

**Unit:**

- Analyzer: ~12 fixture repos under `tests/fixtures/repos/<name>/` (greenfield, eslint-only, prettier+husky, pnpm-workspace, npm-with-jest, already-janus, repo-with-submodule, repo-with-symlink, repo-with-user-modified-skill, repo-without-package-json, monorepo, commonjs-repo). Assert on `RepoSnapshot` shape.
- Slot-resolver: assert correct values pulled from each source; assert prompt-only-for-missing; assert validation rejects bad auto-sourced values and falls back to prompt.
- Plugin-resolver: assert auto-detect against fixtures; assert `--plugin` and `--no-plugin` interactions.
- Plan-builder: pure function tests. Given (snapshot, slots, plugins, archetype, version), assert plan matches a golden JSON file (snapshot tests). **Per-archetype × per-fixture-shape determinism test**: hash `payload`, assert byte-identical across two runs.
- Operation handlers: each op type tested in isolation against a temp directory. Includes `chmod` op, `pre_state_hash` mismatch, `EXTRANEOUS_FILE_MODIFICATIONS` detection.

**Integration:**

- Per-archetype end-to-end: pre-janus fixture → `diagnose --slot ... --plugin ...` (non-interactive) → `retrofit` → assert resulting tree matches a golden snapshot, all expected commits exist with right messages and right modes (hooks 0755).
- Re-run `diagnose` after `retrofit`: assert plan steps are all skipped or empty (idempotency).
- Pre-flight tests: dirty tree, detached HEAD, existing target branch (and -2..-99 collision exhaustion), mismatched schema_version, repo-with-submodule, repo-with-symlink, case-collision, monorepo-root invoked from workspace member — each must exit non-zero with the right error code.
- `WARN_OVERWRITE_USER_KIT` test: fixture has user-modified `.claude/skills/foo.md`; warning surfaces; retrofit overwrites (v0.1 behavior).
- `MODULE_TYPE_CHANGE` test: commonjs fixture; warning surfaces; retrofit proceeds.
- `commit-msg` hook collision test: fixture has pre-existing commitlint config that disallows `chore:` (artificial — verifies executor surfaces the failure).
- `pre_state_hash` TOCTOU test: between diagnose and retrofit, modify a `present_differs` file; retrofit must abort with `PRE_STATE_HASH_MISMATCH`.
- **Step ordering test**: assert `apply-shared-overlay/root-dotfiles` (which writes `.gitignore`) runs strictly before `install-deps` (which produces `node_modules/`). If the alphabetical ordering rule is later changed, this test surfaces the regression — without `.gitignore` already in place, `install-deps` would trip the `EXTRANEOUS_FILE_MODIFICATIONS` check on `node_modules/.modules.yaml` etc.

**Manual:**

- Dogfood on at least two real pre-janus repos before declaring v0.1 done. Record any `unrecognized_tools` warnings as future work.

Tests run as part of `pnpm test`.

## 13. Out of scope (for v0.1)

- Archetype auto-detection.
- Source code refactoring / file movement.
- Migrating tools outside the displaced-tools list (rome, dprint, lint-staged, etc.).
- `janus update` as a distinct subcommand.
- Drift detection for janus-shipped files modified by the user.
- Automatic PR creation.
- Automatic rollback on failure.
- Per-package retrofit inside a monorepo.
- Submodules, symlinks within target paths, case-insensitive FS collisions.
- `.claude/agents/` and `.claude/commands/` overlays — janus ships no files in those dirs in v0.1. Future janus versions adding them activate the corresponding overlay step automatically (the `apply-shared-overlay`/`apply-archetype-overlay` enumeration is data-driven, not hardcoded).
- Hard refusal on `MODULE_TYPE_CHANGE` (warning only in v0.1).
- Slot-value redaction in plan output (`author_email` is committed in plan and `.janus.json` — accept this; not v0.1's concern).
- Concurrent retrofits in same repo — caller must serialize.
- Windows.

## 14. Risks & open questions

- **Plan format stability.** `schema_version` versioned independently of `janus_version`. v0.2 plans with new op types are refused by v0.1 retrofit (hard match on `schema_version`).
- **`pnpm install` non-determinism.** Lockfile content depends on registry state at retrofit time. Acceptable.
- **`.claude/settings.json` scalar conflicts.** Verify in dogfooding that warning + preserve-user is right; consider promoting to hard-stop if confusion arises.
- **Workspace repos.** v0.1 limits `monorepo-root` to root setup. Pre-flight check #8 refuses diagnose when invoked from a workspace member.
- **CI workflows.** v0.1 emits `WORKFLOW_REFERENCES_DISPLACED_TOOL` for non-janus-named workflows; janus-named workflows are overlay-replaced with `WARN_OVERWRITE_USER_KIT`.
- **`unrecognized_tools` allowlist drift.** Lives in `docs/conventions/dependencies.md` under a documented heading.
- **Slot resolution ergonomics.** First-time retrofit may need 4–6 prompts; subsequent reuse `.janus.json`. CI uses `--slot` exclusively.
- **Plugin resolution false positives.** Auto-detect from a fixed list of file globs. False positives possible (e.g., a Python script committed for tooling triggers `pyright-lsp`). User can `--no-plugin` to suppress; the prompt step (when interactive) is the safety net.
- **Pre-existing scaffold.sh `<%owner%>` orphan.** `templates/_shared/docs/architecture.md.tmpl` references `<%owner%>` but scaffold.sh never exports it (rendered output is empty). Retrofit inherits the bug verbatim — slot-resolver does not invent a value. Filed as a separate janus issue; fix is out of scope for v0.1 retrofit (a fix in scaffold.sh would also benefit retrofit at no extra cost).

## 15. Implementation sketch (informational, not normative)

```
src/retrofit/
├── analyzer/
│   ├── index.ts            — entry: (repoRoot, archetype) → RepoSnapshot
│   ├── package-manager.ts
│   ├── displaced-tools.ts
│   ├── claude-kit.ts
│   ├── plugin-evidence.ts
│   ├── baseline-diff.ts    — uses overlay-tree from plan-builder
│   └── git-state.ts
├── resolvers/
│   ├── slots.ts            — entry: (snapshot, archetype, priorMarker, cliOverrides) → SlotMap
│   ├── slot-validation.ts  — regex rules from §5a
│   ├── plugins.ts          — entry: (snapshot, priorMarker, cliOverrides) → PluginSet
│   └── prompt.ts           — interactive prompts; gated by --non-interactive
├── plan-builder/
│   ├── index.ts            — entry: (snapshot, slotMap, pluginSet, archetype, version) → Plan
│   ├── overlay-tree.ts     — mirrors scaffold.sh: walk shared, walk archetype, jq merge package.json, preserve mode
│   ├── steps/
│   │   ├── displace-tools.ts
│   │   ├── apply-shared-overlay.ts
│   │   ├── apply-archetype-overlay.ts
│   │   ├── merge-claude-kit.ts
│   │   └── install-deps.ts
│   └── determinism.ts      — sort steps, sort warnings, hash payload
├── executor/
│   ├── index.ts            — entry: (plan, repoRoot, branch) → RunReport
│   ├── preflight.ts
│   ├── operations/
│   │   ├── write-file.ts   — handles mode + pre_state_hash check
│   │   ├── chmod.ts
│   │   ├── json-set.ts
│   │   ├── claude-settings-merge.ts
│   │   └── shell.ts        — refuses non-whitelisted commands
│   └── git.ts
└── schema/
    ├── plan.schema.json
    └── marker.schema.json
```

CLI subcommands in `bin/janus.js` import from `src/retrofit/` and dispatch.
