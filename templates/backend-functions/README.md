# backend-functions archetype

Azure Functions v4 (Node 20) for sparse APIs, webhooks, event handlers.

## Status

**Stub** — scaffold content TODO. First implementation priority.

## Planned structure

```
<project>/
├── src/
│   ├── functions/              # handlers — one per HTTP function
│   │   ├── orders-create.ts
│   │   ├── orders-get.ts
│   │   └── events-handler.ts
│   ├── services/               # business logic
│   ├── repositories/           # data access (Cosmos / Table / SQL)
│   ├── schemas/                # zod schemas
│   ├── lib/                    # config, logger, errors, auth, db client
│   ├── domain/                 # pure domain types
│   └── main.ts                 # optional bootstrap
├── tests/
│   ├── unit/                   # mock repos
│   ├── integration/            # real DB (emulator)
│   └── fixtures/
├── host.json
├── local.settings.json          # gitignored
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── infra/                       # Bicep + AVM composition
│   ├── main.bicep
│   ├── modules/
│   └── scripts/
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-dev.yml
│   ├── deploy-prod.yml
│   └── infra-preview.yml
├── AGENTS.md
├── CLAUDE.md
└── README.md
```

## Planned contents

- **`host.json`** — Functions runtime config (Node 20, Flex Consumption plan defaults).
- **`src/functions/`** — one file per HTTP endpoint, using `app.http()` pattern.
- **`src/lib/`** — config loader (zod-validated env), pino logger, AppError hierarchy, Cosmos/Table client singleton, MSAL token verify middleware.
- **`infra/main.bicep`** — AVM-composed: managed identity → Log Analytics → App Insights → Key Vault → Storage (required for Functions) → Function App (Flex Consumption).
- **`.github/workflows/deploy-{dev,prod}.yml`** — OIDC federated, `func azure functionapp publish` via CLI.

## See also

- `/home/skip/janus/docs/conventions/layering.md` — backend layering rules
- `/home/skip/janus/docs/conventions/error-handling.md` — domain/infra error split
- `/home/skip/janus/docs/conventions/logging-observability.md` — pino + OTel setup
