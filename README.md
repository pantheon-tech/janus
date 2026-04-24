# janus

> *Janus (Roman) — god of beginnings, transitions, and doorways. Two-faced: one looks forward, one looks back.*

**janus** is a portable project starter kit for TypeScript + Azure solo-developer work. It encodes a deliberate set of conventions — naming, structure, tooling, documentation — so every new project starts from a consistent, evidence-backed baseline rather than re-evolving decisions from scratch.

---

## What's inside

- **`docs/adr/`** — the canonical decisions. `0001-stack-choices.md` is the source of truth for every convention.
- **`docs/conventions/`** — deeper reference material on code style, architecture, layering, error handling, logging, testing, security, and Azure naming.
- **`docs/plans/TEMPLATE.md`** — the plan-file shape (dated, phased, with rollback).
- **`docs/runbooks/TEMPLATE.md`** — the runbook shape (prereqs / steps / verify / rollback / staleness frontmatter).
- **`templates/`** — per-archetype scaffolds (backend-functions, backend-container-app, frontend-vite-react, types-package, mcp-server, monorepo-root).
- **`templates/_shared/`** — files common to all archetypes (biome config, tsconfig base, editorconfig, etc.).
- **`scripts/scaffold.sh`** — interactive scaffolder that copies template into a new project directory with slot substitution.

---

## Philosophy

Every new project made from janus inherits a baseline. When it needs to diverge, it does so through an ADR in its own `docs/adr/` — documented, not silent. When three projects diverge the same way, that signal flows back into janus.

**Not** a framework. **Not** a runtime. Only scaffold + conventions + docs.

---

## Usage

```bash
# Scaffold a new project
cd ~
./janus/scripts/scaffold.sh

# Prompts for:
#   - Project name (slug for Azure resources)
#   - Archetype: backend-functions | backend-container-app | frontend-vite-react | monorepo | types-package | mcp-server
#   - Deploy target (if backend): container-app | functions | swa+functions
#   - Environments to scaffold: dev | dev+prod | dev+staging+prod
#   - Optional: --conductor flag for conductor/ directory

# Output: ~/git/<name>/ with the archetype in place, initial git commit ready.
```

---

## Versioning

- **Template version** recorded in each derived project's `docs/adr/0001-stack-choices.md`.
- **Semver** per janus release. Breaking changes → major bump.
- **Projects don't auto-update**. Migration is deliberate per-project, tracked in the project's own ADRs.

---

## Current version

See `CHANGELOG.md`. Template version is surfaced via `scripts/version.sh`.

---

## License

MIT — see [LICENSE](./LICENSE).
