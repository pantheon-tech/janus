---
title: Secret Management
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
---

# Secret Management

Four layers. No cross-contamination. Each secret has exactly one source of truth.

## Layer 1 — Runtime (production / staging apps)

- **Store**: Azure Key Vault.
- **Access**: user-assigned managed identity with RBAC role `Key Vault Secrets User` (or `Key Vault Secrets Officer` for write).
- **Consumption**:
  - Container Apps: `keyvaultref://` references in `secrets:` block.
  - Function Apps: Key Vault references in app settings via managed identity.
  - APIM: named values backed by Key Vault.
- **Rotation**: change in Key Vault. Container Apps auto-refresh; Function Apps need restart.
- **Network (prod)**: `defaultAction: Deny` + private endpoint. The `AzureServices` bypass does not cover Container Apps.

## Layer 2 — CI / CD

- **Store**: GitHub environment secrets (per environment: `staging`, `prod`).
- **Auth to Azure**: OIDC federation. No `AZURE_CREDENTIALS` JSON.
- **Federated credentials per service principal**: two — one for `environment:<env>` deploy, one for `pull_request` for what-if preview.
- **Repo-level secrets**: only for cross-environment tooling (e.g. `CLAUDE_CODE_OAUTH_TOKEN`). Never for cloud auth.

## Layer 3 — Developer-local

- **Store**: `.env.local` file, gitignored.
- **Template**: `.env.example` committed, every variable documented.
- **Bootstrap**: `infra/scripts/populate-secrets.sh` reads `.env.example` and seeds the matching Key Vault.
- **Optional**: `direnv` via `.envrc` loads `.env.local` on `cd`.

## Layer 4 — Private package registry

- **Store**: `.npmrc` references `${NODE_AUTH_TOKEN}` env var.
  ```
  @<org>:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
  ```
- **Local**: `${NODE_AUTH_TOKEN}` from a password manager or 1Password CLI.
- **CI**: GitHub Actions provides `secrets.GITHUB_TOKEN` with `packages: read`, or `${{ secrets.ORG_PACKAGES_TOKEN }}` for cross-org.
- **Never commit a literal token.**

## Rules

- A secret never lives in two layers simultaneously. Pick the source layer; other layers reference it.
- Never log secrets. pino `redact` paths cover `password`, `token`, `apiKey`, `authorization`, `secret`.
- gitleaks runs in pre-commit; CodeQL secret-scanning runs in CI.
- `.gitignore` covers `.env*` with `!.env.example` whitelist.

## Pre-existing leak protocol

If a secret hits source control:

1. Rotate the secret immediately at its source.
2. Remove from git history (`git filter-repo` or BFG Repo-Cleaner).
3. Force-push and notify any collaborators to re-clone.
4. Audit access logs at the secret's source (GitHub token audit, Key Vault audit, etc.).
5. Open an incident runbook documenting timeline and remediation.

## Rotation

See [docs/runbooks/rotate-secrets.md](../runbooks/rotate-secrets.md).
