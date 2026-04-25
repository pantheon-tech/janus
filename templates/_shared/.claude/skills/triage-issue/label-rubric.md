# Issue Triage Rubric

This rubric is **project-specific** in the Component table only — populate it with your project's modules. The Type, Priority, Difficulty, Effort, Environment, and Milestone tables below are janus convention and apply to every project.

## Component Labels

Populate this table with your project's modules. Map file path prefixes / keywords → component label. Example for a backend+frontend monorepo:

| Path prefix / keyword | Label |
|---|---|
| `backend/src/`, server, API, route | `backend` |
| `frontend/src/`, UI, component, React | `frontend` |
| `shared/`, types, models | `shared` |
| `infra/`, Bicep, Container App, Azure resource | `infra` |
| `.github/`, CI, deploy, workflow, pipeline | `devops` |
| `docs/`, documentation, user guide | `documentation` |

Multiple components can apply. If no component is determinable, flag as `needs-triage`.

## Type Labels (universal)

| Signal | Label |
|---|---|
| Something broken, error, crash, incorrect behaviour | `bug` |
| New feature, improvement, "should do X" | `enhancement` |
| Vulnerability, CVE, static-analysis finding, injection, auth issue | `security` |
| Docs stale, missing page, typo in docs | `documentation` |
| Slow, latency, memory, bundle size | `performance` |
| Test missing, flaky, coverage gap | `testing` |
| Found during code review, has PR reference | `code-review` |

## Priority Labels (universal)

| Priority | Criteria |
|---|---|
| `P0: critical` | Production outage, active security exploit, data corruption |
| `P1: high` | Security finding (any env), data correctness bug, blocks users, on `main`/`staging` |
| `P2: medium` | Enhancement, non-critical bug, warning-level finding, dev-only issues |
| `P3: low` | Nit, polish, nice-to-have, code style |

**Environment escalation:** A finding on `main` bumps priority by one level (P2 → P1, P3 → P2).

## Difficulty Scale (complexity of the fix)

| Score | Description |
|---|---|
| 1–3 | Isolated change, single file, clear fix |
| 4–6 | Multi-file change, moderate complexity, needs understanding of module |
| 7–9 | Cross-component, architectural implications, needs design thought |
| 10 | Fundamental redesign required |

## Effort Scale (time to implement)

| Score | Description |
|---|---|
| 1–3 | Under 2 hours |
| 4–6 | Half day to full day |
| 7–9 | Multi-day effort |
| 10 | Week or more |

## Milestone Assignment

| Signal | Milestone |
|---|---|
| `security` label | `Security` |
| `code-review` label | `Code Quality` |
| `documentation` label | `Documentation` |
| `performance` label | `Performance` |
| `testing` label | `Testing` |
| Component-only (no type signal) | Component milestone (matching the component label) |

## Environment Labels

| Signal | Label |
|---|---|
| PR targets `main`, mentions "production", "prod" | `env:prod` |
| PR targets `staging`, mentions "staging" | `env:staging` |
| Default, PR targets `staging`, no branch context | `env:dev` |
| Static-analysis issue — determined by sync workflow | (already set) |
