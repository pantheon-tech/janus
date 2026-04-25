# frontend-vite-react archetype

META documentation for the `frontend-vite-react` janus archetype.
This file is NOT shipped into scaffolded projects (excluded by scaffold.sh step 2b.iii).

## What this archetype produces

A React 19 + Vite 7 + Tailwind v4 + MSAL single-page application scaffolded to deploy to Azure Static Web Apps.

## Stack

| Concern | Library | Version pin |
|---|---|---|
| Bundler | Vite | `~7.3.0` |
| Framework | React | `~19.2.0` |
| Styling | Tailwind CSS v4 + `@tailwindcss/vite` | `~4.2.0` |
| Auth | `@azure/msal-browser` + `@azure/msal-react` | `~5.1.0` / `~3.0.0` |
| State | Zustand | `~5.0.5` |
| Tests | Vitest + jsdom + @testing-library/react | `~4.1.5` / `~26.0.0` / `~16.0.0` |
| Lint | Biome v2 (inherited from `_shared`) | `~2.4.13` |
| TypeScript | TS 6 (inherited from `_shared`) | `~6.0.3` |

## Files overlaid by this archetype

| File | Purpose |
|---|---|
| `package.json.tmpl` | Merged over `_shared/package.json.tmpl` via jq deep-merge |
| `tsconfig.json.tmpl` | Replaces `_shared/tsconfig.json.tmpl` — adds DOM lib, react-jsx, bundler resolution |
| `vitest.config.ts.tmpl` | Replaces `_shared/vitest.config.ts.tmpl` — jsdom env, React plugin, setup file |
| `vite.config.ts.tmpl` | Vite 7 config with React + Tailwind plugins |
| `index.html.tmpl` | HTML shell with `<%workload%>` title |
| `src/main.tsx` | React 19 entry: createRoot + MsalProvider |
| `src/App.tsx.tmpl` | Root component greeting with Tailwind classes |
| `src/index.css` | `@import "tailwindcss"` (v4 CSS-first) |
| `tests/App.test.tsx.tmpl` | Smoke test using @testing-library/react |
| `tests/setup.ts` | Vitest setup: imports jest-dom matchers |
| `staticwebapp.config.json` | Azure SWA navigation fallback + security headers |
| `AGENTS.md.tmpl` | Project AGENTS.md with React/MSAL/SWA context |
| `.env.example` | VITE_ env vars appended to shared .env.example |

## Excluded shared files

None — this archetype ships everything from `_shared` including `infra/` and deploy workflows.
SWA deployments use the same `deploy.yml` / `infra-preview.yml` as other archetypes.
No `.exclude` file is needed.

## Key design notes

- **Tailwind v4 CSS-first**: No `tailwind.config.js`. Theme customisation goes in `@theme {}` blocks in CSS.
- **`moduleResolution: bundler`**: Required for Vite. Avoids `.js` extension enforcement that `NodeNext` imposes.
- **MSAL is build-time only**: All `VITE_AZURE_*` variables are baked into the bundle. Not secret, but real values belong in GitHub environment secrets.
- **`noEmit: true` in tsconfig**: Vite owns the build; `tsc --noEmit` is typecheck-only.
- **Biome handles TSX**: The shared `biome.jsonc` has no JSX restrictions — Biome 2.x supports TSX natively.
