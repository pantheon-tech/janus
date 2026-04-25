---
title: Code Review Synthesis — janus after 7-archetype merge
date: 2026-04-25
branch: main
reviewers:
  - 01-archetype-consistency.md
  - 02-scaffold-and-smoke-test.md
  - 03-security.md
  - 04-docs-conventions.md
status: 47 findings (1 P0 / 12 P1 / 19 P2 / 12 P3 / 3 info)
---

# Code Review Synthesis

Smoke test passes 10/10 across all 7 archetypes (every one scaffolds → installs → typechecks → lints → tests → builds where applicable). The reviews below were independent and focused on different angles. There is one P0, several thematically clustered P1s, and a long P2/P3 polish tail.

## Severity rollup

| Sev | 01 archetype | 02 scaffold | 03 security | 04 docs | Total |
|---|---|---|---|---|---|
| **P0** | 1 | 0 | 0 | 0 | **1** |
| **P1** | 3 | 3 | 2 | 4 | **12** |
| **P2** | 4 | 4 | 1 | 10 | **19** |
| **P3** | 2 | 2 | 3 | 5 | **12** |
| Info | 0 | 0 | 3 | 0 | 3 |

## P0 — must fix before next scaffold run

**1. Three archetypes missing `.exclude` → ship `_shared/src/index.ts` greet stub everywhere** (XC-1 / 01-archetype)
- backend-functions, backend-container-app, frontend-vite-react have no `.exclude` file.
- Result: every scaffolded project gets `src/index.ts` (`greet()` hello-world stub) + `tests/index.test.ts` alongside the real archetype source.
- Tests pass because the stub ships with its test → CI is green but every project ships dead code.
- **Fix**: add a 2-line `.exclude` to each archetype dropping `src/index.ts` and `tests/index.test.ts`.

## P1 — fix before publishing janus

### Templating bugs
- **XC-2**: `LICENSE`, `SECURITY.md`, `docs/architecture.md` are not `.tmpl` → ship literal `{{year}} {{author}}` placeholders on disk.
- **XC-3**: `backend-container-app/Dockerfile` uses `pnpm@latest` instead of pinned `pnpm@10.33.2` → lockfile-format drift breaks `pnpm install --frozen-lockfile` in Docker.
- **BUG-1** (02-scaffold): `scripts/scaffold.sh:289` filters `! -name 'package.json.tmpl'` by basename at any depth → kills `monorepo-root/packages/example/package.json.tmpl`. Every monorepo gets `@workspace/example` (verbatim) instead of `@<%workload%>/example`. **Fix**: change to `! -path './package.json.tmpl'`.

### Smoke test coverage gaps
- **RISK-1**: `frontend-vite-react` (largest moving-part count: Vite 7, React 19, Tailwind v4 plugin, MSAL, jsdom) gets only structural check. Add `verify_frontend_react()`.
- **RISK-2**: `backend-functions` (own toolchain: `func`, host.json, extensionBundle) gets only structural check. Add `verify_backend_functions()`.

### Security
- **W-3** (03-security): `our-keyvault.bicep` hardcodes `publicNetworkAccess: 'Enabled'` + `defaultAction: 'Allow'` with no env conditional — contradicts `docs/conventions/security.md` which mandates `Deny` + private endpoint in prod. Every prod scaffold ships a publicly-reachable Key Vault.
- **W-4** (03-security): `setup-oidc.sh:72-86` adds `pull_request` federated credential to the **prod** Azure AD app (Contributor on prod RG). A PR-author can trigger infra-preview to obtain prod-scoped OIDC creds if the prod GitHub Environment lacks protection rules.

### Docs / version drift
- **XC-4** + finding 7 (docs): `frontend-vite-react/AGENTS.md.tmpl` claims MSAL React v3, README claims v5.1.0, but `package.json.tmpl` ships `~5.3.0`. Three contradictory facts in one archetype.
- **Finding 1** (docs): "Seven sections. Strict." convention violated by *every* archetype AGENTS.md (all have 8 — extra `Branching` section). Either codify Branching as section 4, or fold it into Commands.
- **Finding 2** (docs): conventions documents the placeholder syntax as `{{snake_case}}` everywhere, but templates actually use Mustache `<% %>` custom delimiters. The doc is misleading to anyone editing templates.
- **XC-9 / Finding** (docs): `mcp-server/AGENTS.md.tmpl` missing the Design Decisions section (it has 7 sections but the wrong 7).

