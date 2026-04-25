# backend-container-app archetype

Long-running Express 5 + ws server — WebSockets, stateful workloads, predictable latency.
Deploys as an Azure Container App.

## When to pick this

- You need a persistent server (WebSockets, SSE, long-poll, connection-pool fan-out).
- Workload is stateful or latency-sensitive in a way Functions cannot accommodate.
- You need full control over the process lifecycle (custom signal handling, connection draining).
- You want predictable scaling with minimum-replica guarantees.

Do not pick this for short-lived APIs that are invoked infrequently — `backend-functions` is cheaper at low traffic.

## What it ships

- **`src/server.ts`** — Express 5 app + ws server. GET /health → `{status:'ok'}`, ws upgrade on /ws (echo stub), pino structured logging, SIGTERM graceful shutdown.
- **`tests/server.test.ts`** — supertest /health assertion (runs under Vitest).
- **`Dockerfile`** — multi-stage Node 24 slim. Builder stage compiles via tsup; runtime stage runs as non-root user. EXPOSE 3000.
- **`infra/main.bicep`** — AVM-composed: identity → LAW → AppInsights → KV → ACR → Container App.
- **`.github/workflows/deploy.yml`** — build image, push to ACR, update Container App revision. Branch-aware: staging push → staging env; main push → prod (gated).
- Full shared base: Biome v2, Vitest, lefthook, Conventional Commits, CI, CodeQL, issue triage.

## Status

**Ready.** Scaffolded projects install, typecheck, lint, test, and build out of the box.

## Structure

```
<workload>/
├── src/
│   └── server.ts          # HTTP + WebSocket bootstrap, health route, graceful shutdown
├── tests/
│   └── server.test.ts     # supertest /health
├── Dockerfile
├── infra/
│   ├── main.bicep
│   ├── modules/           # identity, monitoring, keyvault, registry, container-app
│   └── scripts/           # setup-oidc.sh, health-check.sh, populate-secrets.sh
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy.yml
│       ├── infra-preview.yml
│       └── claude-autofix.yml
├── docs/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── biome.jsonc
└── vitest.config.ts
```

## Promotion path

This archetype already ships full Azure infra + deploy pipeline. If the workload later
needs a frontend, add `frontend-vite-react` as a sibling package in a `monorepo-root` workspace.

## See also

- `docs/conventions/stack.md` — canonical version table
- `docs/conventions/infrastructure.md` — Bicep / AVM patterns
- `docs/conventions/avm-versions.md` — pinned AVM module versions
