---
title: Logging & Observability
type: reference
last_reviewed: 2026-04-25
---

# Logging & Observability

Three pillars: structured logs, distributed traces, correlated requests.

## Logging

### Backend

- **Library**: `pino` (fast, structured JSON).
- **Single logger instance** in `lib/logger.ts`; feature code imports from there.
- **Child loggers** per request carry `correlationId`.
- **No `console.log`** in src. Biome `noConsoleLog` warns.
- **Redact paths** (pino `redact`) cover: `password`, `token`, `apiKey`, `authorization`, `secret`, `*.pin`, `ssn`, `cardNumber`.

```ts
// lib/logger.ts
import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { app: config.APP_NAME, env: config.NODE_ENV },
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      '*.password',
      '*.token',
      '*.apiKey',
      'req.headers.authorization',
      '*.secret',
      '*.pin',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

### Frontend

- Browser-native `console.*` methods (no pino in bundle).
- Wrap in a small `logger` object so you can swap for an error-reporting service (Sentry, Application Insights Browser SDK) without touching every call site.

### What to log, at the edges

- **HTTP in**: method, path, query, correlationId, userId (if auth'd). NOT body (may contain secrets).
- **HTTP out**: URL, status, duration, correlationId.
- **Database calls**: operation type + collection/table + duration (sampled).
- **Errors**: full object at `error` level.
- **Business events**: `info` level — order created, user signed up.

**Never log inside tight loops** without sampling. Use structured fields, not string interpolation.

```ts
// Good
req.log.info({ orderId, userId, notional }, 'order created');

// Bad
logger.info(`order ${orderId} created for user ${userId}`);  // unparseable, loses types
```

## Tracing

- **Library**: `@opentelemetry/api` + `@opentelemetry/sdk-node` (backend) + `@opentelemetry/sdk-trace-web` (frontend).
- **Auto-instrumentation**: HTTP, DB, external calls wrapped automatically.
- **Custom spans** for meaningful units of work in services.
- **GenAI semantic conventions** (now stable) for any LLM calls.

```ts
// lib/telemetry.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

- **Exporter**: OTLP gRPC to Application Insights' OTel-native endpoint (Azure) or to a self-hosted collector.
- **Sampling**: 100% in dev, 5-10% head-sampling in prod unless cost becomes an issue.

## Correlation IDs

Every inbound request gets a correlation ID. It propagates:

- **Inbound**: read `x-correlation-id` header; generate UUID v4 if missing.
- **Storage**: on `req.correlationId` and in child logger as `correlationId`.
- **Outbound HTTP**: set `x-correlation-id` on every fetch.
- **DB queries**: include as a comment in SQL or as a property for Cosmos/Table operations.
- **Response**: set `x-correlation-id` so the client knows what to report.
- **Error responses**: include in body so users can cite it to support.

```ts
// middleware/correlation.ts
import crypto from 'node:crypto';

export function correlationMiddleware(req, res, next) {
  const id = req.headers['x-correlation-id'] ?? crypto.randomUUID();
  req.correlationId = id;
  req.log = logger.child({ correlationId: id });
  res.setHeader('x-correlation-id', id);
  next();
}
```

## Metrics

- **Emit minimal custom metrics.** OTel auto-instrumentation covers HTTP latency, DB duration, external calls.
- **Custom metrics** for business signals: orders-created-per-min, errors-per-min, active-users.
- **Names**: `<namespace>.<subject>.<metric>` e.g. `orders.created.count`, `credit.check.latency_ms`.

## Azure-specific

- **Application Insights connection string** via `APPLICATIONINSIGHTS_CONNECTION_STRING` env var (from Key Vault ref).
- **Workspace-based App Insights** only — classic is deprecated.
- **Log Analytics workspace** is the underlying store for both logs and traces.

## Alerts

- **Action groups** configured per env. Prod routes to pager; dev routes to email-only.
- **Alerts created via Bicep** (`avm/res/insights/action-group`, `avm/res/insights/metric-alert`) — not portal-clicked. Survives recreation.
- **SLO-based alerting**: alert on error-rate-burn, not raw error count. See [Google SRE workbook](https://sre.google/workbook/alerting-on-slos/).
