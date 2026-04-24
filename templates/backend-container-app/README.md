# backend-container-app archetype

Container App for long-running services — WebSockets, pub/sub, stateful, predictable latency.

## Status

**Stub** — scaffold content TODO.

## Planned structure

```
<project>/
├── src/
│   ├── app.ts                   # Fastify / Express / ws bootstrap
│   ├── routes/                  # HTTP route groups
│   ├── ws/                      # WebSocket connection + message routing (optional)
│   ├── services/                # business logic
│   ├── repositories/            # data access
│   ├── middleware/              # auth, correlation, error handling
│   ├── schemas/                 # zod boundaries
│   ├── lib/                     # infrastructure
│   ├── domain/                  # pure types
│   ├── events/                  # pub/sub handlers (Event Grid / Service Bus)
│   └── main.ts                  # entry — config → app → listen → shutdown
├── tests/
├── Dockerfile
├── docker-compose.yml           # local dev (Cosmos emulator, Redis, etc.)
├── package.json
├── tsconfig.json
├── infra/
│   ├── main.bicep               # ACR, CAE, Container App via AVM
│   ├── modules/
│   └── scripts/
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-dev.yml           # docker build → ACR push → revision create
│   ├── deploy-prod.yml
│   ├── infra-preview.yml
│   └── rollback.yml             # revision activate — image-swap model
├── AGENTS.md
├── CLAUDE.md
└── README.md
```

## Planned contents

- **`Dockerfile`** — multi-stage Node 20 Alpine, non-root user, healthcheck.
- **`src/main.ts`** — graceful shutdown on SIGTERM (drain connections).
- **`src/ws/`** — WebSocket connection lifecycle + message router (optional, only for WS workloads).
- **`infra/main.bicep`** — AVM-composed: identity → LAW → AppInsights → KV → ACR → CAE → Container App (single-revision mode, image-swap rollback).
- **`.github/workflows/deploy-{dev,prod}.yml`** — build image, push to ACR, update Container App revision.
- **`.github/workflows/rollback.yml`** — swap image tag to previous via `az containerapp update`.

## See also

- `/home/skip/janus/docs/adr/0004-avm-first-infrastructure.md`
- `/home/skip/janus/docs/conventions/infrastructure.md`
