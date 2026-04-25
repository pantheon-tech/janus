---
title: Code Review — Documentation & Conventions Coherence
type: reference
reviewed: 2026-04-25
reviewer: Claude (Sonnet 4.6)
scope: docs/conventions/, templates/*/AGENTS.md.tmpl, templates/*/README.md, _shared/AGENTS.md.tmpl, _shared/README.md.tmpl, AGENTS.md, CLAUDE.md, README.md
---

# Code Review — Documentation & Conventions Coherence

## Summary

The conventions layer is well-structured and the per-archetype AGENTS.md files contain genuinely useful, non-trivial critical context. Three systemic issues stand out: (1) the convention for the seven-section AGENTS.md shape is violated by every template in the same way (extra `Branching` section, plus two archetype-specific divergences); (2) the placeholder syntax documented everywhere as `{{snake_case}}` is not what the template engine actually uses (it uses Mustache custom delimiters `<% %>`); and (3) several janus-level docs describe scaffold.sh and archetype readiness in ways that were accurate at time of drafting but are now stale. Three convention chapters are declared stubs (`alerting.md`, `performance.md`, `dependencies.md`) which is honest but costs reader trust when an agent hits them during a task.

---

## Per-archetype AGENTS.md + README audit

### `_shared/AGENTS.md.tmpl` (base template)

**Section structure**: Overview, Tech Stack, Commands, Branching, Structure, Critical Context, Design Decisions, Known Issues — 8 sections. Convention says 7 ("Seven sections. Strict."). `Branching` is the extra section; it appears in every archetype template identically. Either the convention needs to recognise `Branching` as section 4, or the templates need to fold branching into `Critical Context` or `Commands`.

**Content**: The `Structure` block is a `<TODO: populated by scaffold per archetype>` literal. This is intentional — the scaffold is expected to override it from per-archetype files — but if an archetype's AGENTS.md.tmpl doesn't override the structure block (and the _shared template renders because no per-archetype file existed), the user gets a visible TODO in their project. Since all 7 archetypes have their own AGENTS.md.tmpl, this is low-risk in practice, but the `_shared` base template should note it's a fallback, not a final output.

**Critical Context**: Just one placeholder bullet — `<TODO: non-obvious invariants specific to this project>`. Correctly left open; the scaffold.sh post-checklist tells users to fill it.

### `backend-container-app/AGENTS.md.tmpl`

Good. Critical Context is genuinely non-obvious: SIGTERM 30-second contract, `ws` wired via `noServer: true + upgrade handler` (not a second server), pino-only output. Section count is 8 (has Branching). Within 150-line hard cap (110 lines).

**Accuracy**: Claims `pnpm build: tsup → dist/server.js (CJS)`. The `package.json.tmpl` overlay sets `"build": "tsup src/server.ts --format cjs --clean"` — consistent.

### `backend-container-app/README.md`

Has: when-to-pick, what-it-ships, status (Ready), structure, promotion-path. Well done. Status is accurate.

### `backend-functions/AGENTS.md.tmpl`

Good. Critical Context hits the high-value items: Functions Core Tools requirement, Programming Model v4 (no `function.json`), entry-point glob pattern, test isolation pattern (export handler separately from `app.http()` registration). 100 lines — within cap.

**Minor**: `pnpm dev` command description says `tsup --watch & func start (requires Azure Functions Core Tools)` — accurate. However, Critical Context also warns about Core Tools separately, creating a small redundancy. Not a problem.

### `backend-functions/README.md`

Missing `Status` section. Every other README that is "ready" says so explicitly (backend-container-app, generic-ts). backend-functions is also ready but has no status declaration. A reader can't tell without inspecting templates.

Also missing a `See also` cross-reference to `docs/conventions/testing.md` for the test-isolation pattern described in its Critical Context.

### `frontend-vite-react/AGENTS.md.tmpl`

Good. Critical Context is accurate and useful: MSAL build-time-only note, Tailwind v4 CSS-first (no config file), SWA navigation fallback, `moduleResolution: bundler` rationale. 118 lines — within cap.

**Accuracy**: Tech Stack claims `@azure/msal-react v3`. The `package.json.tmpl` has `"@azure/msal-react": "~5.3.0"`. This is a version mismatch — the AGENTS.md says v3 but the template ships v5. P1 bug.

