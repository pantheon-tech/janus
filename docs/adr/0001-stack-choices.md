# 0001 — Stack Choices (Canonical)

- **Status**: accepted
- **Date**: 2026-04-24
- **Deciders**: @skipnz
- **Informs**: every project scaffolded from janus

## Context

Across 50+ personal and organisational repos (skipnz, pantheon-tech, pantheon-trading, Aotearoa-Energy), decisions on package manager, linter, formatter, test runner, documentation structure, secret management, and infrastructure have evolved organically per-project. This causes:

1. Cognitive overhead switching between projects ("which lockfile? which test command?").
2. Unintentional divergence on things that could be homogeneous (Azure naming, CI shape).
3. No written record of WHY a decision was made — subsequent archaeology.

janus sets the baseline. Every project scaffolded from janus inherits these choices. Divergence requires a project-level ADR.

## Decision

The canonical stack for a new project scaffolded from janus:

### Language & runtime

| Aspect | Choice |
|---|---|
| Language | TypeScript `~5.6.x` (tilde-pin) |
| Runtime | Node 20 LTS |
| Module system | NodeNext / ES2022 target |
| Strictness | `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true` |

### Package management

| Aspect | Choice |
|---|---|
| Package manager | **pnpm** (single-package AND monorepo — no npm split) |
| Lockfile | `pnpm-lock.yaml` committed |
| Monorepo tool | pnpm workspaces alone (Turborepo only if > 10 packages) |
| Private packages | GitHub Packages under `@skipnz` or org scope |
| Auth to GH Packages | `${NODE_AUTH_TOKEN}` env var; never inline |

### Lint, format, test

| Aspect | Choice |
|---|---|
| Lint + format | **Biome v2** (replaces ESLint + Prettier; escape hatch to ESLint flat only if a specific plugin requires) |
| Line width | **100** |
| Quote style | single (TS/JS), JSX single |
| Trailing commas | all |
| Test runner | **Vitest** (backend + frontend unified) |
| E2E | Playwright (when browser testing is needed) |
| Integration test policy | hit real dependencies where feasible; mock only external APIs |

### Git workflow

| Aspect | Choice |
|---|---|
| Default branch | `main` |
| Branches beyond `main` | none by default; add `dev` only if concurrent-feature staging is actually needed |
| Deploy gating | GitHub **environments** with required reviewers (not branches) |
| Commit convention | Conventional Commits via commitlint |
| Git hooks | **lefthook** (not husky) |
| Pre-commit | biome check + gitleaks |

### Cloud & infrastructure

| Aspect | Choice |
|---|---|
| Cloud | **Azure** |
| Default region | `australiaeast` |
| IaC | Bicep via **AVM composition** (see ADR 0004) |
| Backend default | Asked at scaffold time: Azure Functions v4 OR Container App OR SWA+Functions |
| Frontend | Vite + React + MSAL → Static Web App |
| Secrets (runtime) | Key Vault + user-assigned managed identity |
| Secrets (CI) | GitHub environment secrets + OIDC federation (two federated creds per env SP: `environment:<env>` + `pull_request`) |
| Secrets (dev) | `.env.local` (gitignored) + `.env.example` (committed, every var documented) |
| Resource naming | See ADR 0002 |

### Documentation

| Aspect | Choice |
|---|---|
| Primary agent file | **`AGENTS.md`** (see ADR 0005) |
| Claude-specific | `CLAUDE.md` with `@AGENTS.md` + deltas |
| Decisions | `docs/adr/` — MADR format, append-only |
| Implementation plans | `docs/plans/` — dated, phased |
| Operational procedures | `docs/runbooks/` — with staleness frontmatter |
| API reference | `docs/reference/` — auto-generated from code (never hand-maintained) |
| Doc shapes | Five and only five (see ADR 0006) |

### Observability

| Aspect | Choice |
|---|---|
| Logging | pino (backend), console structured (frontend) |
| Tracing | OpenTelemetry with GenAI semantic conventions where applicable |
| Correlation | `x-correlation-id` header propagated through all layers |
| Redact paths | `password`, `token`, `apiKey`, `authorization`, `secret` |

### Security

