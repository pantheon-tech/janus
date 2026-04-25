---
title: AVM Module Versions
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
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
