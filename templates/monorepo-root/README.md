# monorepo-root archetype

pnpm workspace orchestrator. Root coordinates child packages under `packages/*`.
Child packages handle their own deployment — the root does not deploy itself.

## What gets scaffolded

```
<workload>/
├── packages/
│   └── example/          # starter package (src/, tests/, tsconfig.json)
├── pnpm-workspace.yaml   # workspace: packages/*
├── package.json          # workspace-wide scripts (build, test, lint, typecheck, dev)
├── tsconfig.base.json    # shared TS config — packages extend this
├── biome.jsonc           # lint/format at root (covers all packages)
├── AGENTS.md             # workspace orientation for Claude
├── CLAUDE.md             # project context
├── .github/workflows/
│   ├── ci.yml            # workspace-wide CI
│   ├── claude.yml        # @claude bot
│   ├── claude-autofix.yml
│   ├── claude-code-review.yml
│   ├── codeql.yml
│   ├── docs-staleness.yml
│   ├── issue-triage.yml
│   └── pr-merge-cleanup.yml
└── docs/
```

## Excluded from _shared

- `infra/` — children own their infra
- `.github/workflows/deploy.yml` — children own deploy
- `.github/workflows/infra-preview.yml` — children own infra preview
- `src/` — root has no source
- `tests/` — root has no tests

## Workspace conventions

- All packages live under `packages/*`.
- Root `package.json` scripts delegate with `pnpm -r`.
- Root `biome.jsonc` covers the entire workspace.
- Each package has its own `tsconfig.json` that extends `../../tsconfig.base.json`.
- Each package declares its own `vitest` and `typescript` devDependencies (pnpm
  isolated node_modules does not hoist them from root).

## Adding a child package

```bash
mkdir -p packages/mylib
# Create packages/mylib/package.json with name @<workload>/mylib
pnpm install   # re-links workspace
```

## See also

- `docs/conventions/layering.md` — per-service layering inside the workspace
