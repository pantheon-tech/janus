# janus — Documentation

## Conventions
- [Conventions Index](./conventions/README.md) — base rules every derived project inherits (stack, git workflow, naming, secrets, code style, layering, etc.).

## Decisions
- [ADR Index](./adr/README.md) — janus-specific architectural decisions (rare; conventions cover the baseline).

## Plans
- [Plans Index](./plans/README.md) — implementation plans for janus itself.

## Runbooks
- [Runbooks Index](./runbooks/README.md) — operational procedures.

## Doc shapes

Every file in `docs/` is one of **six shapes** (see [docs-shapes](./conventions/docs-shapes.md)):

| Shape | Where | Template |
|---|---|---|
| README | any dir | — |
| AGENTS.md | repo root + per-package | `/AGENTS.md` |
| ADR | `adr/` | [TEMPLATE](./adr/TEMPLATE.md) |
| Plan | `plans/` | [TEMPLATE](./plans/TEMPLATE.md) |
| Runbook | `runbooks/` | [TEMPLATE](./runbooks/TEMPLATE.md) |
| Reference | `conventions/`, `architecture.md` | — |

Free-form prose is rejected in review.
