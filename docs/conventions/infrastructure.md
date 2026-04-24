---
title: Infrastructure (AVM Composition)
type: reference
last_reviewed: 2026-04-24
authorising_adr: 0004
---

# Infrastructure — AVM Composition Pattern

Authorised by [ADR 0004](../adr/0004-avm-first-infrastructure.md).

## Module strategy

```
infra/
├── main.bicep                    # top-level, consumes wrapper modules
├── parameters.dev.json
├── parameters.prod.json
├── deploy.sh                      # wraps az deployment group create
├── scripts/
│   ├── setup-oidc.sh              # create SP + federated creds per env
│   ├── populate-secrets.sh        # interactive KV seed from .env.example
│   └── validate.sh                # bicep build + what-if
└── modules/
    ├── our-keyvault.bicep         # wraps avm/res/key-vault/vault
    ├── our-container-app.bicep    # wraps avm/res/app/container-app
    ├── our-function-app.bicep     # wraps avm/res/web/site
    ├── our-static-site.bicep      # wraps avm/res/web/static-site
    ├── our-monitoring.bicep       # LAW + App Insights
    ├── our-identity.bicep         # UAMI
    └── our-registry.bicep         # ACR with role assignments
```

## Wrapper pattern

Every janus project module follows:

```bicep
// modules/our-<resource>.bicep

@description('Our standard <resource> with janus defaults')
param workload string
param env string
param location string = resourceGroup().location

// ... resource-specific params with defaults ...

var tags = {
  workload: workload
  env: env
  managedBy: 'Bicep+AVM'
  templateVersion: 'janus-v0.1.0'   // updated when scaffolded
}

var isProd = env == 'prod'

module <resource> 'br/public:avm/res/<path>:<version>' = {
  name: '<resource>-${workload}-${env}-deploy'
  params: {
    name: '<naming-pattern>'
    location: location
    tags: tags
    // janus defaults applied here
    enableTelemetry: false
    // ...
  }
}

output resourceId string = <resource>.outputs.resourceId
// other outputs as needed
```

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
| Minimum replica count | dev: 0 (scale-to-zero); prod: 1+ |
| Zone redundancy | prod only |
| Health probes (liveness + readiness) | Container Apps, App Services |

## Pinning & updates

### Pin exact versions

```bicep
module kv 'br/public:avm/res/key-vault/vault:0.12.0' = { ... }
```

**Never** use a range (`~`, `^`, `>=`) or omit the version.

### Recorded in wrapper

Each wrapper lists its pinned AVM version in a top-level comment:

```bicep
// modules/our-keyvault.bicep
// AVM: avm/res/key-vault/vault:0.12.0
// Last updated: 2026-04-24
```

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
module storage 'br/public:avm/res/storage/storage-account:0.15.0' = {
  params: {
    // Override AVM default of Standard_RAGRS with LRS for dev
    skuName: env == 'prod' ? 'Standard_RAGRS' : 'Standard_LRS'
    // ...
  }
}
```

### Option 2: AVM + extension resources

Use AVM for the base, add extension resources alongside:

```bicep
module kv 'br/public:avm/res/key-vault/vault:0.12.0' = { ... }

resource kvExtra 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: /* reference AVM-created KV */
  name: 'some-secret'
  // ...
}
```

### Option 3: Hand-roll the resource (documented)

If AVM genuinely doesn't cover a case, hand-roll and write an ADR:

```
docs/adr/0N-bespoke-<resource>.md

Status: accepted
Context: AVM module avm/res/X does not support Y as of version 0.12.0
Decision: Hand-roll Microsoft.X resource with desired Y behaviour.
Consequences: Must manually track Microsoft best-practice changes.
```

Revisit quarterly to see if AVM caught up.

### Option 4: Fork AVM module inline

Last resort. Copy the AVM module source into `infra/modules/forked-<name>.bicep` and modify. Loses upstream security fixes. Document loudly.

## Example `main.bicep`

```bicep
targetScope = 'resourceGroup'

@description('Workload slug (3-12 chars, lowercase)')
@minLength(3)
@maxLength(12)
param workload string

@allowed(['dev', 'staging', 'prod'])
param env string

param location string = resourceGroup().location

// ─── Identity & Observability ──────────────────────────────────────
module identity './modules/our-identity.bicep' = {
  name: 'id-deploy'
  params: { workload: workload, env: env, location: location }
}

module monitoring './modules/our-monitoring.bicep' = {
  name: 'monitoring-deploy'
  params: { workload: workload, env: env, location: location }
}

// ─── Secrets ───────────────────────────────────────────────────────
module kv './modules/our-keyvault.bicep' = {
  name: 'kv-deploy'
  params: {
    workload: workload
    env: env
    location: location
    workspaceResourceId: monitoring.outputs.workspaceResourceId
    identityPrincipalId: identity.outputs.principalId
  }
}

// ─── Registry ──────────────────────────────────────────────────────
module acr './modules/our-registry.bicep' = {
  name: 'acr-deploy'
  params: {
    workload: workload
    env: env
    location: location
    identityPrincipalId: identity.outputs.principalId
  }
}

// ─── Compute ───────────────────────────────────────────────────────
module api './modules/our-container-app.bicep' = {
  name: 'ca-api-deploy'
  params: {
    workload: workload
    env: env
    location: location
    appName: 'api'
    registryLoginServer: acr.outputs.loginServer
    identityResourceId: identity.outputs.resourceId
    keyVaultUri: kv.outputs.uri
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
  }
}

output apiFqdn string = api.outputs.fqdn
output kvUri string = kv.outputs.uri
```

Main file is ~50 lines; wrappers encapsulate the AVM parameters.

## Deploy flow

```bash
# 1. Validate (local or CI)
bash infra/scripts/validate.sh dev    # runs bicep build + what-if

# 2. Deploy (CI via workflow, with OIDC)
bash infra/deploy.sh dev

# 3. Health check
curl https://<fqdn>/health
```

## Testing infra changes

- **what-if on PR**: `.github/workflows/infra-preview.yml` runs `az deployment group what-if` on any PR touching `infra/**`.
- **Nightly drift check**: `.github/workflows/infra-drift.yml` runs what-if against current state on `main` — opens an issue if a non-empty diff appears.
- **Never apply without what-if first.**
