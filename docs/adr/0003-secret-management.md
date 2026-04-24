# 0003 — Secret Management — Four-Layer Model

- **Status**: accepted
- **Date**: 2026-04-24
- **Deciders**: @skipnz

## Context

Across surveyed projects, secrets live in:
- Environment variables in `.env`, `.env.local`, `local.settings.json`
- Azure Key Vault (inconsistent adoption)
- GitHub repo-level and environment-level secrets
- `.npmrc` files (some with **committed tokens** — a live leak found in `finman-frontend` and `finman-backend`)
- `AZURE_CREDENTIALS` JSON blobs in GitHub secrets (legacy pattern, being replaced by OIDC)

This inconsistency causes:
- Secrets duplicated between `.env` and Key Vault — rotation touches two places.
- Secrets leaked into source control.
- CI auth-to-Azure split between legacy client-secret and modern OIDC.

## Decision

Four layers of secret storage. **No cross-contamination.** Each secret lives in exactly one layer.

### Layer 1: Runtime secrets (prod / staging / dev apps)

- **Store**: Azure Key Vault.
- **Access**: user-assigned managed identity with RBAC role `Key Vault Secrets User` (or `Key Vault Secrets Officer` for apps that need to write).
- **Consumption**:
  - Container Apps: `keyvaultref://` references in `secrets:` block.
  - Function Apps: Key Vault references in app settings via managed identity.
  - APIM: named values backed by Key Vault.
- **Rotation**: change in Key Vault only. App settings auto-refresh (Container Apps) or require revision (Functions).
- **Network**: Key Vault `defaultAction: Deny` in prod + private endpoint. `AzureServices` bypass is **not** sufficient for Container Apps; use private endpoint.

### Layer 2: CI/CD secrets (GitHub Actions)

- **Store**: GitHub environment secrets (one environment per `dev`, `staging`, `prod`).
- **Auth to Azure**: OIDC federation. No `AZURE_CREDENTIALS` JSON.
- **Federated credentials per env SP**: two — one for `environment:<env>` deploy, one for `pull_request` for what-if preview.
- **Repo-level secrets**: only for cross-env tooling (`CLAUDE_CODE_OAUTH_TOKEN`, `CODECOV_TOKEN`). Never for cloud auth.
- **Rotation**: update in GitHub env secret; no re-deploy needed.

### Layer 3: Developer-local secrets

- **Store**: `.env.local` file, **always gitignored**.
- **Template**: `.env.example` committed, every variable documented with a comment.
- **Bootstrap**: `infra/scripts/populate-secrets.sh` reads `.env.example`, prompts for values, writes them to the matching Key Vault (so the dev picks up the same values via KV refs if they want, or can use `.env.local` for local-only overrides).
- **Optional**: `direnv` via `.envrc` that loads `.env.local` on `cd`.

### Layer 4: Private package registry auth

- **Store**: `.npmrc` references `${NODE_AUTH_TOKEN}` env var; the actual token lives in:
  - **Locally**: `${NODE_AUTH_TOKEN}` in shell env (from a password manager or 1Password CLI).
  - **CI**: GitHub Actions provides `secrets.GITHUB_TOKEN` with `packages: read` permission (or `${{ secrets.ORG_PACKAGES_TOKEN }}` for cross-org access).
- **Never commit tokens inline in `.npmrc`.** Example of committed `.npmrc`:
  ```
  @skipnz:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
  ```
  The `.npmrc` file itself is committed; the token is resolved at runtime.

## Consequences

### Positive
- **Single source of truth** per secret — rotation touches one place.
- **No long-lived credentials in CI** — OIDC federation via short-lived tokens only.
- **Secret scanning** (gitleaks, CodeQL) can enforce that layer-3 and layer-4 values never hit source control.
- **Onboarding** a new dev machine: populate `.env.local` from Key Vault via `populate-secrets.sh`; no back-and-forth on "where did you get this password?".

### Negative
- **Initial OIDC setup per env** is multi-step (app registration, federated credential, role assignment). Mitigated by `infra/scripts/setup-oidc.sh` in the Azure scaffold.
- **Key Vault cold-start cost** on Container Apps when KV references resolve on first request. Negligible in practice.
- **Existing projects using `AZURE_CREDENTIALS` JSON** need migration. New projects only: janus enforces OIDC from day one.

### Neutral
- Developer-local overrides via `.env.local` mean local runs can diverge from deployed runs. Mitigated by `.env.example` being authoritative: add every new var to it in the same PR that introduces the var.

## Considered Alternatives

- **All secrets in Key Vault, including dev-local** — rejected. Forces a round-trip to Azure for every local dev start; annoying offline.
- **All secrets in env vars** — rejected. No rotation story for prod; high leak risk.
- **Doppler / 1Password Secrets Automation / HashiCorp Vault** — rejected as default. Adds a third-party dependency for value already delivered by Key Vault + OIDC. Available as a per-project ADR override.
- **`AZURE_CREDENTIALS` JSON** — rejected. Long-lived client secret; principle of least privilege violated.

## Immediate security actions on existing repos

Separate from this ADR's template scope — R3 surfaced these live issues to address:
1. **Rotate `gho_...` token** committed in `finman-frontend/.npmrc` and `finman-backend/.npmrc`.
2. **Audit `/home/skip/spk-api/.env`** — verify gitignored and not in git history.
3. **Grep all `.npmrc` files** across `skipnz`, `pantheon-tech`, `pantheon-trading`, `Aotearoa-Energy` for inline `_authToken=gho_` or similar.

## References

- [Azure Container Apps — Managed Identities](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity)
- [GitHub OIDC to Azure](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-azure)
- [Azure Key Vault — RBAC Guide](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide)
