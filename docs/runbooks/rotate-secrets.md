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

3. **For Container Apps**: a new revision is required — KV references resolve at revision creation, NOT per-request. `?version=latest` does not change this; existing revisions continue to serve the old value until replaced.
   ```bash
   az containerapp revision copy \
     --name ca-<workload>-api-<env> \
     --resource-group rg-<workload>-<env>
   ```
   In-flight requests on prior revisions complete with the OLD secret value; only requests that land on the newly created revision use the NEW value. If the app uses `revisionMode: single`, traffic shifts atomically once the new revision becomes ready; in `multiple` mode, both can coexist while traffic weights drain.

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
- **Skipped revision creation**: forgetting step 3 leaves Container Apps serving the old secret indefinitely. `?version=latest` does NOT trigger per-request re-resolution — the reference is materialised into the revision's secrets at creation time.
- **In-process caching**: even after a new revision serves the new value, the app may have cached the secret in-process (e.g. an SDK client constructed at startup). For long-lived clients (DB pools, external service clients), confirm the new revision actually re-instantiates them.

## Notes

- This runbook does NOT cover rotating managed identity credentials — those are Azure-managed and rotate automatically.
- For credentials-in-GitHub-environment-secrets (layer 2), rotate in GitHub Settings → Environments → secrets.
- For local-dev `.env.local` (layer 3), rotate the source and re-run `infra/scripts/populate-secrets.sh` if Key Vault is the source of truth for dev.