Design Decisions section drops the `docs/conventions/` reference present in other archetypes' Design Decisions. Probably intentional (frontend doesn't follow the same conventions as backend layering), but the omission leaves agents without the pointer back to shared conventions. Add it.

### `frontend-vite-react/README.md`

Structure is different from all other archetype READMEs: no "When to pick", no "Status", no "Promotion path". Has "What this archetype produces", "Stack", "Files overlaid by this archetype", "Excluded shared files", "Key design notes". This is a useful internal-developer-of-janus layout but misses the user-facing orientation questions. An agent trying to pick between archetypes reads these READMEs — the missing "When to pick" is a real gap.

### `generic-ts/AGENTS.md.tmpl`

Concise (70 lines). Critical Context has two bullets: no infra/no Azure (important boundary), and migration guidance. Both are correct and non-obvious. Section structure: 8 (includes Branching).

**Accuracy**: Commands include `pnpm start: node dist/index.js`. The `package.json.tmpl` overlay sets `"start": "node dist/index.js"`. Consistent.

### `generic-ts/README.md`

Has: when-to-pick, what-it-ships, status (Ready), structure, promotion-path. Good. Promotion path is present but sparse — it says "migrate to one of the more specific archetypes" without listing the ADR requirement. The `backend-functions/README.md` Promotion Path table is a better model.

### `mcp-server/AGENTS.md.tmpl`

Missing `Design Decisions` section — 7 sections total, but the wrong 7. Every other archetype has Design Decisions (pointing to `docs/conventions/stack.md` and `docs/adr/`). The mcp-server's Design Decisions would be genuinely useful: CJS-over-ESM decision, stdio-transport decision (why not HTTP), no-Azure decision. The absence pushes these into Critical Context as content rather than architecture notes. Restructure.

Critical Context quality is high: the stdout-corruption risk (`console.log` kills the JSON-RPC stream) is the single most important non-obvious gotcha for any MCP server and is well-explained. Zod schema registration, CJS output, and the confirmation pattern for destructive tools are all genuinely useful.

The Publishing section is effectively a mini-runbook (4 steps, two code blocks). At 130 lines this is near the 150-line hard cap. The publishing flow would be better in `docs/runbooks/publish.md` (scaffolded) with a pointer here. Doesn't breach the cap but is a code smell.

### `mcp-server/README.md`

Has: when-to-pick, what-ships, how-to-run, how-to-publish, critical constraints. Missing explicit Status and Promotion path sections. The constraints section duplicates content from `AGENTS.md.tmpl` — at review time an agent reads one or the other, not both, so duplication is tolerable, but it creates drift risk.

### `monorepo-root/AGENTS.md.tmpl`

Has `Workspace Topology` in place of `Structure` (appropriate — the structure section IS the topology for this archetype) but this pushes it to 8 sections (Overview, Workspace Topology, Tech Stack, Commands, Branching, Critical Context, Design Decisions, Known Issues). The section count violation is the same as all others (due to Branching), but the name substitution is reasonable and self-documenting.

Critical Context is good: no-source-at-root, each-package-owns-its-deploy, biome-runs-at-root, tsconfig extends path, adding-a-package recipe, Turborepo threshold. 91 lines.

### `monorepo-root/README.md`

Missing: When to pick, Status, Promotion path. Has: What gets scaffolded (good), excluded from _shared (good), workspace conventions, adding a child package, see also. The when-to-pick is particularly missing — when do you use monorepo-root vs just generic-ts with packages manually added?

### `types-package/AGENTS.md.tmpl`

Critical Context quality is the best of any archetype: 7 tight bullets, all non-obvious, all architecture-relevant. No-runtime-code, dts-bundle-generator flattens the tree, type-level tests only (never run at runtime), no-dev-start-scripts, publishing model, no-Azure, TypeScript-consumers-only. 80 lines.

### `types-package/README.md`

Status says "Stub — scaffold content TODO". But the AGENTS.md.tmpl is fully written. The README's "Planned structure" and "Planned contents" language is stale — the content looks planned-out in the AGENTS.md already. The README needs a rewrite to use the standard archetype-README shape: When to pick, What it ships, Status (Ready), Structure, Promotion path.

One specific issue: the README uses `{{github_org}}` (double-brace) syntax in a `.md` file (not `.md.tmpl`), so it won't be processed by the Mustache renderer during scaffold. The literal `{{github_org}}` will appear in the target README. This is either intentional (the user fills it) or a bug (should be `.md.tmpl`). Given the README is excluded from scaffolded projects (via `! -path './README.md'` in scaffold.sh), it doesn't actually ship — but the inconsistency is confusing.

