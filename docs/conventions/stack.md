---
title: Stack
type: reference
last_reviewed: 2026-04-24
---

# Stack

The default stack every janus-derived project inherits.

## Language and runtime

| Aspect | Value |
|---|---|
| Language | TypeScript `~6.0.x` |
| Runtime | Node 24 (LTS) |
| Module system | ES2022, NodeNext resolution |
| Strictness | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |

## Package management

| Aspect | Value |
|---|---|
| Manager | pnpm (single-package and monorepo) |
| Lockfile | `pnpm-lock.yaml` committed |
| Workspaces | pnpm workspaces alone (Turborepo only above ~10 packages) |
| Private packages | GitHub Packages, scoped (`@<org>/<name>`) |
| Auth to GitHub Packages | `${NODE_AUTH_TOKEN}` env var; never inline |

## Lint, format, test

| Aspect | Value |
|---|---|
| Lint + format | Biome v2 |
| Line width | 100 |
| Quotes | single (TS/JS), single (JSX) |
| Trailing commas | all |
| Semicolons | always |
| Test runner | Vitest (backend + frontend) |
| E2E | Playwright (when browser testing is needed) |

## Git

| Aspect | Value |
|---|---|
| Branches | `staging` (default), `main` (production). See [git-workflow.md](./git-workflow.md). |
| Commit format | Conventional Commits (commitlint enforces) |
| Hooks | lefthook (pre-commit + commit-msg) |
| Pre-commit | biome check + gitleaks |

## Cloud and infrastructure

| Aspect | Value |
|---|---|
| Cloud | Azure |
| Region | `australiaeast` |
| IaC | Bicep via AVM composition. See [infrastructure.md](./infrastructure.md). |
| Resource naming | `{type}-{workload}-{env}`. See [azure-naming.md](./azure-naming.md). |
| Secrets | Four-layer model. See [secrets.md](./secrets.md). |

## Observability

| Aspect | Value |
|---|---|
| Logging | pino (backend), browser-native wrapped (frontend) |
| Tracing | OpenTelemetry, GenAI semantic conventions where applicable |
| Correlation | `x-correlation-id` propagated through all layers |

## Documentation

| Aspect | Value |
|---|---|
| Primary agent file | `AGENTS.md`. See [agents-md.md](./agents-md.md). |
| Doc shapes | Five only. See [docs-shapes.md](./docs-shapes.md). |
| API reference | Auto-generated from code; never hand-maintained |

## Backend archetype defaults

| Choice | Value |
|---|---|
| Sparse APIs / event handlers | Azure Functions v4 |
| Long-running / WebSockets / stateful | Azure Container Apps |
| Static + functions | Azure Static Web Apps + Functions |

## Frontend defaults

| Aspect | Value |
|---|---|
| Build | Vite |
| Framework | React 19 |
| State | Zustand. See [state-management.md](./state-management.md). |
| Auth | MSAL (Entra ID) |
| Routing | TanStack Router |
| Hosting | Azure Static Web Apps |
