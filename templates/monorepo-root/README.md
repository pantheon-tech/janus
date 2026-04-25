# monorepo-root archetype

pnpm workspace orchestrator. References other archetypes as packages.

## Status

**Stub** — scaffold content TODO.

## Planned structure

```
<monorepo>/
├── apps/
│   ├── api/                    # backend (functions or container-app archetype)
│   └── web/                    # frontend (vite-react archetype)
├── packages/
│   ├── types/                  # types-package archetype (shared wire types)
│   ├── logger/                 # shared logger setup (optional)
│   └── errors/                 # shared error classes (optional)
├── infra/                      # cross-service infra (shared KV, ACR, CAE)
│   ├── main.bicep
│   └── modules/
├── pnpm-workspace.yaml
├── package.json                # workspace root — scripts delegate with --filter
├── tsconfig.base.json
├── biome.jsonc
├── .github/workflows/
│   ├── ci.yml                  # path-filtered changes job + per-package matrix
│   └── deploy-{staging,prod}.yml
├── AGENTS.md                   # root — links to per-package AGENTS.md
├── CLAUDE.md
└── README.md
```

## Planned contents

- **`pnpm-workspace.yaml`**: `apps/*`, `packages/*`.
- **Root `package.json` scripts** delegate to packages via `pnpm --filter`.
- **`.github/workflows/ci.yml`** uses `dorny/paths-filter` to detect which packages changed, runs matrix CI per package.
- **Shared `@{{github_org}}/types`** is the contract between backend and frontend.
- **Turborepo** is NOT included by default — add only if > 10 packages or build cache becomes useful.

## Composition with other archetypes

The scaffold composes:
1. `_shared/` overlay first (root config files).
2. `monorepo-root/` overlay (workspace config).
3. For each `apps/<name>/`: apply the chosen archetype (`backend-functions` or `frontend-vite-react` etc.).
4. For each `packages/<name>/`: apply `types-package` or appropriate shared-lib template.

## See also

- `/home/skip/janus/docs/conventions/layering.md` — per-service layering inside the monorepo
