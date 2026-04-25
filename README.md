# janus

> *Janus (Roman) — god of beginnings, transitions, and doorways. Two-faced: one looks forward, one looks back.*

Portable project starter kit for TypeScript + Azure solo-dev work. Encodes a deliberate set of conventions so every new project starts from a consistent baseline rather than re-evolving decisions from scratch.

## What's inside

- **`docs/conventions/`** — the rules every janus-derived project inherits (stack, git workflow, naming, secrets, code style, layering, etc.).
- **`docs/adr/`** — architectural decisions specific to janus (rare; conventions cover the baseline).
- **`docs/plans/TEMPLATE.md`** — plan-file shape (dated, phased, with rollback).
- **`docs/runbooks/TEMPLATE.md`** — runbook shape with staleness frontmatter.
- **`templates/`** — per-archetype scaffolds (backend-functions, backend-container-app, frontend-vite-react, generic-ts, types-package, mcp-server, monorepo-root).
- **`templates/_shared/`** — files common to all archetypes (biome, tsconfig base, editorconfig, GitHub workflows, etc.).
- **`scripts/scaffold.sh`** — interactive scaffolder.

## Philosophy

Every new project made from janus inherits a baseline. When it needs to diverge, it does so through an ADR in its own `docs/adr/` — documented, not silent. Conventions evolve via janus releases; projects pick up changes deliberately, not automatically.

**Not** a framework. **Not** a runtime. Only scaffold + conventions + docs.

## Usage

```bash
# Scaffold a new project
cd ~
./janus/scripts/scaffold.sh
```

## Versioning

- **Template version** recorded in each derived project's `docs/adr/` (or root README).
- **Semver** per janus release. Breaking changes → major bump.
- Projects don't auto-update; migration is deliberate and per-project.

See `CHANGELOG.md` for current version.

## License

MIT — see [LICENSE](./LICENSE).
