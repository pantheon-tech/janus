---
title: Alerting
type: reference
last_reviewed: 2026-04-22
---

# Alerting

> **Status: stub.** Conventions sketched below; canonical content TBD.

How janus projects define, route, and act on alerts. Distinct from passive logging — alerts wake humans (or pages bots) when SLOs degrade.

## Sources

TODO. Anticipated content:

- **Application Insights metric alerts** — failure rate, P95 latency, dependency timeouts.
- **Log Analytics alerts** — KQL-based, for cross-cutting patterns (auth-failure spikes, 5xx clusters).
- **Resource health alerts** — Azure platform incidents.
- **Synthetic / availability tests** — uptime checks against `/health`.
- **Cost alerts** — budget thresholds via Cost Management.

## Action groups

TODO. Anticipated content:

- One action group per environment (`ag-<workload>-<env>`) with the on-call list.
- Severity routing (Sev 1 → page; Sev 2 → email + Slack; Sev 3 → ticket only).
- Webhook integration with incident-management tooling.

## SLO burn-rate alerts

TODO. Anticipated content:

- Multi-window burn-rate alerting (per Google SRE workbook): 1h burn ≥ 14.4× and 6h burn ≥ 6× → page.
- SLO definitions live alongside the workload (e.g. `infra/slo.yml`).
- Burn-rate calc via Log Analytics scheduled queries.

## Suppression / maintenance windows

TODO. Anticipated content:

- Suppressing alerts during planned deploys.
- Per-environment severity (prod pages, staging emails, dev silent).

## Alert hygiene

TODO. Anticipated content:

- No noisy alerts — every page must be actionable.
- Quarterly review of alert volume vs. signal.
- Postmortem-driven alert refinement.

## See also

- [`logging.md`](./logging.md) — what to log so alerts have context.
- [`infrastructure.md`](./infrastructure.md) — diagnostic settings → LAW for alert sources.
