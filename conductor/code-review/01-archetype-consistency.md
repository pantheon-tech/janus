# Archetype Consistency Review — janus templates/

Reviewed: 2026-04-25
Branch: main
Reviewer: Claude Sonnet 4.6

---

## Summary

1. **Three archetypes (backend-functions, backend-container-app, frontend-vite-react) have no `.exclude` file**, causing `_shared/src/index.ts` (the `greet()` stub) and `_shared/tests/index.test.ts` (tests for `greet()`) to land in every scaffolded project. In a React frontend or Functions project this is dead code noise that passes tests and confuses developers.

2. **`LICENSE`, `SECURITY.md`, and `docs/architecture.md` are not `.tmpl` files**, so scaffold.sh step 1 copies them verbatim — every scaffolded project ships `Copyright (c) {{year}} {{author}}` literally in its LICENSE. The placeholders are never substituted.

3. **Dockerfile pins `pnpm@latest` instead of the locked version (`pnpm@10.33.2`)**, meaning the Docker build can silently use a different pnpm than the lockfile was generated with, causing `pnpm install --frozen-lockfile` to fail under minor pnpm format changes.

4. **`frontend-vite-react/README.md` documents MSAL React as v3 / MSAL Browser as v5.1.0**, but `package.json.tmpl` pins `@azure/msal-react: ~5.3.0` and `@azure/msal-browser: ~5.8.0`. v3 and v5 of msal-react are different major versions with breaking changes.

5. **`templates/README.md` status table marks all six new archetypes as "stub"** despite them being fully implemented and smoke-tested. The status column is actively misleading for anyone onboarding to janus.

---

## Per-Archetype Audit

### generic-ts (reference pattern)

**Mustache header:** Present (`{{=<% %>=}}`). All templates checked.

**package.json.tmpl:** Correct overlay structure — `scripts`, `devDependencies` only; no `name`, `version`, `engines` (inherited from `_shared`). tsx `~4.21.0`, tsup `~8.5.1`.

**AGENTS.md.tmpl:** Eight sections — Overview, Tech Stack, Commands, Branching, Structure, Critical Context, Design Decisions, Known Issues. This is the reference to match.

**.exclude:** Excludes `infra/`, `deploy.yml.tmpl`, `infra-preview.yml.tmpl`, `claude-autofix.yml.tmpl`. Correct for a no-cloud archetype.

**README.md:** Clear structure — when to pick, what it ships, status ("Ready"), directory tree, promotion path. Strong reference for other archetype READMEs.

**Verdict:** Clean. No issues.

---

### backend-functions

**Mustache header:** Present in `package.json.tmpl` and `AGENTS.md.tmpl`.

**package.json.tmpl:** Correct overlay (scripts + deps only). Adds `@azure/functions ~4.14.0`. Dev scripts (`dev`, `build`, `start`) are correct for Functions v4. tsup/tsx versions match reference.

**AGENTS.md.tmpl:** Eight sections matching reference. Critical Context is dense and accurate — `local.settings.json`, Programming Model v4 constraints, handler isolation pattern all called out. Good.

**`.exclude`:** **Missing entirely.** This archetype has no `.exclude` file, so `_shared/src/index.ts` (exports `greet()`) and `_shared/tests/index.test.ts` (imports from `../src/index.js`) will ship into every scaffolded Azure Functions project alongside `src/functions/health.ts` and `tests/health.test.ts`. The greet test passes (the greet file is there) but is meaningless cargo. The `src/index.ts` is an open invitation for developers to put code in the wrong place.

**README.md:** "stub" status in `templates/README.md` contradicts actual ready state. Per-archetype README.md itself is thorough.

**local.settings.json.example:** `FUNCTIONS_NODE_RUNTIME: "22"` but `package.json.tmpl` `engines.node >= 24`. Inconsistent: the runtime setting should match the project's Node target (24).

**Verdict:** One P0 (missing .exclude), one P2 (Node version mismatch).

---

### backend-container-app

**Mustache header:** Present in `package.json.tmpl` and `AGENTS.md.tmpl`.

**package.json.tmpl:** Sets `"type": "commonjs"` and `"main": "dist/server.js"` — overrides `_shared`'s `"type": "module"`. Justified: the entry point uses `require.main === module` (a CJS idiom), and the archetype's own `commitlint.config.js` explicitly documents this choice. The `jq` deep-merge correctly overrides the field. tsup/tsx versions match reference.

