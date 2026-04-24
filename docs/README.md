# janus — Documentation

## Decisions
- [ADR Index](./adr/README.md) — canonical decisions that shape janus and every derived project.

## Conventions
- [Conventions Index](./conventions/README.md) — deeper reference on code style, architecture, security, etc.

## Plans
- [Plans Index](./plans/README.md) — implementation plans for janus itself.

## Runbooks
- [Runbooks Index](./runbooks/README.md) — operational procedures.

## Doc shapes

Every file in `docs/` is one of **five shapes** (see [ADR 0006](./adr/0006-documentation-shapes.md)):

| Shape | Where | Template |
|---|---|---|
| README | any dir | — |
| AGENTS.md | repo root + per-package | `/AGENTS.md` in derived projects |
| ADR | `adr/` | [TEMPLATE](./adr/TEMPLATE.md) |
| Plan | `plans/` | [TEMPLATE](./plans/TEMPLATE.md) |
| Runbook | `runbooks/` | [TEMPLATE](./runbooks/TEMPLATE.md) |

Free-form prose dumps are rejected in review.
