# 0004 — AVM-First Azure Infrastructure

- **Status**: accepted
- **Date**: 2026-04-24
- **Deciders**: @skipnz

## Context

Previous Azure infra in surveyed projects was hand-rolled Bicep in `infra/modules/{keyvault,functionapp,containerapp}/`. This means every project re-implements RBAC setup, diagnostic settings, soft-delete config, private endpoint wiring, managed identity assignments — all of which Microsoft-best-practice defaults can silently drift between projects.

Azure Verified Modules (AVM) reached GA in 2026. These are Microsoft-maintained, reviewed, tested Bicep modules published to MCR. They encode security defaults (RBAC, purge protection, soft-delete, diagnostic settings) by construction.

## Decision

**Infrastructure in janus-scaffolded projects uses AVM modules via `br/public:avm/res/...` references.** Hand-rolled `resource ... = {}` blocks are banned in new Bicep files without an ADR explaining the deviation.

### Pattern: thin local wrappers around AVM

Each archetype ships `infra/modules/our-<resource>.bicep` files that wrap AVM modules with janus defaults:

```bicep
// infra/modules/our-keyvault.bicep
@description('Our standard Key Vault with janus defaults')
param workload string
param env string
param location string = resourceGroup().location
param workspaceResourceId string
param identityPrincipalId string

var isProd = env == 'prod'

module kv 'br/public:avm/res/key-vault/vault:0.12.0' = {
  name: 'kv-${workload}-${env}-deploy'
  params: {
    name: 'kv-${workload}-${env}'
    location: location
    enableRbacAuthorization: true
    enablePurgeProtection: isProd
    softDeleteRetentionInDays: 90
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
    diagnosticSettings: [
      { workspaceResourceId: workspaceResourceId }
    ]
    roleAssignments: [
      {
        principalId: identityPrincipalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: 'Key Vault Secrets User'
      }
    ]
    enableTelemetry: false
  }
}

output resourceId string = kv.outputs.resourceId
output uri string = kv.outputs.uri
```

Main `infra/main.bicep` consumes the wrapper:

```bicep
module kv './modules/our-keyvault.bicep' = {
  name: 'kv-deploy'
  params: {
    workload: workload
    env: env
    workspaceResourceId: law.outputs.resourceId
    identityPrincipalId: identity.outputs.principalId
  }
}
```

### Pinning

- AVM versions **pinned in the wrapper module** (`avm/res/key-vault/vault:0.12.0` — exact version, not caret or tilde).
- Dependabot configured to PR version bumps (Bicep ecosystem).
- Bumps reviewed like any other dependency — read AVM release notes before merging.

### Telemetry

- `enableTelemetry: false` on every module. Microsoft collects anonymous module-usage pings by default; we opt out.

### Escape hatches

When AVM doesn't fit, write an ADR (0N — Bespoke X because AVM Y). Options:

1. **Fork the module inline**: copy the AVM module source into `infra/modules/` and modify.
2. **Wrap with extension resources**: use AVM for the base, add `Microsoft.*` resources alongside.
3. **Hand-roll the whole resource**: last resort, documented with why.

Periodically re-evaluate whether AVM has caught up.

### Pattern modules (`avm/ptn/*`)

Use with caution. `res/` modules are mature; `ptn/` modules are less so. Treat `ptn/` as reference implementations, not drop-in production.

## Consequences

### Positive
- **Security defaults correct by construction** — RBAC, purge protection, diagnostics, soft delete, managed identity.
- **~80-line bespoke module → ~20-line AVM consumption** — net code reduction per resource.
- **Homogeneous module surface** — same parameter names (`name`, `location`, `tags`, `roleAssignments`, `diagnosticSettings`, `privateEndpoints`, `managedIdentities`) across every AVM module. Once learned, every resource feels familiar.
- **Microsoft-maintained** — security fixes and new features flow upstream.

### Negative
- **Supply-chain dependency** on MCR. Bicep deploys require MCR reachability. Low risk, but real.
- **Version churn**: breaking changes happen between `0.x` minor versions. Mitigated by pinning + dependabot + release-note reading.
- **Opinionated defaults** may not fit every case. Mitigated by wrapper-module pattern (override defaults without losing AVM's base behaviour).
- **Not 100% coverage** — new/preview resources lag behind Azure GA by weeks. Mitigated by escape-hatch pattern.

### Neutral
- **Pattern modules** (`ptn/*`) remain an open question — mostly avoided in favour of composing `res/*` modules ourselves.

## Considered Alternatives

- **Hand-rolled Bicep per project** — rejected. Every project re-derives Microsoft best practices. Drift guaranteed.
- **Terraform + AVM Terraform modules** — rejected. janus is Bicep-first (every surveyed project uses Bicep); introducing Terraform is an unnecessary fork.
- **`azd` templates as primary scaffold** — rejected as primary but the `azure.yaml` file from `azd` can be added to janus-scaffolded projects if `azd up` convenience is wanted. Not a default.
- **Copy-the-AVM-module-inline** (vendored) — rejected as default. Forgoes upstream security fixes. Available as escape hatch only.

## References

- [Azure Verified Modules](https://azure.github.io/Azure-Verified-Modules/)
- [AVM Bicep registry](https://mcr.microsoft.com/en-us/catalog?search=avm)
- [Bicep module registry docs](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/modules#file-in-registry)
- Detailed expansion in `docs/conventions/infrastructure.md`
