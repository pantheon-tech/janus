# frontend-vite-react archetype

Vite + React + TypeScript + MSAL → deployed to Azure Static Web Apps.

## Status

**Stub** — scaffold content TODO.

## Planned structure

```
<project>/
├── src/
│   ├── main.tsx                 # Vite entry
│   ├── App.tsx                  # root composition, auth gate
│   ├── routes/                  # route-level components (TanStack Router)
│   ├── features/                # FEATURE-SLICED (primary)
│   │   └── <feature>/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── api.ts
│   │       ├── store.ts         # Zustand slice
│   │       ├── schemas.ts       # zod
│   │       └── types.ts
│   ├── components/
│   │   └── ui/                  # SHARED primitives only
│   ├── lib/
│   │   ├── api/                 # HTTP client, error mapping
│   │   ├── ws/                  # WebSocket client (optional)
│   │   ├── auth/                # MSAL wrapper
│   │   ├── config.ts            # zod-validated VITE_* env
│   │   ├── errors.ts
│   │   └── logger.ts
│   ├── stores/                  # GLOBAL stores (connection, theme)
│   └── hooks/                   # GLOBAL hooks
├── public/
├── tests/
│   ├── unit/                    # vitest
│   └── e2e/                     # Playwright
├── index.html
├── vite.config.ts
├── playwright.config.ts
├── tsconfig.json
├── package.json
├── staticwebapp.config.json     # CSP, HSTS, auth provider, route roles
├── infra/
│   ├── main.bicep               # SWA + custom domain + App Insights
│   ├── modules/
│   └── scripts/
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-staging.yml       # azure/static-web-apps-deploy@v1
│   └── deploy-prod.yml
├── AGENTS.md
├── CLAUDE.md
└── README.md
```

## Planned contents

- **`vite.config.ts`** — React plugin, Tailwind (optional), `/api` proxy to Azure Functions `localhost:7071` in dev.
- **`staticwebapp.config.json`** — CSP strict, HSTS preload, MSAL login redirect, route roles.
- **`src/lib/auth/`** — MSAL v4 setup, AuthGate component, token acquisition wrapped for fetch.
- **`src/lib/config.ts`** — zod-validated `VITE_*` env block.
- **`infra/main.bicep`** — AVM-composed SWA + App Insights.

## See also

- `/home/skip/janus/docs/conventions/layering.md#frontend`
- `/home/skip/janus/docs/conventions/state-management.md`