| Aspect | Choice |
|---|---|
| Auth (user) | MSAL (Entra ID) |
| Auth (service) | managed identity |
| Authorisation | RBAC (never access policies) |
| Network ACLs | `defaultAction: Deny` in production |
| Secret scanning | gitleaks in pre-commit + CodeQL in CI |
| Plugin marketplaces | `strictKnownMarketplaces: true` |

### Folder structure (per archetype)

Per-archetype structure in `templates/<archetype>/`. The layering convention (routes → services → repositories → data stores) is non-negotiable; see [docs/conventions/layering.md](../conventions/layering.md).

### Feature-slicing policy

- **Frontend**: feature-sliced (`src/features/<feature>/`).
- **Backend**: layer-sliced by default (`services/`, `repositories/`); switch to module-sliced at ~20+ routes (each module has its own layers).

## Consequences

### Positive
- **Zero time** spent re-deciding on package manager / linter / formatter for each new project.
- **Homogeneous baseline** — any project scaffolded from janus v1.x is structurally identical to any other.
- **Documented rationale** — every convention has a paper trail here or in sibling ADRs.
- **Portable across tools** — AGENTS.md as primary means Claude Code, Codex, Cursor, Amp, Copilot all understand the project.
- **Security by default** — secret scanning + RBAC + managed identity + deny network ACLs baked in.

### Negative
- **Azure lock-in**. Moving a janus-scaffolded project to AWS or GCP would require significant rework. Mitigated by: Azure is the universal environment across all surveyed projects; no current multi-cloud need.
- **pnpm requirement**. Some toolchains (e.g. Office.js) historically had npm-only quirks. Mitigated by: Office.js toolchain now supports pnpm; narrow exceptions can carry their own lockfile.
- **Biome immaturity** on some niche ESLint plugins. Mitigated by: documented escape hatch to ESLint flat.
- **Template version drift**. Projects scaffolded from v1.0 won't automatically receive v1.1 improvements. Mitigated by: deliberate migration per project, tracked in the project's ADRs.

### Neutral
- **`main`-only branching** is simpler than `dev → staging → main` but means deploy approval is environment-enforced, not branch-enforced. Fine for solo-dev; larger teams may need the three-branch model.
- **AGENTS.md primary** means CLAUDE.md becomes thin. Existing projects with heavy CLAUDE.md will need ADR-tracked migration.

## Considered Alternatives

- **npm for single-package / pnpm for monorepo** — rejected. Split is historical, not principled. pnpm is strictly better on every measured axis (install speed, disk usage, phantom-dep blocking). Running two package managers is cognitive overhead.
- **ESLint + Prettier as primary** — rejected as default. Biome v2 is faster, simpler, and covers ~95% of needs. ESLint remains as escape hatch.
- **Jest for backend, Vitest for frontend** — rejected. Vitest handles backend (including Azure Functions v4) fine. One test tool is less overhead.
- **`printWidth: 180`** — rejected. Historical personal preference with no measured benefit. 100 aligns with industry, keeps GitHub PR side-by-side readable, works in terminal diff.
- **`dev → staging → main` three-branch model** — rejected as default. Most projects don't need it; environment required-reviewers give the same approval gate with less cognitive overhead. Available as opt-in for projects that genuinely need staging.
- **CLAUDE.md as primary agent file** — rejected. AGENTS.md won standardisation (Linux Foundation Agentic AI Foundation, Dec 2025, 60k+ projects, recognised by every major AI-coding tool). See ADR 0005.
- **Liberal `CRITICAL`/`MANDATORY`/`NEVER`/`ALWAYS` markers** — rejected. Opus 4.5+ overtriggers on these per Anthropic's own guidance. Cap at 1–3 per file.
- **Bespoke Bicep modules per-project** — rejected. AVM is now GA and Microsoft-maintained. See ADR 0004.

## References

- `/home/skip/claude-plugins/research/` — Round 1 research (9 documents).
- `/home/skip/claude-plugins/research-v2/` — Round 2 research (8 documents).
- `/home/skip/claude-plugins/research-v3/` — Round 3 convention-extraction research (5 documents + synthesis).
- `/home/skip/claude-plugins/research-v3/00-SYNTHESIS.md` — convention extraction from actual project evidence.
- Template version scaffolded from: janus v0.1.0 (2026-04-24).
