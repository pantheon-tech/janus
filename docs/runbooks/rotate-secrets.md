---
title: Rotate a secret in Key Vault
type: runbook
last_reviewed: 2026-04-24
last_executed: 2026-04-24
owners: [skipnz]
---

# Rotate a secret in Key Vault

Rotate a secret stored in Azure Key Vault that is referenced by runtime apps (Container Apps, Function Apps) via `keyvaultref://` or KV references.

## Prereqs

- Azure CLI logged in: `az account show` returns the correct tenant/subscription.
- Role: `Key Vault Secrets Officer` on the target Key Vault.
- New secret value available (from source of truth — provider portal, new certificate, etc.).
- Target environment known: `dev`, `staging`, or `prod`.

## Steps

1. **Record the old version identifier** (for rollback):
   ```bash
   az keyvault secret show \
     --vault-name kv-<workload>-<env> \
     --name <secret-name> \
     --query 'id' -o tsv
   ```
   Save this URL — it encodes the old version GUID.

2. **Set the new secret value** — creates a new version:
   ```bash
   az keyvault secret set \
     --vault-name kv-<workload>-<env> \
     --name <secret-name> \
     --value "<new-value>"
   ```

3. **For Container Apps**: the app picks up the new version automatically on next request if secret is referenced as `keyvaultref://...?version=latest` (default). For version-pinned refs, update the revision:
   ```bash
   az containerapp revision copy \
     --name ca-<workload>-api-<env> \
     --resource-group rg-<workload>-<env>
   ```

4. **For Function Apps**: restart the app to pick up new secret:
   ```bash
   az functionapp restart \
     --name func-<workload>-<env> \
     --resource-group rg-<workload>-<env>
   ```

## Verify

- `curl https://<app-endpoint>/health` returns 200 within 60 seconds of restart.
- Application Insights shows no new error spike in the 5 minutes post-rotation.
- Business-metric dashboards normal.

## Rollback

If verify fails:

1. **Revert the secret** to the old version:
   ```bash
   az keyvault secret set-attributes \
     --vault-name kv-<workload>-<env> \
     --name <secret-name> \
     --version <old-version-guid> \
     --enabled true
   ```
2. Disable the new (failed) version:
   ```bash
   az keyvault secret set-attributes \
     --vault-name kv-<workload>-<env> \
     --name <secret-name> \
     --version <new-version-guid> \
     --enabled false
   ```
3. Restart the app (step 3 or 4 above) to force re-read.
4. Post to #incidents with cause and remediation.

## Known failure modes

- **Private-endpoint Key Vault** in prod: the CLI must run from a network path with access (jumpbox, bastion, or from the app's VNet). `Forbidden` errors usually mean network, not RBAC.
- **Cached reference**: if the app aggressively caches secrets in-process, a restart is required even with `?version=latest`. Check app's logger setup.

## Notes

- This runbook does NOT cover rotating managed identity credentials — those are Azure-managed and rotate automatically.
- For credentials-in-GitHub-environment-secrets (layer 2), rotate in GitHub Settings → Environments → secrets.
- For local-dev `.env.local` (layer 3), rotate the source and re-run `infra/scripts/populate-secrets.sh` if Key Vault is the source of truth for dev.
