# types-package archetype

Pure-types TypeScript package published to GitHub Packages under `@{{github_org}}/` scope.

## Status

**Stub** — scaffold content TODO.

## Planned structure

```
<package>/
├── src/
│   ├── api/                    # HTTP/REST contract types
│   ├── ws/                     # WebSocket message types
│   ├── domain/                 # shared domain types
│   └── index.ts                # public API — the one barrel exception
├── package.json
├── tsconfig.json
├── .npmrc                      # @{{github_org}} → GitHub Packages registry
├── .github/workflows/
│   ├── ci.yml
│   └── publish.yml             # publishes on tag push
├── AGENTS.md
└── README.md
```

## Planned contents

- **Pure types only.** No runtime code. No deps beyond `zod` for schema types.
- **`package.json` `publishConfig`**: `registry: https://npm.pkg.github.com`, `access: restricted`.
- **`.npmrc`** references `${NODE_AUTH_TOKEN}` (never inline).
- **`.github/workflows/publish.yml`** — triggered on `v*` tag, `pnpm publish`.

## See also

- `/home/skip/janus/docs/conventions/code-style.md#imports` — barrel-file policy
