# janus

Portable project starter kit for TypeScript + Azure solo-dev work. Encodes conventions so new projects inherit a baseline instead of re-evolving decisions.

## Tech Stack

This repo itself has minimal runtime — it's docs, ADRs, and template files. The dev-tooling here:

- Package manager: **pnpm**
- Runtime: Node 20
- Lint+format: **Biome v2**
- Git hooks: **lefthook** (gitleaks + biome)
- Commit: Conventional Commits via commitlint

## Commands

```bash
pnpm install              # dev-only deps (biome, commitlint, lefthook)
pnpm lint                 # biome check
pnpm format               # biome format --write
pnpm check                # biome check + format diff

./scripts/scaffold.sh     # scaffold a new project from templates/
./scripts/version.sh      # print janus version
```

## Structure

```
janus/
├── docs/
│   ├── adr/              — canonical decisions (0001 is the baseline)
│   ├── plans/            — implementation plans (for janus itself)
│   ├── runbooks/         — ops procedures
│   └── conventions/      — deeper style and architecture reference
├── templates/
│   ├── _shared/          — files common to all archetypes
│   ├── backend-functions/          — Azure Functions v4 + Node 20
│   ├── backend-container-app/      — Container App + persistent service
│   ├── frontend-vite-react/        — Vite + React + MSAL + SWA
│   ├── types-package/              — shared wire-types package
│   ├── mcp-server/                 — stdio MCP server
│   └── monorepo-root/              — pnpm workspace orchestrator
└── scripts/
    └── scaffold.sh       — interactive scaffolder
```

## Critical Context

- **ADR 0001 is the source of truth.** Every convention lives there or is linked from there. Changes to conventions require a new ADR superseding the relevant section.
- **Templates are renderable** — placeholders use `{{snake_case}}` syntax. Non-template files in `templates/` are copied verbatim.
- **`_shared/` takes precedence** when merging into an archetype — shared files override per-archetype files if both exist.
- **Conductor pattern is opt-in** (`--conductor` flag) — not a default, per R3 synthesis.
- **Template version is recorded** in each derived project's ADR 0001 for migration traceability.

## Design Decisions

See `docs/adr/`:
- 0001 — Stack choices (the full list)
- 0002 — Azure resource naming
- 0003 — Secret management (four-layer model)
- 0004 — AVM-first infrastructure
- 0005 — AGENTS.md primary, CLAUDE.md pointer
- 0006 — Documentation shapes (five and only five)

## Known Issues

- (2026-04-24) Archetype template contents are stubbed — see each `templates/<archetype>/README.md` for status.
- (2026-04-24) `scripts/scaffold.sh` is placeholder; first implementation TODO.

---

*Last reviewed: 2026-04-24*
