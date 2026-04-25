# Code Review 02: scaffold.sh + Smoke Test

**Reviewer**: Claude (Sonnet 4.6)
**Date**: 2026-04-25
**Scope**: `scripts/scaffold.sh`, `tests/scaffold-smoke-test.sh`, `.github/workflows/janus-ci.yml`
**Status**: 10/10 smoke test currently passing

---

## Summary

- **One confirmed bug** (P1): `monorepo-root` ships the verbatim `packages/example/package.json` (`@workspace/example`) instead of the rendered template version (`@<workload>/example`) because the `find` filter at `scaffold.sh:289` matches `package.json.tmpl` by filename at any depth, silently killing the nested template.
- **Two P1 coverage gaps**: the `frontend-vite-react` and `backend-functions` archetypes get no deep verification (typecheck/lint/test/build), despite having the most moving parts (Vite, JSX, Tailwind v4, MSAL, Azure Functions toolchain).
- **One silent failure risk** (P2): `pnpm install --lockfile-only || true` at the end of scaffold swallows lockfile generation failures, leaving the project with no lockfile and a guaranteed broken first CI push.
- **Fragile predicate** (P2): `is_excluded 'infra/'` at line 277 passes a pattern string as a path argument to the predicate, which happens to work for current `.exclude` files but is semantically wrong and could silently break on future pattern changes.
- **Prompt-alignment fragility** (P2): adding a new prompt to scaffold.sh silently shifts all smoke-test answers with no defense.

---

## Bugs / Risks Found

### BUG-1 (P1): monorepo-root `packages/example/package.json.tmpl` is never rendered

**File**: `scripts/scaffold.sh:289`, `templates/monorepo-root/packages/example/`

Step 2b.iii iterates the archetype directory with:
```bash
find . -type f \
  ! -name '.env.example' \
  ! -name 'package.json.tmpl' \
  ...
```

`-name 'package.json.tmpl'` matches by **basename at any depth**. This correctly excludes the root-level `package.json.tmpl` (the jq merge overlay) but also silently excludes `packages/example/package.json.tmpl`. The result is:

- `packages/example/package.json.tmpl` (containing `"name": "@<%workload%>/example"`) — **never rendered, dead code**
- `packages/example/package.json` (containing `"name": "@workspace/example"`) — **shipped verbatim, always wrong**

Every scaffolded monorepo will have the wrong example package name. The smoke test does not assert the package `name` field, so this passes undetected.

**Fix**: Change `! -name 'package.json.tmpl'` to `! -path './package.json.tmpl'` so only the archetype's root overlay is excluded. Delete the redundant verbatim `packages/example/package.json`.

---

### RISK-1 (P1): frontend-vite-react archetype has no deep verification

**File**: `tests/scaffold-smoke-test.sh:218-232`

Archetype 3 (frontend-vite-react) only runs `verify_project` (base structural check). There is no `verify_frontend()` equivalent. This archetype has the largest surface area: Vite 7.3, React 19, Tailwind v4 (Vite plugin), MSAL, vitest+jsdom. A broken Vite config, missing Tailwind plugin, or JSX transform failure would all pass the smoke test.

**Fix**: Add a `verify_frontend_react()` verifier that runs `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. Call it for arch 3 in the drive loop.

---

### RISK-2 (P1): backend-functions archetype has no deep verification

**File**: `tests/scaffold-smoke-test.sh:218-232`

Archetype 1 (backend-functions) similarly gets only base structural checking. The Azure Functions v4 scaffold has its own toolchain (`@azure/functions`, `func` CLI, `tsup`). A broken `host.json`, wrong module format, or missing `extensionBundle` would not be caught.

**Fix**: Add a `verify_backend_functions()` verifier that at minimum runs `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. The `func start` step requires the Azure Functions Core Tools and is not suitable for CI, so skip the runtime check.

---

### RISK-3 (P2): Lockfile generation failure silently swallowed

