# Templates

Per-archetype scaffolds. The scaffold script composes these into a new project.

## Archetypes

| Archetype | Purpose | Status |
|---|---|---|
| [`_shared/`](./_shared/) | Files common to all archetypes (biome, tsconfig, editorconfig, docs templates) | ready |
| [`backend-functions/`](./backend-functions/) | Azure Functions v4 (Node 20) — sparse APIs, webhooks, event handlers | stub |
| [`backend-container-app/`](./backend-container-app/) | Container App — long-running service, WebSockets, stateful | stub |
| [`frontend-vite-react/`](./frontend-vite-react/) | Vite + React + TypeScript + MSAL → Static Web App | stub |
| [`types-package/`](./types-package/) | Pure-types package published to GitHub Packages | stub |
| [`mcp-server/`](./mcp-server/) | Stdio MCP server (one tool per file) | stub |
| [`monorepo-root/`](./monorepo-root/) | pnpm workspace orchestrator (references other archetypes as packages) | stub |

## Composition

- **`_shared/` is always applied first** (base layer).
- **Per-archetype files overlay** on top of `_shared/`.
- **Slot substitution** uses `{{snake_case}}` syntax in template filenames and contents.

## Slot variables

| Slot | Example | Source |
|---|---|---|
| `{{workload}}` | `myapp` | scaffold prompt |
| `{{env_default}}` | `dev` | scaffold prompt |
| `{{environments}}` | `dev,prod` | scaffold prompt |
| `{{description}}` | `"Trading platform API"` | scaffold prompt |
| `{{year}}` | `2026` | auto |
| `{{date}}` | `2026-04-24` | auto |
| `{{template_version}}` | `v0.1.0` | auto from janus |
| `{{archetype}}` | `backend-functions` | scaffold prompt |
| `{{github_org}}` | `skipnz` | `git config` or prompt |
| `{{node_version}}` | `20` | default |
| `{{license}}` | `MIT` | default |

## Adding a new archetype

1. Create `templates/<name>/`.
2. Scaffold files with slot placeholders.
3. Update this README's table.
4. Update `scripts/scaffold.sh` to recognise the new archetype.
5. Open an ADR documenting the new archetype's purpose.