---

## Conventions coherence findings

### 1. "Seven sections. Strict." violated by every template (P1)

`docs/conventions/agents-md.md` specifies 7 sections exactly. Every archetype AGENTS.md.tmpl has an extra `## Branching` section, making it 8. The convention needs to either add `Branching` as section 4 (between Commands and Structure), or the templates need to consolidate branching info into Commands or Critical Context. The current state means an agent reading the convention and reading any template will see a mismatch.

### 2. Placeholder syntax documented as `{{}}` but templates use `<% %>` (P1)

`templates/README.md`, `AGENTS.md`, and `CLAUDE.md` all state that slot substitution uses `{{snake_case}}` syntax. The actual template files use Mustache custom delimiter syntax (`{{=<% %>=}}` to switch to `<% %>`). This affects `AGENTS.md.tmpl`, all `package.json.tmpl` files, `index.html.tmpl`, etc. The `mo` script (vendored Mustache in bash) is what actually renders these.

The `types-package/README.md` (which is NOT a `.tmpl` file) also contains literal `{{github_org}}` strings. Since it's excluded from scaffolded output by scaffold.sh, these are harmless but inconsistent with the stated convention.

Fix: Either update docs to describe `<% %>` as the actual render syntax, or note that `{{}}` is a documentation shorthand and the rendered form is `<% %>` in `.tmpl` files.

### 3. `stack.md` says "Five only" for doc shapes; `docs-shapes.md` has six (P2)

`docs/conventions/stack.md` line 75: `| Doc shapes | Five only. See docs-shapes.md |`. The `docs-shapes.md` canonical count is six (README, AGENTS.md, ADR, Plan, Runbook, Reference). Stack.md is stale by one shape.

### 4. `moduleResolution: bundler` for frontend — undocumented exception in stack.md (P2)

`docs/conventions/stack.md` says `Module system: ES2022, NodeNext resolution`. The `frontend-vite-react/tsconfig.json.tmpl` uses `"moduleResolution": "bundler"`. The frontend README correctly explains this deviation (`bundler` required for Vite), and the Critical Context in the AGENTS.md.tmpl notes it. But `stack.md` doesn't acknowledge the exception, so an agent reading stack.md only would apply the NodeNext expectation to the frontend incorrectly.

Fix: Add a footnote to the stack.md Module System row: "except `frontend-vite-react` which uses `bundler` (required by Vite)".

### 5. `infra-drift.yml` referenced in docs but not shipped in templates (P2)

`docs/conventions/infrastructure.md` line 219 references `.github/workflows/infra-drift.yml` as a nightly drift check. This workflow is not present in `templates/_shared/.github/workflows/`. Projects scaffolded from janus won't have it. Either the workflow needs to be authored and added to `_shared`, or the reference should be qualified as "planned" or removed.

### 6. `0001-stack-choices.md` convention not scaffolded (P2)

`docs/adr/README.md` states: "Every derived project records its template version in its own `docs/adr/0001-stack-choices.md`." No such file is scaffolded — `templates/_shared/docs/adr/` contains only `README.md` and `TEMPLATE.md`. The `_shared/docs/adr/README.md` doesn't mention this obligation either. Derived projects will miss this unless the user reads janus's own docs. Add a `0001-stack-choices.md.tmpl` to `templates/_shared/docs/adr/` that auto-populates the janus version.

### 7. `msal-react` version mismatch in frontend AGENTS.md (P1)

`frontend-vite-react/AGENTS.md.tmpl` Tech Stack table: `Auth | MSAL Browser v5 + MSAL React v3`. The `package.json.tmpl` overlay sets `"@azure/msal-react": "~5.3.0"`. The correct version is v5, not v3. This will mislead agents about the installed version.

### 8. Stub chapters in conventions (P3 — honest but agent-unfriendly)

Three chapters are self-declared stubs with "TODO. Anticipated content:" blocks:
- `alerting.md` — 5 TODO blocks
- `performance.md` — 5 TODO blocks  
- `dependencies.md` — 4 TODO blocks

These are listed in the conventions README index without any stub indication. An agent hitting these chapters mid-task gets outlines instead of decisions. Either mark them as stubs in the index, or write the minimal actionable content and drop the TODO scaffolding.

