# Conventions

Deeper reference material on how to build. ADRs are the WHY; these are the HOW.

## Index

| Chapter | Topic |
|---|---|
| [code-style.md](./code-style.md) | Formatting, naming, imports, quotes, line width |
| [layering.md](./layering.md) | Dependency direction, routes → services → repositories |
| [error-handling.md](./error-handling.md) | Domain errors returned, infrastructure errors thrown |
| [logging-observability.md](./logging-observability.md) | pino, OpenTelemetry, correlation IDs |
| [testing.md](./testing.md) | Pyramid, Vitest, Playwright, real-vs-mocked |
| [security.md](./security.md) | Managed identity, default-deny, secret scanning |
| [azure-naming.md](./azure-naming.md) | Full naming convention (reference) |
| [infrastructure.md](./infrastructure.md) | AVM composition pattern, escape hatches |
| [state-management.md](./state-management.md) | Zustand + surgical selectors (frontend) |
| [documentation.md](./documentation.md) | The five doc shapes, docs-as-code, drift detection |

## Source

These chapters are authorised by ADRs in [../adr/](../adr/). When a convention changes, the flow is:

1. Open a new ADR superseding the relevant section.
2. Update the corresponding `docs/conventions/*.md` chapter.
3. Cross-reference both.