**File**: `scripts/scaffold.sh:361-363`

```bash
pnpm install --lockfile-only --silent 2>/dev/null || \
  pnpm install --lockfile-only || true
```

The final `|| true` means a lockfile generation failure does not abort the scaffold. The user gets a project with no `pnpm-lock.yaml`. Their first CI push (which runs `pnpm install --frozen-lockfile`) will fail immediately with no clear error attribution to the scaffold step.

The smoke test re-runs `pnpm install --lockfile-only` in `verify_project` and would catch this for archetypes 1-6, but a real user running the scaffold and not running the smoke test gets a broken project silently.

**Fix**: Drop `|| true`. If lockfile generation fails, print a warning and let the script exit non-zero. The user should know.

---

### RISK-4 (P2): `is_excluded 'infra/'` passes a pattern string as a path argument

**File**: `scripts/scaffold.sh:277`

```bash
if is_excluded 'infra/'; then
```

`is_excluded` is designed to test whether a *relative file path* is excluded by the `.exclude` patterns. Calling it with the string `'infra/'` works by accident: the directory-pattern branch checks `[[ "infra/" == "infra/"* ]]` which is true, but semantically `is_excluded` is being abused as a predicate for "does the archetype exclude the infra directory?" rather than "is this path excluded?". If a future `.exclude` entry changes to `infra` (no trailing slash), the exact-match branch would test `[[ "infra/" == "infra" ]]` — false — and deploy scripts would not be pruned even though infra is excluded.

**Fix**: Replace with an explicit check:
```bash
if [ -f "${ARCH_DIR}/.exclude" ] && grep -qxF 'infra/' "${ARCH_DIR}/.exclude"; then
```

---

### RISK-5 (P2): Prompt-answer alignment in smoke test is undeclared and fragile

**File**: `tests/scaffold-smoke-test.sh:35-37`

The `run_scaffold` function feeds a fixed sequence of 14 newline-separated answers to scaffold.sh via `printf`. The comment lists the mapping (prompts 1-14). If scaffold.sh adds, removes, or reorders a prompt, the smoke test silently feeds wrong answers to subsequent prompts. There is no count guard or assertion.

For example, if a new prompt is inserted between position 7 and 8, the target directory receives `$arch_num` (a digit) and the archetype receives `n` — the scaffold will fail with "invalid choice" or silently scaffold the wrong archetype.

**Fix**: Add a count assertion. Export a `JANUS_PROMPT_COUNT=14` env var from scaffold.sh (incremented on each `read -r -p` and `ask_yn`) and assert it matches in the smoke test. Alternatively, document the fragility with a prominent "SYNC WITH scaffold.sh" comment and include a count in the test comment.

---

### RISK-6 (P2): `verify_monorepo` does not assert the example package name

**File**: `tests/scaffold-smoke-test.sh:182-193`

The monorepo verifier checks that `packages/example/package.json` *exists* but does not check its `name` field. BUG-1 above shipped with the smoke test passing. A one-liner would have caught it:

```bash
jq -e '.name | startswith("@testapp/")' "$target/packages/example/package.json" \
  >/dev/null 2>&1 || errors+=("packages/example has wrong package name")
```

---

### NOTE-1: Smoke test YAML checker relies on ambient PyYAML

**File**: `tests/scaffold-smoke-test.sh:80-84`

```bash
python3 -c "import sys, yaml; yaml.safe_load(open(sys.argv[1]))" "$f"
```

PyYAML is not declared as a dependency and is not installed in the `scaffold-smoke` CI job setup steps. It is present on `ubuntu-latest` runners today but could silently become absent. The workflow YAML check would then report false negatives (non-failing).

**Fix**: Either install PyYAML explicitly (`pip install pyyaml`) or switch to `yq` (available as a pre-installed tool on ubuntu-latest runners) or use `python3 -c "import json, sys; ..."` after converting with `python3 -m json.tool`.

---