**AGENTS.md.tmpl:** Eight sections matching reference. Critical Context covers SIGTERM graceful shutdown, `noServer: true` WebSocket pattern, pino structured logging, port environment variable — all non-obvious and correct. Good.

**`.exclude`:** **Missing entirely.** Same problem as backend-functions: `_shared/src/index.ts` and `_shared/tests/index.test.ts` will land alongside `src/server.ts` and `tests/server.test.ts`. In this case there is an additional wrinkle: `server.ts` exports `app`, `server`, and `wss` but has no default export, while `src/index.ts` exports `greet`. Both coexist, both typecheck, both pass CI. But `src/index.ts` is dead noise.

**commitlint.config.js:** Correctly uses `module.exports` (CJS syntax) because `"type": "commonjs"`. Includes an explanatory comment. This is the right approach and the comment should be kept.

**Dockerfile:** Multi-stage, non-root user, `HEALTHCHECK`, graceful shutdown via `CMD`. Well structured.

**Dockerfile — pnpm version mismatch:** `corepack prepare pnpm@latest --activate` instead of pinning to `pnpm@10.33.2` (the version in `_shared/package.json.tmpl`'s `packageManager` field). If corepack resolves to pnpm 10.34.x or later with a lockfile format bump, `pnpm install --frozen-lockfile` will fail in the Docker build layer. Fix: `corepack prepare pnpm@10.33.2 --activate`.

**README.md:** Thorough. Structure matches generic-ts pattern. Status ("Ready") visible only in the templates/README.md row which incorrectly says "stub".

**Verdict:** One P0 (missing .exclude), one P1 (Dockerfile pnpm@latest), both in `_shared` sphere.

---

### frontend-vite-react

**Mustache header:** Present in `package.json.tmpl`, `AGENTS.md.tmpl`, `index.html.tmpl`, `App.tsx.tmpl`, `App.test.tsx.tmpl`.

**package.json.tmpl:** Correct overlay structure. React 19.2.0, Vite 7.3.0, Tailwind 4.2.0, Zustand 5.0.5. No `"type"` field override — inherits `"module"` from `_shared`. Correct for a frontend bundled by Vite.

**tsconfig.json.tmpl:** Overrides `_shared/tsconfig.json.tmpl` with `"moduleResolution": "bundler"` and `"jsx": "react-jsx"`. This is correct and contained: only the frontend archetype provides this tsconfig. Other archetypes use NodeNext. The `noEmit: true` is correct — Vite owns the build. The `"types": ["vite/client"]` is appropriate.

**`moduleResolution: bundler` containment:** Verified. This does not leak to any other archetype — each archetype provides its own `tsconfig.json.tmpl` or inherits the shared one. `bundler` is correct for Vite projects and would break server-side archetypes if applied there.

**AGENTS.md.tmpl:** Eight sections. Critical Context covers MSAL build-time config, Tailwind v4 CSS-first, SWA config, TypeScript settings. **MSAL section calls it "MSAL React v3"** while `package.json.tmpl` pins `@azure/msal-react: ~5.3.0`. These are different major versions. v3 was the React adapter for MSAL 2.x; v5.x is the current adapter paired with msal-browser 5.x. The AGENTS.md is wrong and will confuse agents.

**README.md (archetype meta):** MSAL version table says `~5.1.0 / ~3.0.0` but package.json.tmpl says `~5.8.0 / ~5.3.0`. Double discrepancy: wrong in two files simultaneously.

**`.exclude`:** **Missing entirely.** `_shared/src/index.ts` (Node/CJS-style `greet()`) and `_shared/tests/index.test.ts` (imports `../src/index.js`) will land in a React project. The test imports a `.js` extension path that resolves to the greet file — it compiles under `bundler` resolution and passes. It is pure garbage in a React codebase. Additionally, `src/index.ts` conflicts conceptually with `src/main.tsx` as the "real" entry.

**staticwebapp.config.json:** Ships `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. Missing `Content-Security-Policy`. CSP is the most impactful security header for a React SPA; its absence is a gap but requires project-specific configuration, so this is P3 guidance rather than a bug.

**Verdict:** One P0 (missing .exclude), one P1 (MSAL version mismatch across AGENTS.md and README.md vs package.json).

---

### types-package

**Mustache header:** Present in `package.json.tmpl` and `AGENTS.md.tmpl`.

**package.json.tmpl:** Sets `"private": false`, `"main": "dist/index.d.ts"`, `"exports"` with `"types"` condition, `"files": ["dist"]`. Correct for a types-only npm package. `"dev": null` and `"start": null` are used to nullify the inherited `_shared` script stubs. `jq * ` merge with null keys sets those scripts to null, which pnpm treats as absent. Works correctly.

**AGENTS.md.tmpl:** Eight sections matching reference. Critical Context is thorough — no runtime code, dts-bundle-generator, type-level tests, `private: false`, no Azure infra. Good.

**`.exclude`:** Excludes `infra/`, deploy workflows, `tests/index.test.ts`, and `src/index.ts`. Correct — archetype provides its own `src/index.ts` and `tests/types.test-d.ts`, and the shared runtime stubs would conflict.

**vitest.config.ts.tmpl:** Correctly configures `typecheck: { enabled: true, checker: 'tsc', include: ['tests/**/*.test-d.ts'] }`. No jsdom, no coverage. Clean.

**README.md (archetype meta):** Status says **"Stub — scaffold content TODO"** but the archetype is fully implemented. The README contains `@{{github_org}}` in two places using raw `{{...}}` syntax — this is only the META doc (never shipped to projects), so it causes no runtime harm, but it's sloppy and inconsistent with the `<%...%>` style used in `.tmpl` files.

**Verdict:** One P3 (README stub status stale), one P3 (raw `{{github_org}}` in non-shipped META doc).

---

### mcp-server

**Mustache header:** Present in `package.json.tmpl` and `AGENTS.md.tmpl`.

**package.json.tmpl:** Sets `"type": "commonjs"`, `"private": false`, `"bin"` entry. Justified: the shebang entry point (`#!/usr/bin/env node`) requires CJS (the MCP SDK's stdio transport makes stdout writes through the SDK and the shebang file must be CJS-loadable). The `tsup --format cjs --no-dts` is correct — no declaration files needed for a server executable. Zod `~4.0.0` and `@modelcontextprotocol/sdk ~1.29.0` are plausible for April 2026.

**`"type": "commonjs"` justification:** Documented in AGENTS.md Critical Context and in README.md Critical constraints. The commitlint.config.js uses `module.exports` with an explanatory comment. Pattern is consistent with backend-container-app. Both CJS archetypes justify their choice in writing. Acceptable.

**AGENTS.md.tmpl:** Seven sections — **missing "Design Decisions"** compared to the reference eight-section structure. The content about CJS rationale is folded into Critical Context, so information is present but the structural contract with the other archetypes is broken. An AI agent reading AGENTS.md across multiple janus projects will see an inconsistent section structure.

**`.exclude`:** Excludes `infra/`, `deploy.yml.tmpl`, `infra-preview.yml.tmpl`, `claude-autofix.yml.tmpl`. Correct for an npm-published, non-cloud-deployed package.

**Duplicate test files:** `tests/index.test.ts` (stub that overwrites the shared file) AND `tests/server.test.ts` (the real echo tool tests). This is fine — the index.test.ts stub is intentional and overwrites the shared greet test.

**`src/index.ts`:** Uses `.js` import extensions correctly for CJS tsup output. The `echoInputSchema` pattern (pure function + zod schema, registered separately) is a clean, testable design.

**README.md:** No "stub" status. Thorough. The `mcpServers` config example in the README uses `"command": "node"` with an absolute path for local dev and `"command": "<workload>"` for global installs — both correct.

**Verdict:** One P3 (missing Design Decisions section).

---

### monorepo-root

**Mustache header:** Present in `package.json.tmpl` and `AGENTS.md.tmpl`.

**package.json.tmpl:** Workspace-level scripts only — `pnpm -r --parallel dev`, `pnpm -r build`, `pnpm -r test`, `pnpm -r typecheck`, `biome check .`. No `name`, `version`, `engines`, `devDependencies` — these all come from `_shared`. Correct for a workspace root.

**AGENTS.md.tmpl:** Eight sections, but **"Structure" is renamed "Workspace Topology"** and moved to second position (before Tech Stack). While the rename makes semantic sense for a monorepo, it breaks structural consistency with the other six archetypes. Minor drift.

**`.exclude`:** Excludes `infra/`, `deploy.yml.tmpl`, `infra-preview.yml.tmpl`, `src/`, `tests/`. Correct — workspace root has no source of its own. This is the only archetype besides types-package that properly handles the `src/` and `tests/` collision.

**`tsconfig.json` (non-tmpl):** The archetype provides its own `tsconfig.json` (not a `.tmpl`) with `"files": [], "include": [], "exclude": ["node_modules", "packages"]`. This correctly suppresses root-level typechecking (packages typecheck themselves). The file will overwrite the rendered `_shared/tsconfig.json.tmpl` output via scaffold step 2b.iii.

**`packages/example/package.json` (non-tmpl):** A verbatim file with `"name": "@workspace/example"` coexists with `packages/example/package.json.tmpl` which correctly uses `@<%workload%>/example`. The scaffold renders the `.tmpl` (overwriting the non-tmpl), so the hardcoded `@workspace/example` name never ships. But the dead file is confusing and should be deleted — it's an artifact of template development.

**`packages/example/vitest.config.ts` (non-tmpl):** Similarly coexists with no `.tmpl` counterpart. This file has no slot substitution so it doesn't need to be a `.tmpl`, and it will ship as-is. It's minimal and correct (`environment: 'node'`). Fine.

**Verdict:** One P3 (AGENTS.md "Workspace Topology" section rename), one P2 (dead `packages/example/package.json` non-tmpl file).

---

## Cross-Cutting Issues

### XC-1 (P0): Missing `.exclude` files — _shared stub leaks into three archetypes

`_shared/src/index.ts` exports `greet(name: string)` — a hello-world stub. `_shared/tests/index.test.ts` imports and tests it. These are correct and intentional for `generic-ts` (which has no archetype-level `src/`).

The following three archetypes have **no `.exclude` file**, so both files ship into every scaffolded project:

| Archetype | What the shared files collide with |
|---|---|
| `backend-functions` | `src/functions/health.ts`, `tests/health.test.ts` |
| `backend-container-app` | `src/server.ts`, `tests/server.test.ts` |
| `frontend-vite-react` | `src/main.tsx`, `src/App.tsx`, `tests/App.test.tsx` |

The tests pass (both `greet()` and the real test suite), so CI green. But the scaffolded project has `src/index.ts` exporting `greet()` — an obvious footgun for developers who find it and assume it's a real entry point.

**Fix:** Add a `.exclude` file to each of the three archetypes listing:
```
src/index.ts
tests/index.test.ts
```

---

### XC-2 (P1): Non-`.tmpl` shared files ship with unsubstituted `{{ }}` slots

scaffold.sh step 1 copies verbatim every file that does **not** end in `.tmpl`. These `_shared` files contain `{{ }}` placeholders that are never processed by mo:

| File | Unsubstituted slots |
|---|---|
| `_shared/LICENSE` | `{{year}}`, `{{author}}` |
| `_shared/SECURITY.md` | `{{workload}}`, `{{author_email}}` |
| `_shared/docs/architecture.md` | `{{workload}}`, `{{date}}`, `{{owner}}`, `{{description}}` |

Every scaffolded project of every archetype ships `Copyright (c) {{year}} {{author}}` literally on disk. The LICENSE is a legal document — this is not an aesthetic issue.

**Fix:** Rename all three files to `.tmpl` variants and add `{{=<% %>=}}` headers so mo processes them. Or implement a second-pass substitution in scaffold.sh for explicitly listed non-tmpl files.

---

### XC-3 (P1): Dockerfile pins `pnpm@latest` instead of `pnpm@10.33.2`

`backend-container-app/Dockerfile` stage 1 and stage 2 both run:
```
RUN corepack enable && corepack prepare pnpm@latest --activate
```

`_shared/package.json.tmpl` pins `"packageManager": "pnpm@10.33.2"`. A pnpm minor release that changes the lockfile format will cause `pnpm install --frozen-lockfile` to fail in Docker at an unpredictable future date. CI outside Docker uses the pinned version from `packageManager`; Docker does not.

**Fix:** Replace `pnpm@latest` with `pnpm@10.33.2` in both Dockerfile stages (and keep in sync with `packageManager` field going forward).

---

### XC-4 (P1): MSAL version documentation is wrong in two files

`frontend-vite-react/package.json.tmpl` pins:
- `@azure/msal-browser: ~5.8.0`
- `@azure/msal-react: ~5.3.0`

`frontend-vite-react/AGENTS.md.tmpl` (ships to projects) says "MSAL Browser v5 + MSAL React v3". The `frontend-vite-react/README.md` (archetype META) table says `~5.1.0 / ~3.0.0`. The React adapter v3.x is the legacy adapter for MSAL Browser v3.x — a different, older major release series. An agent reading AGENTS.md and trying to follow the v3 docs will be confused and wrong.

**Fix:** Update AGENTS.md.tmpl Tech Stack row to "MSAL Browser v5 + MSAL React v5". Update README.md Stack table to `~5.8.0 / ~5.3.0`.

---

### XC-5 (P2): `parameters.staging.bicepparam.tmpl` / `parameters.prod.bicepparam.tmpl` use default mo `{{...}}` syntax instead of `<%...%>`

All other `.tmpl` files begin with `{{=<% %>=}}` to switch mo's delimiter to `<% %>`. The bicepparam templates do not — they use the default `{{workload}}` / `{{region}}` directly. This works because mo defaults to `{{}}`, but it is inconsistent: a developer editing both a bicepparam and a workflow template will see two different placeholder styles in files that serve the same purpose.

**Fix:** Add `{{=<% %>=}}` to the top of both bicepparam `.tmpl` files and change `{{workload}}` → `<%workload%>`, `{{region}}` → `<%region%>`.

---

### XC-6 (P2): `templates/README.md` status column is stale

All six new archetypes are marked "stub" despite being fully implemented and smoke-test passing. This is the first file a contributor reads.

**Fix:** Change all six rows from "stub" to "ready".

---

### XC-7 (P2): `monorepo-root/packages/example/package.json` (non-tmpl) is dead cruft

The directory contains both `package.json` (hardcoded `"name": "@workspace/example"`) and `package.json.tmpl` (uses `@<%workload%>/example`). The scaffold renders the `.tmpl` and overwrites the non-tmpl via step 2b.iii. The non-tmpl file only exists to make the archetype template directory look like a functional package for development purposes — but it diverges from what gets shipped and creates confusion.

**Fix:** Delete `packages/example/package.json`.

---

### XC-8 (P2): `backend-functions/local.settings.json.example` pins Node 22 but project targets Node 24

`local.settings.json.example`:
```json
"FUNCTIONS_NODE_RUNTIME": "22"
```

`_shared/package.json.tmpl` `engines.node >= 24`. The Azure Functions runtime setting and the project's declared Node requirement must match. Node 22 is still supported by Azure Functions, but a developer running Node 24 locally with `FUNCTIONS_NODE_RUNTIME: "22"` gets a runtime mismatch.

**Fix:** Change `FUNCTIONS_NODE_RUNTIME` to `"24"` (Azure Functions supports Node 24 as of this writing).

---

### XC-9 (P3): `mcp-server/AGENTS.md.tmpl` missing "Design Decisions" section

All other archetypes (except monorepo-root, which has it) follow the 8-section pattern defined in the generic-ts reference. mcp-server has 7 sections — the CJS rationale content is buried in Critical Context instead of having its own section.

**Fix:** Add a `## Design Decisions` section after Critical Context, move the CJS output explanation there.

---

### XC-10 (P3): `frontend-vite-react` SWA config missing `Content-Security-Policy`

`staticwebapp.config.json` ships `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`. There is no `Content-Security-Policy`. For a React SPA with MSAL this is a meaningful gap — CSP is the primary mitigation against XSS, and MSAL's redirect flow requires specific CSP configuration. The starter kit should ship a permissive-but-documented CSP with a comment explaining what to tighten.

**Fix (recommended):** Add a placeholder CSP to `staticwebapp.config.json`:
```json
"Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://login.microsoftonline.com https://*.windows.net; frame-ancestors 'none'"
```
with a comment in AGENTS.md pointing to the MSAL CSP requirements.

---

## Severity Table

| ID | Description | Severity | Archetypes |
|---|---|---|---|
| XC-1 | Missing `.exclude`: `_shared/src/index.ts` + `tests/index.test.ts` leak into 3 archetypes | **P0** | backend-functions, backend-container-app, frontend-vite-react |
| XC-2 | `LICENSE`, `SECURITY.md`, `docs/architecture.md` ship with unsubstituted `{{...}}` slots | **P1** | all archetypes |
| XC-3 | Dockerfile `pnpm@latest` instead of pinned `pnpm@10.33.2` | **P1** | backend-container-app |
| XC-4 | MSAL React v3 documented, v5.3.0 installed | **P1** | frontend-vite-react |
| XC-5 | `bicepparam.tmpl` use default `{{...}}` syntax, inconsistent with all other `.tmpl` files | **P2** | backend-functions, backend-container-app, frontend-vite-react (via _shared) |
| XC-6 | `templates/README.md` marks all 6 implemented archetypes as "stub" | **P2** | all archetypes |
| XC-7 | `packages/example/package.json` (non-tmpl, hardcoded) coexists with `.tmpl` counterpart | **P2** | monorepo-root |
| XC-8 | `local.settings.json.example` pins `FUNCTIONS_NODE_RUNTIME: "22"`, project targets Node 24 | **P2** | backend-functions |
| XC-9 | `mcp-server/AGENTS.md.tmpl` missing "Design Decisions" section (7 vs 8 sections) | **P3** | mcp-server |
| XC-10 | `staticwebapp.config.json` missing `Content-Security-Policy` | **P3** | frontend-vite-react |

**Counts: P0 × 1, P1 × 3, P2 × 4, P3 × 2**

---

## Recommended Fixes (Ordered by Priority)

### P0 — Must fix before the next scaffold run

**1. Add `.exclude` to backend-functions, backend-container-app, frontend-vite-react**

Create `/home/skip/janus/templates/backend-functions/.exclude`:
```
src/index.ts
tests/index.test.ts
```

Create `/home/skip/janus/templates/backend-container-app/.exclude`:
```
src/index.ts
tests/index.test.ts
```

Create `/home/skip/janus/templates/frontend-vite-react/.exclude`:
```
src/index.ts
tests/index.test.ts
```

---

### P1 — Fix before publishing janus as a starter kit

**2. Make LICENSE, SECURITY.md, docs/architecture.md into `.tmpl` files**

- Rename `_shared/LICENSE` → `_shared/LICENSE.tmpl`, add `{{=<% %>=}}`, replace `{{year}}` → `<%year%>`, `{{author}}` → `<%author%>`.
- Rename `_shared/SECURITY.md` → `_shared/SECURITY.md.tmpl`, add `{{=<% %>=}}`, update slots.
- Rename `_shared/docs/architecture.md` → `_shared/docs/architecture.md.tmpl`, add `{{=<% %>=}}`, update slots.
- Update scaffold.sh step 2 pattern if it needs to strip `.tmpl` suffix from `SECURITY.md.tmpl` (check the `${rel%.tmpl}` strip logic handles non-`.json`/`.ts` suffixes — it does, since it's a pure string operation).

**3. Fix Dockerfile pnpm pin**

In `templates/backend-container-app/Dockerfile`, replace both occurrences of:
```
RUN corepack enable && corepack prepare pnpm@latest --activate
```
with:
```
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
```
Keep in sync with `_shared/package.json.tmpl` `packageManager` field.

**4. Fix MSAL version documentation**

In `frontend-vite-react/AGENTS.md.tmpl`, Tech Stack table:
- Change `MSAL Browser v5 + MSAL React v3` → `MSAL Browser v5 + MSAL React v5`

In `frontend-vite-react/README.md`, Stack table:
- Change `~5.1.0 / ~3.0.0` → `~5.8.0 / ~5.3.0`

---

### P2 — Fix before team adoption

**5. Fix bicepparam .tmpl delimiter inconsistency**

Add `{{=<% %>=}}` to the first line of `parameters.staging.bicepparam.tmpl` and `parameters.prod.bicepparam.tmpl`, change `{{workload}}` → `<%workload%>`, `{{region}}` → `<%region%>`.

**6. Update templates/README.md status column**

Change all six archetype rows from "stub" to "ready".

**7. Delete `packages/example/package.json` (non-tmpl)**

```bash
rm /home/skip/janus/templates/monorepo-root/packages/example/package.json
```

**8. Fix `local.settings.json.example` Node version**

In `backend-functions/local.settings.json.example`, change `"FUNCTIONS_NODE_RUNTIME": "22"` → `"FUNCTIONS_NODE_RUNTIME": "24"`.

---

### P3 — Polish

**9. Add `## Design Decisions` to `mcp-server/AGENTS.md.tmpl`**

Move the CJS output rationale from Critical Context into a dedicated Design Decisions section. Aligns with the 8-section reference structure.

**10. Add placeholder CSP to `frontend-vite-react/staticwebapp.config.json`**

Add a `Content-Security-Policy` header with documented MSAL-compatible values and a comment pointing to tightening guidance.
