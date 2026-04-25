---
title: Layering
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
---

# Layering

Dependency direction. Non-negotiable for backend; analogous for frontend.

## Backend

```
      ┌─────────────────────┐
      │  Routes / Handlers  │   HTTP entry, validation, response shaping
      └──────────┬──────────┘
                 ▼
      ┌─────────────────────┐
      │      Services       │   Business logic, orchestration
      └──────────┬──────────┘
                 ▼
      ┌─────────────────────┐
      │    Repositories     │   Data access, persistence boundary
      └──────────┬──────────┘
                 ▼
      ┌─────────────────────┐
      │    Data Stores      │   Cosmos, SQL, Storage, external APIs
      └─────────────────────┘
```

### Rules

1. **Dependency direction is one-way down.** Services never import from routes. Repos never import from services.
2. **No skipping layers.** A route never calls a repo directly.
3. **Handlers are thin**: parse request → validate with Zod → call service → map result to response. No business logic.
4. **Services are stateless.** Dependencies taken by constructor / factory parameter — easier to test.
5. **Repositories hide the data store.** Swap Cosmos for Postgres without changing services.
6. **Domain types** live in a `domain/` directory that all layers can import — the one exception to dependency direction.
7. **Cross-cutting infrastructure** (logger, config, auth) lives in `lib/`. All layers can import from `lib/`.

### File structure (single-package backend)

```
src/
├── functions/ or routes/    # HTTP entry per endpoint
├── services/                # business logic
├── repositories/            # data access
├── schemas/                 # Zod schemas at boundaries
├── domain/                  # domain types (pure)
├── lib/                     # infrastructure (config, logger, errors, auth)
└── main.ts                  # entry point
```

## Frontend

```
      ┌─────────────────────┐
      │  Route components   │   Data fetching, top-level composition
      └──────────┬──────────┘
                 ▼
      ┌─────────────────────┐
      │ Feature components  │   UI + feature state
      └──────────┬──────────┘
                 ▼
      ┌─────────────────────┐
      │ lib/api, lib/ws     │   HTTP / WebSocket client
      └──────────┬──────────┘
                 ▼
      ┌─────────────────────┐
      │     Backend API     │
      └─────────────────────┘
```

### Frontend organising principle: feature-sliced

```
src/
├── main.tsx                 # entry
├── App.tsx                  # root composition
├── routes/                  # route-level components
├── features/                # PRIMARY organising principle
│   └── <feature>/
│       ├── components/
│       ├── hooks/
│       ├── api.ts           # HTTP calls specific to this feature
│       ├── store.ts         # Zustand slice if needed
│       ├── schemas.ts       # Zod validation
│       └── types.ts
├── components/
│   └── ui/                  # SHARED primitives only (Button, Modal, Input)
├── lib/                     # domain-agnostic infra
├── stores/                  # GLOBAL stores (connection, theme)
└── hooks/                   # GLOBAL hooks (useAppReady, useWebSocket)
```

### Rules

1. **Feature-sliced at top level.** Each feature owns its UI, state, API calls, types.
2. **`components/ui/` is primitives only.** Buttons, modals, inputs. Feature-specific components live in `features/<feature>/components/`.
3. **`lib/` is infrastructure.** No domain logic.
4. **`stores/` is global only.** Connection status, theme, user session. Feature state lives in feature folders.
5. **No barrel files.** Named imports by path.

## When to switch from layer-slicing to module-slicing (backend)

- Layer-sliced by default (`services/`, `repositories/` as top-level dirs).
- At ~20+ routes, switch to **module-slicing**: each module has its own layers.

```
src/
├── modules/
│   ├── orders/
│   │   ├── orders.routes.ts
│   │   ├── orders.service.ts
│   │   ├── orders.repo.ts
│   │   ├── orders.schema.ts
│   │   └── index.ts         # public API of the module
│   ├── users/
│   └── billing/
├── lib/
└── main.ts
```

Module slicing scales; layer slicing doesn't past ~20 routes.

## Folder rules

- **Prefix-as-subdirectory.** Prefer `services/orders/create.ts` + `services/orders/list.ts` over `services/orders-create.ts` + `services/orders-list.ts` at the same level.
- **One export per file** for services and repositories.
- **Tests co-located** next to source: `orders.service.ts` + `orders.service.test.ts`.

## Integration tests follow layer boundaries

- **Unit**: services, with mocked repositories.
- **Integration**: services + real data store (Cosmos emulator / test container).
- **Contract**: frontend ↔ backend wire types match (shared `@scope/types` package imported by both).
- **E2E**: Playwright through real ingress.