## P2 — fix before team adoption

| # | Source | Issue |
|---|---|---|
| RISK-3 | 02 | `pnpm install --lockfile-only \|\| true` swallows lockfile-gen failures → user gets project with no `pnpm-lock.yaml`, broken first CI push |
| RISK-4 | 02 | `is_excluded 'infra/'` passes a pattern string as a path arg — semantically wrong, works by coincidence |
| RISK-5 | 02 | Smoke test's 14 positional answers shift silently if scaffold adds a prompt — no count guard |
| RISK-6 | 02 | `verify_monorepo` checks file existence but not package `name` field (this is what missed BUG-1) |
| XC-5 | 01 | `parameters.{staging,prod}.bicepparam.tmpl` use raw `{{...}}` not `<%...%>` |
| XC-6 | 01 | `templates/README.md` status column says all 6 new archetypes are "stub" (they're Ready) |
| XC-7 | 01 | `monorepo-root/packages/example/package.json` (non-tmpl) is dead cruft (consequence of BUG-1) |
| XC-8 | 01 | `local.settings.json.example` pins `FUNCTIONS_NODE_RUNTIME: "22"` but project targets Node 24 |
| W-2 | 03 | `Bash(gh *)` allow in `.claude/settings.json` is over-broad — covers `gh auth token`, `gh secret set`, `gh ssh-key add`. Deny list missing `Read(~/.ssh/**)`, `Read(~/.aws/**)`, `Read(.env*)` |
| 3 | 04 | `stack.md` says "Five only" doc shapes; `docs-shapes.md` has six |
| 4 | 04 | `moduleResolution: bundler` for frontend isn't acknowledged in `stack.md` as a known exception |
| 5 | 04 | `infra-drift.yml` referenced in docs but not shipped in templates |
| 6 | 04 | `0001-stack-choices.md` convention chapter is documented but not scaffolded into derived projects |
| 9 | 04 | janus's own `AGENTS.md` + `README.md` describe scaffold.sh as placeholder/unimplemented (it works) |
| 10 | 04 | janus `AGENTS.md` Known Issues lists "six templates as stubs" — stale |
| 19 | 04 | `secrets.md`, `security.md`, `infrastructure.md` link to `rotate-secrets.md` and `deploy.md` runbooks that aren't scaffolded |
| W-5 | 03 | `claude-autofix.yml.tmpl` heredoc EOF-break risk — CI log lines containing literal `EOF` truncate the heredoc |

## P3 — polish (12 items)

Spread across reports — Status sections missing on a few READMEs, conventions index doesn't mark stub chapters, mcp-server publishing flow could move to a runbook, generic-ts promotion path doesn't mention ADR requirement, etc. See per-report details.

## Recommended execution order

1. **Quick wins** (single-file edits): add 3 `.exclude` files (P0); rename 3 files to `.tmpl` (P1 XC-2); pin `pnpm@10.33.2` in Dockerfile (P1 XC-3); fix MSAL doc references (P1 XC-4).
2. **One-line scaffold bug**: change `! -name 'package.json.tmpl'` to `! -path './package.json.tmpl'` in scaffold.sh (P1 BUG-1) + delete the stale verbatim file (P2 XC-7).
3. **Smoke test hardening**: add `verify_frontend_react`, `verify_backend_functions`; add a `name` assertion in `verify_monorepo`; add a prompt-count guard.
4. **Security**: env-conditional Key Vault network rules; remove `pull_request` federated cred from prod SP; tighten `Bash(gh *)`.
5. **Docs**: pick one — either codify 8-section AGENTS shape or fold Branching into Commands. Fix `{{}}` vs `<% %>` doc drift.
6. **P2/P3 tail**: dispatch in batches; many are 1-2 line edits.

Estimated time to land all P0 + P1: ~2 hours of focused work or one fix-fleet wave (8 agents).

## Verification

After fixes land, smoke test must still pass 10/10 (and ideally grow to 12/12 as `verify_frontend_react` and `verify_backend_functions` get added). Run:

```bash
cd /home/skip/janus
bash tests/scaffold-smoke-test.sh
```

Expected: `Results: 10 passed, 0 failed` (until smoke coverage expands).
