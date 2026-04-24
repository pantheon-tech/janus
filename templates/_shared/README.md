# _shared/

Files common to all archetypes. The scaffold script applies these first; per-archetype files overlay.

## Contents

| File / dir | Purpose |
|---|---|
| `.editorconfig` | Cross-editor formatting defaults (2 spaces, LF, final newline) |
| `.gitattributes` | LF line endings, lockfile merge strategy |
| `.gitignore` | Comprehensive ignore patterns with `.env` whitelist |
| `.nvmrc` / `.node-version` | Node 20 pin |
| `biome.jsonc` | Biome v2 config with janus defaults (printWidth 100, etc.) |
| `tsconfig.base.json` | Strict TypeScript settings |
| `lefthook.yml` | Pre-commit + commit-msg hooks |
| `commitlint.config.js` | Conventional Commits enforcement |
| `LICENSE` | MIT template (slot-substituted year + author) |
| `CODEOWNERS` | `* @{{github_org}}` default |
| `SECURITY.md` | Vuln disclosure template |
| `AGENTS.md.tmpl` | 7-section agent-context template |
| `CLAUDE.md.tmpl` | Thin pointer template |
| `README.md.tmpl` | Human quickstart template |
| `docs/` | Documentation scaffold (ADR, plans, runbooks templates) |
| `.github/` | Workflows, PR template, issue templates, dependabot |
| `.claude/` | Hooks, skills, settings |
| `.env.example` | Starter env file |
