# backend-functions archetype

Azure Functions v4 (Node.js, isolated worker, Programming Model v4) HTTP backend.
Ships with infra, deploy, and infra-preview GitHub Actions workflows.

## When to pick this archetype

Choose `backend-functions` when you need:

- A lightweight HTTP API, webhook handler, or event processor on Azure
- Serverless/consumption-based billing (pay-per-execution)
- No long-lived connections (use `backend-container-app` for WebSockets or SSE)
- Rapid vertical scaling without managing containers or clusters

## What it ships

| File / directory | Purpose |
|---|---|
| `src/functions/health.ts` | Example HTTP trigger using `app.http()` |
| `tests/health.test.ts` | Vitest unit test for the health handler |
| `host.json` | Azure Functions runtime config (v2 schema, extension bundle 4.x) |
| `local.settings.json.example` | Local dev settings template (gitignored after copy) |
| `package.json` overlay | Adds `@azure/functions`, `tsup`, `main` glob, `build`/`dev`/`start` scripts |
| `AGENTS.md` | AI-agent context: stack, commands, critical invariants |
| `infra/` (from `_shared`) | Bicep + AVM composition — Function App module included |
| `.github/workflows/deploy.yml` | OIDC-based staging + prod deploy |
| `.github/workflows/infra-preview.yml` | What-if infra preview on PRs |

## Promoted structure

```
<project>/
├── src/
│   └── functions/              # one file per HTTP function (or logical group)
│       └── health.ts           # exports healthHandler + calls app.http()
├── tests/
│   └── health.test.ts          # import handler directly for unit tests
├── host.json
├── local.settings.json         # gitignored — copied from .example
├── local.settings.json.example
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── infra/
│   ├── main.bicep
│   └── modules/
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy.yml
│   └── infra-preview.yml
├── AGENTS.md
└── README.md
```

## Programming Model v4 primer

v4 is the current (default) Node.js programming model for Azure Functions. Key points:

- **No `function.json`** — bindings are declared in code via `app.http()`, `app.timer()`, etc.
- **Entry point via `main`** — `package.json` `"main": "dist/functions/*.js"` tells the runtime
  which compiled files to load. Always build before `func start`.
- **Handler isolation** — export the handler function separately from the `app.http()` call so
  Vitest can import and test it without triggering registration side effects.

## Status

Ready — smoke test passes. All archetype files, infra, and workflows are scaffolded.

## Node version note

`local.settings.json.example` sets `FUNCTIONS_NODE_RUNTIME: "22"`. This is intentional: Azure Functions currently supports Node.js up to v22 LTS for the deployed runtime. The janus project baseline requires `node >= 24` for local development (tooling, type generation, etc.), which is fine — the `FUNCTIONS_NODE_RUNTIME` setting only governs what the Function App runtime uses in Azure. Run `node --version` locally and expect v24+; the deployed app runs on Node 22.

## Local dev prerequisites

```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

Then:

```bash
cp local.settings.json.example local.settings.json
# edit: set AzureWebJobsStorage = "UseDevelopmentStorage=true" or a real connection string
pnpm build && pnpm start
# or
pnpm dev  # tsup --watch & func start (concurrent)
```

## Promotion path

| From | To | Why |
|---|---|---|
| `generic-ts` | `backend-functions` | Project outgrows a library; needs an HTTP surface |
| `backend-functions` | `backend-container-app` | Needs WebSockets, long-running processes, or custom runtimes |

## See also

- `docs/conventions/layering.md` — backend layering rules
- `docs/conventions/error-handling.md` — domain/infra error split
- `docs/conventions/logging.md` — pino + OTel setup
- [Azure Functions Node.js developer guide](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node)
- [Migrate to v4 programming model](https://learn.microsoft.com/en-us/azure/azure-functions/functions-node-upgrade-v4)