### NOTE-2: Latent unsubstituted-slot blind spot for `{{ }}` style slots

**File**: `tests/scaffold-smoke-test.sh:46-52`

The unsubstituted-slot grep checks only for `<%...%>` tokens (post-delimiter-swap style). If a `.tmpl` file ever uses `{{slotname}}` (default mo style) for an undefined variable, mo emits an empty string and the test passes. No current template has this problem, but it is a latent verifier gap.

---

## Test Coverage Gaps

| Gap | Archetypes affected | Current detection |
|-----|---------------------|-------------------|
| No typecheck/lint/test/build | 1 (backend-functions), 3 (frontend-vite-react), 4 (generic-ts), 5 (types-package) | None |
| Package name field not asserted | 7 (monorepo-root) | None |
| No test for scaffold-into-non-empty-dir | All | None |
| No test for bad workload slug (`ab`, `1bad`, etc.) | All | None |
| No test for target path with spaces | All | None |
| Archetype-specific workflow templates not linted | generic-ts, mcp-server (release.yml.tmpl) | None — `workflows-lint` only covers `templates/_shared/.github/workflows/` |

---

## Severity Table

| ID | Finding | Severity | File:Line |
|----|---------|----------|-----------|
| BUG-1 | monorepo package name not rendered; `packages/example/package.json.tmpl` dead | **P1** | scaffold.sh:289, monorepo-root/packages/example/ |
| RISK-1 | No deep verify for frontend-vite-react (arch 3) | **P1** | smoke-test.sh:218-232 |
| RISK-2 | No deep verify for backend-functions (arch 1) | **P1** | smoke-test.sh:218-232 |
| RISK-3 | Lockfile failure silently swallowed with `|| true` | **P2** | scaffold.sh:361-363 |
| RISK-4 | `is_excluded 'infra/'` semantic abuse of path predicate | **P2** | scaffold.sh:277 |
| RISK-5 | Prompt-answer alignment fragile, no count guard | **P2** | smoke-test.sh:35-37 |
| RISK-6 | `verify_monorepo` does not assert package name field | **P2** | smoke-test.sh:182-193 |
| NOTE-1 | YAML check relies on ambient PyYAML, undeclared dep | **P3** | smoke-test.sh:80-84 |
| NOTE-2 | Unsubstituted-slot grep misses `{{var}}` style silently | **P3** | smoke-test.sh:46-52 |

**Totals: 3 × P1, 4 × P2, 2 × P3**

---

## Recommended Fixes (Priority Order)

1. **BUG-1**: `scaffold.sh:289` — change `! -name 'package.json.tmpl'` to `! -path './package.json.tmpl'`. Delete `templates/monorepo-root/packages/example/package.json` (verbatim). Add name assertion to `verify_monorepo`.

2. **RISK-1**: Add `verify_frontend_react()` to smoke test covering `pnpm install && typecheck && lint && test && build`. Confirm `dist/` or `index.html` outputs exist. Call for arch 3.

3. **RISK-2**: Add `verify_backend_functions()` to smoke test covering `pnpm install && typecheck && lint && test && build`. Call for arch 1.

4. **RISK-3**: Drop `|| true` from `pnpm install --lockfile-only` at `scaffold.sh:363`. Print a warning message on failure and exit non-zero.

5. **RISK-4**: Replace `is_excluded 'infra/'` with `grep -qxF 'infra/' "${ARCH_DIR}/.exclude" 2>/dev/null`.

6. **RISK-5**: Add a `JANUS_PROMPT_COUNT` sentinel or a prominent count comment in `run_scaffold` that must be updated when prompts change.

7. **NOTE-1**: Add `pip install pyyaml -q` step to the `scaffold-smoke` CI job, or switch to a `yq`-based YAML validator.

8. **Coverage gap**: Extend `workflows-lint` step to also render and lint archetype-specific workflow templates (`templates/*/\.github/workflows/*.yml.tmpl`).
