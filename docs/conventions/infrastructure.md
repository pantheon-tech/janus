---
title: Infrastructure (AVM Composition)
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
---

# Infrastructure — AVM Composition Pattern


## Module strategy

```
infra/
├── main.bicep                       # top-level, consumes wrapper modules
├── parameters.staging.bicepparam
├── parameters.prod.bicepparam
├── deploy.sh                         # wraps az deployment group create
├── scripts/
│   ├── setup-oidc.sh                 # create SP + federated creds per env
│   ├── populate-secrets.sh           # interactive KV seed from .env.example
│   └── validate.sh                   # bicep build + what-if
└── modules/
    ├── our-keyvault.bicep            # wraps avm/res/key-vault/vault
    ├── our-container-app.bicep       # wraps avm/res/app/container-app
    ├── our-function-app.bicep        # wraps avm/res/web/site
    ├── our-static-site.bicep         # wraps avm/res/web/static-site
    ├── our-monitoring.bicep          # LAW + App Insights
    ├── our-identity.bicep            # UAMI
    └── our-registry.bicep            # ACR with role assignments
```

## Wrapper pattern

Every janus project module follows the same shape: take `workload`, `env`,
`location`; apply janus defaults; reference a pinned AVM module. Worked
example for Key Vault:

```bicep
// modules/our-keyvault.bicep
// AVM: avm/res/key-vault/vault:0.13.3
// Last updated: 2026-04-24

@description('Standard Key Vault with janus defaults')
param workload string
param env string
param location string = resourceGroup().location

var tags = {
  workload: workload
  env: env
  managedBy: 'Bicep+AVM'
  templateVersion: 'janus-v0.1.0'
}

var isProd = env == 'prod'

module kv 'br/public:avm/res/key-vault/vault:0.13.3' = {
  name: 'kv-${workload}-${env}-deploy'
  params: {
    name: 'kv-${workload}-${env}'
    location: location
    tags: tags
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: isProd
    networkAcls: {
      defaultAction: isProd ? 'Deny' : 'Allow'
      bypass: 'AzureServices'
    }
    enableTelemetry: false
  }
}

output resourceId string = kv.outputs.resourceId
output uri string = kv.outputs.uri
```

The same shape applies to every other resource type — see the wrappers in
`infra/modules/`.

## Janus defaults (baked into every wrapper)

| Default | Applied where |
|---|---|
| Tags: `workload`, `env`, `managedBy`, `templateVersion` | every resource |
| `enableTelemetry: false` | every AVM module |
| RBAC over access policies | KV, Storage, ACR |
| `defaultAction: 'Deny'` on networkAcls | KV, Storage (prod) |
| `bypass: 'AzureServices'` | KV, Storage |
| Private endpoint | prod only (via param) |
| Soft-delete enabled | KV, Storage |
| Purge protection | KV (prod only) |
| Diagnostic settings to LAW | every resource that emits |
| Managed identity | every compute resource |
| Minimum replica count | staging: 0 (scale-to-zero); prod: 1+ |
| Zone redundancy | prod only |
| Health probes (liveness + readiness) | Container Apps, App Services |

## Pinning & updates

### Pin exact versions

```bicep
module kv 'br/public:avm/res/key-vault/vault:0.13.3' = { ... }
```

**Never** use a range (`~`, `^`, `>=`) or omit the version.

The canonical version table lives in
[`./avm-versions.md`](./avm-versions.md). Each wrapper records its pinned
version in a top-level comment too — keep the two in sync.

### Dependabot config

```yaml
# .github/dependabot.yml — bicep ecosystem support
version: 2
updates:
  - package-ecosystem: 'bicep-registry'
    directory: '/infra'
    schedule:
      interval: 'weekly'
```

## Escape hatches

When AVM doesn't fit, options in order of preference:

### Option 1: Thin wrapper that overrides params

If AVM's defaults are wrong for your case, your wrapper overrides them:

```bicep
module storage 'br/public:avm/res/storage/storage-account:0.32.0' = {
  params: {
    // Override AVM default for staging
    skuName: env == 'prod' ? 'Standard_RAGRS' : 'Standard_LRS'
    // ...
  }
}
```

### Option 2: AVM + extension resources

Use AVM for the base, add extension resources alongside:

```bicep
module kv 'br/public:avm/res/key-vault/vault:0.13.3' = { ... }

resource kvExtra 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: /* reference AVM-created KV */
  name: 'some-secret'
  // ...
}
```

### Option 3: Hand-roll the resource (documented)

If AVM genuinely doesn't cover a case, hand-roll and write a project ADR
documenting the bespoke choice. Revisit quarterly to see if AVM caught up.

### Option 4: Fork AVM module inline

Last resort. Copy the AVM module source into `infra/modules/forked-<name>.bicep`
and modify. Loses upstream security fixes. Document loudly.

## Example `main.bicep`

```bicep
targetScope = 'resourceGroup'

@description('Workload slug (3-12 chars, lowercase)')
@minLength(3)
@maxLength(12)
param workload string

@allowed(['staging', 'prod'])
param env string

param location string = resourceGroup().location

module identity   './modules/our-identity.bicep'      = { name: 'id-deploy',         params: { workload: workload, env: env, location: location } }
module monitoring './modules/our-monitoring.bicep'    = { name: 'monitoring-deploy', params: { workload: workload, env: env, location: location } }
module kv         './modules/our-keyvault.bicep'      = { name: 'kv-deploy',         params: { workload: workload, env: env, location: location, workspaceResourceId: monitoring.outputs.workspaceResourceId, identityPrincipalId: identity.outputs.principalId } }
module acr        './modules/our-registry.bicep'      = { name: 'acr-deploy',        params: { workload: workload, env: env, location: location, identityPrincipalId: identity.outputs.principalId } }
module api        './modules/our-container-app.bicep' = { name: 'ca-api-deploy',     params: { workload: workload, env: env, location: location, appName: 'api', registryLoginServer: acr.outputs.loginServer, identityResourceId: identity.outputs.resourceId, keyVaultUri: kv.outputs.uri, appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString } }

output apiFqdn string = api.outputs.fqdn
output kvUri string = kv.outputs.uri
```

Main file stays compact; wrappers encapsulate the AVM parameters.

## Parameter files

Use Bicep's native parameter file format (`.bicepparam`), not JSON
`parameters.X.json`:

```bicep
// parameters.staging.bicepparam
using './main.bicep'
param workload = 'myapp'
param env = 'staging'
param location = 'australiaeast'
```

## Deploy and testing

For the deploy flow, see [`../runbooks/deploy.md`](../runbooks/deploy.md).

PR-level safety:

- **what-if on PR**: `.github/workflows/infra-preview.yml` runs `az deployment group what-if` on any PR touching `infra/**`.
- **Nightly drift check**: `.github/workflows/infra-drift.yml` runs what-if against current state on `main` — opens an issue if a non-empty diff appears.
- **Never apply without what-if first.**
