---
title: Performance Budgets
type: reference
last_reviewed: 2026-04-22
owners: []  # add owners for this project
---

# Performance Budgets

> **Status: stub.** Conventions sketched below; canonical content TBD.

Targets for frontend, backend, and cloud-cost performance. Enforced by CI checks where mechanical; reviewed at PR otherwise.

## Frontend — Core Web Vitals

TODO. Anticipated content:

- **LCP** ≤ 2.5s (P75 on mid-tier mobile).
- **INP** ≤ 200ms.
- **CLS** ≤ 0.1.
- **TTFB** ≤ 800ms.
- Bundle-size budget per route (initial JS gzipped target).
- Lighthouse CI integration on PR with thresholds.

## Backend — latency budgets

TODO. Anticipated content:

- API P50 / P95 / P99 budgets per endpoint class (read-only / mutating / fan-out).
- Dependency-call timeout policy.
- Cold-start budget for Function Apps / scale-to-zero Container Apps.
- Database query SLO (slow-query threshold + alerting).

## Throughput

TODO. Anticipated content:

- Per-instance request-rate target.
- Backpressure / queue-depth thresholds.
- Load-test cadence (release-gate vs nightly).

## Cost budgets

TODO. Anticipated content:

- Per-environment monthly cost ceiling.
- Cost-per-request target for revenue workloads.
- Idle-resource auditing (scale-to-zero where supported, cleanup runbook for orphans).

## Measuring

TODO. Anticipated content:

- App Insights for backend latency.
- Real User Monitoring (RUM) for frontend Core Web Vitals.
- Azure Cost Management exports → Log Analytics for cost trending.

## See also

- [`alerting.md`](./alerting.md) — burn-rate alerts when budgets are breached.
- [`logging.md`](./logging.md) — request-duration logging conventions.