### 9. janus AGENTS.md and README.md stale about scaffold.sh (P2)

`scripts/scaffold.sh` is fully implemented (~400 lines, working). Three places still describe it as a placeholder or conditional:
- `AGENTS.md` Commands: `./scripts/scaffold.sh # generate a new project from templates/ (placeholder)`
- `AGENTS.md` Known Issues: `(2026-04-24) scripts/scaffold.sh is a placeholder`
- `README.md` Usage: `# Scaffold a new project (when scaffold.sh is implemented)`

All three should be updated to reflect that scaffold.sh works.

### 10. janus AGENTS.md Known Issues partially stale (P2)

`(2026-04-24) Six archetype templates contain README/NOTE only; full scaffold content TODO.` — This is not accurate for at least 3 archetypes (backend-container-app, generic-ts, and mcp-server are marked Ready in their READMEs; backend-functions and types-package AGENTS.md files are fully written). The blanket "six templates" claim should be replaced with a specific list of what remains stub.

---

## Cross-reference issues

| Issue | Location | Reference | Status |
|---|---|---|---|
| `infra-drift.yml` | `docs/conventions/infrastructure.md:219` | `.github/workflows/infra-drift.yml` | Workflow not in templates |
| `scaffold.sh` as placeholder | `AGENTS.md`, `README.md` | `scripts/scaffold.sh` | Script is implemented |
| "Five only" doc shapes | `docs/conventions/stack.md:75` | `docs/conventions/docs-shapes.md` | `docs-shapes.md` says six |
| `{{}}` syntax | `templates/README.md`, `AGENTS.md`, `CLAUDE.md` | Actual `.tmpl` files | Templates use `<% %>` |
| `msal-react v3` | `frontend-vite-react/AGENTS.md.tmpl` | `frontend-vite-react/package.json.tmpl` | Package installs v5 |
| `0001-stack-choices.md` | `docs/adr/README.md` | `templates/_shared/docs/adr/` | Template not scaffolded |
| `rotate-secrets.md` linked from conventions | `secrets.md:81`, `security.md:44` | `../runbooks/rotate-secrets.md` | File not scaffolded — only `TEMPLATE.md` ships |
| `deploy.md` linked from conventions | `infrastructure.md:214` | `../runbooks/deploy.md` | File not scaffolded |

---

## Severity table

| # | Finding | Severity | Location |
|---|---|---|---|
| 1 | `Branching` section in all templates violates "Seven sections. Strict." | P1 | All `AGENTS.md.tmpl` files |
| 2 | Slot syntax documented as `{{}}`, templates use `<% %>` | P1 | `templates/README.md`, `AGENTS.md`, `CLAUDE.md` |
| 3 | `msal-react` version in AGENTS.md (v3) mismatches template (v5) | P1 | `frontend-vite-react/AGENTS.md.tmpl` |
| 4 | `mcp-server/AGENTS.md.tmpl` missing `Design Decisions` section | P1 | `mcp-server/AGENTS.md.tmpl` |
| 5 | `stack.md` says "Five only" doc shapes; `docs-shapes.md` defines six | P2 | `docs/conventions/stack.md:75` |
| 6 | `moduleResolution: bundler` (frontend) not acknowledged in `stack.md` | P2 | `docs/conventions/stack.md` |
| 7 | `infra-drift.yml` documented but absent from templates | P2 | `docs/conventions/infrastructure.md:219` |
| 8 | `0001-stack-choices.md` convention not scaffolded | P2 | `docs/adr/README.md`, `templates/_shared/docs/adr/` |
| 9 | `AGENTS.md` + `README.md` describe scaffold.sh as placeholder/unimplemented | P2 | `AGENTS.md`, `README.md` |
| 10 | Known Issues says "six templates are stubs" — inaccurate | P2 | `AGENTS.md:71` |
| 11 | `frontend-vite-react/README.md` missing when-to-pick, status, promotion-path | P2 | `frontend-vite-react/README.md` |
| 12 | `monorepo-root/README.md` missing when-to-pick, status, promotion-path | P2 | `monorepo-root/README.md` |
| 13 | `types-package/README.md` entirely stale (stub language, wrong shape) | P2 | `types-package/README.md` |
| 14 | `backend-functions/README.md` missing `Status` section | P3 | `backend-functions/README.md` |
| 15 | Stub chapters (`alerting`, `performance`, `dependencies`) not flagged in index | P3 | `docs/conventions/README.md` |
| 16 | `mcp-server/AGENTS.md.tmpl` publishing flow should be a runbook | P3 | `mcp-server/AGENTS.md.tmpl` |
| 17 | `generic-ts/README.md` Promotion Path doesn't mention ADR requirement | P3 | `generic-ts/README.md` |
| 18 | `frontend-vite-react/AGENTS.md.tmpl` Design Decisions missing conventions link | P3 | `frontend-vite-react/AGENTS.md.tmpl` |
| 19 | `secrets.md`, `security.md`, `infrastructure.md` link to runbooks not scaffolded | P2 | `docs/conventions/secrets.md:81`, `security.md:44`, `infrastructure.md:214` |

