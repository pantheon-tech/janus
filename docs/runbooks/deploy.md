---
title: Deploy infrastructure
type: runbook
last_reviewed: 2026-04-24
last_executed: 2026-04-24
owners: [@skipnz]
---

# Deploy infrastructure

End-to-end deploy flow for an AVM-composed Bicep stack to `staging` or `prod`.

## Prereqs

- Required access: federated OIDC service principal for the target env.
- Required state: CI green on the source branch (`staging` or `main`).
- Tools: `az` CLI, `bicep` CLI, repository checked out at the commit being
  deployed.

## Steps

1. **Validate locally.** Catches schema errors before CI.
   ```bash
   bash infra/scripts/validate.sh staging   # bicep build + what-if
   ```
2. **Push.** The deploy workflow runs on push to `staging` (deploys to
   staging) or merge of the release PR into `main` (deploys to prod).
3. **Watch.** Required reviewers gate the prod environment; the workflow
   pauses until approved.

## Verify

- The deployment shows `succeeded` in the Azure Portal.
- The smoke check (`curl https://<fqdn>/health`) returns 200.
- App Insights receives a heartbeat from the new revision within 60 s.

## Rollback

For Container Apps: `az containerapp update --revision-suffix <prev>`. For
Function Apps: redeploy the previous tagged image. See the per-archetype
README for archetype-specific rollback runbooks.

## Known failure modes

- **What-if disagrees with template version baked into the wrapper** — bump
  the wrapper's pinned AVM version (see [`../conventions/avm-versions.md`](../conventions/avm-versions.md)).
- **OIDC `AADSTS70021`** — federated credential subject mismatch; see
  `../conventions/secrets.md`.

## Notes

The deploy job emits diagnostic settings to the Log Analytics workspace named
in the wrapper. PR-level previews run via `infra-preview.yml` and never apply.
