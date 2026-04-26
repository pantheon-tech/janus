---
title: AVM Module Versions
type: reference
last_reviewed: 2026-04-25
owners: []  # add owners for this project
---

# AVM Module Versions

Pinned Azure Verified Modules versions used by janus wrappers. **Pin exactly**;
never use a range.

Verified against the Microsoft Container Registry on `last_reviewed`. Refresh
via:

```bash
curl -s https://mcr.microsoft.com/v2/bicep/avm/res/<path>/tags/list \
  | jq -r '.tags | sort_by(split(".") | map(tonumber? // 0)) | last'
```

## Current pins

| Module | Version | Wrapper |
|---|---|---|
| `avm/res/key-vault/vault` | `0.13.3` | `our-keyvault.bicep` |
| `avm/res/storage/storage-account` | `0.32.0` | (used directly or wrapped) |
| `avm/res/web/site` | `0.22.0` | `our-function-app.bicep` |
| `avm/res/web/static-site` | `0.9.4` | `our-static-site.bicep` |
| `avm/res/app/container-app` | `0.22.1` | `our-container-app.bicep` |
| `avm/res/insights/component` | `0.7.1` | `our-monitoring.bicep` (App Insights) |
| `avm/res/operational-insights/workspace` | `0.15.0` | `our-monitoring.bicep` (LAW) |
| `avm/res/managed-identity/user-assigned-identity` | `0.5.0` | `our-identity.bicep` |
| `avm/res/container-registry/registry` | `0.12.1` | `our-registry.bicep` |

## Recording in wrappers

Each wrapper module records its pinned version in a top-level comment so
reviewers can spot drift without leaving the file:

```bicep
// modules/our-keyvault.bicep
// AVM: avm/res/key-vault/vault:0.13.3
// Last updated: 2026-04-24
```

## Update flow

1. Dependabot opens a PR against the wrapper.
2. CI runs `bicep build` + `what-if` to confirm no parameter signature breaks.
3. Update the comment line and this table together.
4. Re-test in `staging` before promoting.

## Bicep CLI minimum version

**Minimum required: bicep CLI 0.42.1** (ships with `az` CLI ≥ 2.70 or installed
via `az bicep install --version v0.42.1`).

### Why this matters — BCP081 and the Container App API

`avm/res/app/container-app:0.22.1` (and its managed-environment sibling) pin
Azure resource API version `2026-01-01` for `Microsoft.App/containerApps` and
`Microsoft.App/containerApps/authConfigs`. Bicep 0.41.x and earlier do not ship
type definitions for this API version, so `az bicep build` emits:

```
Warning BCP081: Resource type "Microsoft.App/containerApps@2026-01-01" does not
have types available. Bicep is unable to validate resource properties prior to
deployment, but this will not block the resource from being deployed.
```

These are **compile-time type-catalog warnings only** — the ARM deployment
succeeds regardless. Bicep 0.42.1 added `2026-01-01` to its bundled type
catalog, eliminating both warnings.

**Resolution**: upgrade your local bicep CLI.

```bash
az bicep upgrade          # or: az bicep install --version v0.42.1
az bicep version          # should print 0.42.1 or later
```

The `infra-preview.yml` workflow template pins bicep CLI to `v0.42.1` via an
explicit `az bicep install` step before `bicep build`, ensuring CI does not
regress on runner images that ship an older bicep.

### Re-check trigger

If you bump `avm/res/app/container-app` to a future version that pins an even
newer API (e.g. `2026-07-01`), run `az bicep build` locally and check for fresh
BCP081 warnings. If they appear, upgrade the pinned bicep CLI version in the
workflow template and update this note.

## AVM version bumps are manual

GitHub Dependabot does **not** support `package-ecosystem: 'bicep-registry'`
(that ecosystem key is Renovate-only). The convention doc shows an aspirational
snippet — it does not work with Dependabot as of April 2026.

AVM module version bumps must be done manually:

1. Query the latest tag for each module:
   ```bash
   curl -s https://mcr.microsoft.com/v2/bicep/avm/res/<path>/tags/list \
     | jq -r '.tags | sort_by(split(".") | map(tonumber? // 0)) | last'
   ```
2. Update the module reference in the wrapper `.bicep` file.
3. Update the comment line and this table.
4. Run `az bicep build` to confirm no BCP081 or other new warnings.
5. Re-test in staging.