**Totals**: 4 × P1, 10 × P2, 5 × P3

---

## Recommended fixes (in priority order)

### P1 fixes

1. **Branching section**: Decide: either add `## Branching` to the seven-section spec in `docs/conventions/agents-md.md` (making it eight sections, dropping "Seven sections. Strict." in favour of a named list), or fold the two lines of branching content into `## Commands`. The former is less disruptive.

2. **Slot syntax**: Update `templates/README.md` Slot variables section and the AGENTS.md/CLAUDE.md references to say: "Templates use Mustache with custom delimiters `<%` / `%>` (via `mo`). Documentation uses `{{}}` as a shorthand; the actual rendered syntax in `.tmpl` files is `<%var%>`."

3. **msal-react version**: In `frontend-vite-react/AGENTS.md.tmpl` line 17, change `MSAL React v3` to `MSAL React v5`.

4. **mcp-server Design Decisions**: Add `## Design Decisions` section before `## Known Issues`. Minimum content: link to `docs/conventions/stack.md`, note CJS-over-ESM choice (required for stdio shebang), note no-Azure (publish to npm, no infra needed).

### P2 fixes

5. **stack.md "Five only"**: Update line 75 to `| Doc shapes | Six shapes. See docs-shapes.md |` and add a footnote that `frontend-vite-react` uses `moduleResolution: bundler` (Vite requirement) rather than NodeNext.

6. **infra-drift.yml**: Either author `templates/_shared/.github/workflows/infra-drift.yml.tmpl` or remove the nightly drift check reference from `infrastructure.md` and file a GitHub issue.

7. **0001-stack-choices.md**: Create `templates/_shared/docs/adr/0001-stack-choices.md.tmpl` pre-populated with the janus version, archetype, and date from scaffold slots. Update `_shared/docs/adr/README.md` to reference this obligation.

8. **Stale scaffold.sh references**: In `AGENTS.md`, update the Commands line to remove "(placeholder)" and remove the Known Issues entry for scaffold.sh. In `README.md`, remove the "(when scaffold.sh is implemented)" qualifier.

9. **Known Issues accuracy**: Replace the blanket "Six archetype templates..." Known Issues with a specific list of what remains genuinely unimplemented (currently: `types-package` and `monorepo-root` archetype source files are stubs; `_shared` hooks directory is empty).

10-13. **README structural gaps**: Apply the standard archetype-README shape (When to pick / What it ships / Status / Structure / Promotion path) to `frontend-vite-react`, `monorepo-root`, and `types-package` READMEs. Add Status to `backend-functions`.

14. **Convention→runbook dead links**: `docs/conventions/secrets.md:81`, `security.md:44`, and `infrastructure.md:214` all link to `../runbooks/rotate-secrets.md` or `../runbooks/deploy.md`. These files are not scaffolded (`_shared/docs/runbooks/` ships only `README.md` + `TEMPLATE.md`). Either scaffold stub versions of these two runbooks (using the `TEMPLATE.md` shape), or add a note in each convention chapter that the referenced runbook is project-specific and must be authored from the runbook template.

### P3 fixes

15. **Stub chapters**: Add `(stub)` annotation in `docs/conventions/README.md` index for `alerting.md`, `performance.md`, `dependencies.md`. Or write the minimal actionable decisions and remove the TODO scaffolding.

16. **mcp-server publishing**: Extract the 4-step publish flow from `mcp-server/AGENTS.md.tmpl` into `templates/_shared/docs/runbooks/publish.md.tmpl`. Replace inline steps with a pointer.
