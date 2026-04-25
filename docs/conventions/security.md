---
title: Security
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
---

# Security

## Principles

1. **Managed identity over service principal.** No long-lived client secrets.
2. **RBAC over access policies.** Key Vault, Storage, ACR — always RBAC.
3. **Least privilege.** Grant the minimum role needed; scope to the specific resource.
4. **Default-deny network access.** `defaultAction: Deny` on KV, Storage, Cosmos in prod.
5. **Secrets never in source control.** gitleaks pre-commit + CodeQL secret scanning.
6. **Sandbox for AI-driven dangerous tools.** Don't rely on prompt-based safety.

## Authentication

- **User auth**: MSAL (Entra ID). OAuth2 / OIDC flows.
- **Service auth**: user-assigned managed identity.
- **CI auth to Azure**: OIDC federation — no `AZURE_CREDENTIALS` JSON.
- **Service-to-service**: managed identity + RBAC.
- **Human-to-Azure**: `az login` (interactive), not service principal.

## Authorisation

- **Role-based (RBAC)** on Azure resources.
- **Role definitions** reference by friendly name in Bicep / scripts: `Key Vault Secrets User`, `AcrPull`, `Storage Blob Data Reader`.
- **Never assign Owner/Contributor** at subscription/RG level unless strictly required. Scope to resource.

## Secrets hygiene

- **`.gitignore`** `*.env*` with `!.env.example` whitelist.
- **`.npmrc`** references `${NODE_AUTH_TOKEN}` — never inline token.
- **`gitleaks`** pre-commit via lefthook. Template ships with hook configured.
- **CodeQL** secret-scanning in CI.
- **Dependabot** for dependency updates (grouped, auto-merge for patch-level non-security).
- **Never log secrets** — pino `redact` paths.

### Secret rotation

See [docs/runbooks/rotate-secrets.md](../runbooks/rotate-secrets.md).

### Pre-existing leak protocol

If a secret hits source control, follow the protocol in [`secrets.md`](./secrets.md#pre-existing-leak-protocol) — rotate, scrub history, force-push, audit, runbook.

## Network

- **Key Vault, Storage, Cosmos in prod**: `defaultAction: Deny` + private endpoint.
- **Container Apps require private endpoint** to reach KV — the `AzureServices` bypass does NOT cover Container Apps.
- **Function Apps** with VNet integration also need private endpoint for KV in prod.
- **Outbound**: restrict via firewall rules where feasible. Scraper workloads especially.

## Dependency hygiene

- **Dependabot** config ships in template:
  ```yaml
  version: 2
  updates:
    - package-ecosystem: 'npm'
      directory: '/'
      schedule:
        interval: 'weekly'
      groups:
        dev-dependencies:
          dependency-type: 'development'
        prod-dependencies:
          dependency-type: 'production'
      open-pull-requests-limit: 10
    - package-ecosystem: 'github-actions'
      directory: '/'
      schedule:
        interval: 'weekly'
  ```
- **Third-party GH Actions pinned by SHA.** Exception: `anthropics/claude-code-action@v1` (pinning breaks OIDC).
- **No installing arbitrary npm packages without review.** Check for recent publish dates, maintainer legitimacy, deprecation notices.

## CI/CD hardening

- **Minimum permissions** per job (`permissions: contents: read` default; elevate per-job as needed).
- **Fork-PR exclusion** on any workflow that commits back or uses secrets.
- **Concurrency groups** to prevent race conditions.
- **Timeout on every job.**
- **`allowed_bots`** enumerated when using claude-code-action, never `*` on public repos.

## AI-agent-specific

- **`strictKnownMarketplaces: true`** in Claude Code user settings — prevents unknown marketplaces.
- **`dangerouslySkipPermissions` / `skipDangerousModePermissionPrompt`** — never in shared settings.
- **Sandbox mode** for experimental agents running untrusted code.
- **Enumerate `allowed-tools`** per skill; never `Bash(*)`.
- **Default-deny on dangerous Bash**: `rm -rf *`, `sudo *`, `git push --force`, `git push * main`, `npm publish *`.
- **WebFetch restricted** to known-safe domains — never `WebFetch(*)` in shared settings.

## CVE tracking

- **CodeQL** scans in CI.
- **Trivy** on Docker images in CI.
- **Published CVEs against Claude Code** (CVE-2025-54794 / -54795 / -52882) — keep Claude Code updated.
- **OWASP LLM Top 10** as reference for AI-specific threats.

## Audit trail

- **Commits signed** where practical (GPG or SSH signing).
- **Branch protection**: require PR review; require status checks.
- **Activity visible**: GitHub activity log, Azure Activity Log, Application Insights operations.
