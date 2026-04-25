---
title: Conventions
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
---

# Conventions

Reference chapters describing how janus-derived projects are built. The
conventions are the HOW; project-specific architectural decisions live in each
project's own `docs/adr/`.

## Index

| Chapter | Topic |
|---|---|
| [agents-md.md](./agents-md.md) | `AGENTS.md` shape, length caps, emphasis rules |
| [alerting.md](./alerting.md) | Alerting strategy (stub) |
| [avm-versions.md](./avm-versions.md) | Pinned AVM module versions (refresh recipe) |
| [azure-naming.md](./azure-naming.md) | Full Azure resource naming reference |
| [code-style.md](./code-style.md) | Formatting, naming, imports, quotes, line width |
| [dependencies.md](./dependencies.md) | Dependency management policy (stub) |
| [docs-shapes.md](./docs-shapes.md) | The doc shapes, lifecycle, length caps |
| [error-handling.md](./error-handling.md) | Domain errors returned, infra errors thrown |
| [frontend-state-management.md](./frontend-state-management.md) | Zustand + surgical selectors (frontend) |
| [git-workflow.md](./git-workflow.md) | Two-branch model, integration, release-please |
| [infrastructure.md](./infrastructure.md) | AVM composition pattern, escape hatches |
| [layering.md](./layering.md) | Routes → services → repositories direction |
| [logging.md](./logging.md) | pino, OpenTelemetry, correlation IDs |
| [performance.md](./performance.md) | Performance budgets (stub) |
| [secrets.md](./secrets.md) | Four-layer secret model, KV, OIDC |
| [security.md](./security.md) | Managed identity, default-deny, scanning |
| [stack.md](./stack.md) | Canonical stack choices |
| [testing.md](./testing.md) | Pyramid, Vitest, Playwright, real-vs-mocked |

## Source of authority

These chapters evolve with the kit itself. Updates ship as part of janus
releases (see [git-workflow.md](./git-workflow.md)) — there is no separate
authorisation step.

## Deviating in a derived project

If a derived project needs to depart from a janus convention, that decision is
recorded in **the derived project's own** `docs/adr/`, citing the convention
chapter being overridden and the janus template version in effect at the time.
The convention chapters here remain unchanged; janus's `docs/adr/` is reserved
for janus-specific architectural decisions, not for tracking derived-project
exceptions.
