# 0002 — Azure Resource Naming Convention

- **Status**: accepted
- **Date**: 2026-04-24
- **Deciders**: @skipnz
- **Supersedes**: legacy `<app>-<env>-func` suffix form; `ptl-`-prefixed form

## Context

Three Azure resource naming patterns coexist across surveyed projects:

1. `{type}-{app}-{env}` (CAF-style prefix form) — used in AEX, `oatis/gas-flow-app`.
2. `ptl-{app}-{env}` (workload-embedded prefix) — used in pantheon-trading.
3. `{app}-{env}-func` (suffix form) — used in older `spk-api`.

Microsoft's Cloud Adoption Framework (CAF) recommends the prefix form with short type abbreviations. It's also the most common in Azure's own documentation and samples, including AVM.

Having three patterns causes:
- Scripts and dashboards assuming one form break when pointed at another.
- Resource discovery via prefix (`az resource list --resource-group rg-myapp-dev`) works for form 1 only.
- Cross-project parity breaks: `rg-aex-dev` vs `rg-ptl-risk-dev` looks inconsistent.

## Decision

Use **`{type-abbrev}-{workload}-{env}`** for resources that allow hyphens. Concat without hyphens for resources that don't (storage accounts, ACR).

**Workload name** is a short slug (3–12 chars, lowercase, `a-z0-9`). It may include an organisational prefix where appropriate (e.g. workload = `ptl-risk`, not workload = `risk` + separate `ptl-` decoration).

### Canonical table

| Resource | Abbrev | Hyphens? | Example (workload=`myapp`, env=`dev`) |
|---|---|---|---|
| Resource Group | `rg` | yes | `rg-myapp-dev` |
| Storage Account | `st` | **no** (24-char max, lowercase) | `stmyappdev` |
| Key Vault | `kv` | yes (24-char max) | `kv-myapp-dev` |
| Function App | `func` | yes | `func-myapp-dev` |
| App Service Plan | `plan` | yes | `plan-myapp-dev` |
| Static Web App | `swa` | yes | `swa-myapp-dev` |
| Container App Environment | `cae` | yes | `cae-myapp-dev` |
| Container App | `ca` | yes | `ca-myapp-api-dev` |
| Container Registry | `cr` | **no** | `crmyappdev` |
| Log Analytics Workspace | `log` | yes | `log-myapp-dev` |
| Application Insights | `appi` | yes | `appi-myapp-dev` |
| User-assigned Managed Identity | `id` | yes | `id-myapp-dev` |
| Private Endpoint | `pep` | yes | `pep-myapp-kv-dev` |
| Private DNS Zone | `pdnsz` | yes | `pdnsz-myapp-dev` |
| Event Grid Topic | `egst` | yes | `egst-myapp-dev` |
| Service Bus | `sb` | yes | `sb-myapp-dev` |
| API Management | `apim` | yes | `apim-myapp-shared` |
| SignalR Service | `sigr` | yes | `sigr-myapp-dev` |
| Cosmos DB Account | `cosmos` | yes | `cosmos-myapp-dev` |
| SQL Server | `sql` | yes | `sql-myapp-dev` |
| SQL Database | `sqldb` | yes | `sqldb-myapp-dev` |
| VNet | `vnet` | yes | `vnet-myapp-dev` |

### Environment names

Use: `dev`, `staging`, `prod`. Not `uat`, `test`, `qa`, `preprod`. (Three environments, pick from these three.)

### Instance numbering

Omit `-001` by default. Add only when a resource must exist twice in the same scope (e.g. `func-myapp-dev-001` + `func-myapp-dev-002` for blue/green, or failover setups).

### Region

Default `australiaeast` — universal across surveyed projects. Override per-environment when needed (e.g. Static Web Apps have limited regions; use `eastasia` as nearest available for SWA specifically).

### Shared resources (cross-environment)

When a single resource serves all environments (e.g. shared APIM, shared Log Analytics workspace), use `shared` instead of an env suffix: `apim-myapp-shared`, `log-myapp-shared`.

## Consequences

### Positive
- **Discoverable via prefix** — `az resource list --resource-group rg-myapp-dev` finds everything for myapp dev.
- **Aligns with CAF and AVM** — copy-paste from Microsoft samples works.
- **Homogeneous across projects** — once you know the pattern, any janus-scaffolded project reads consistently.

### Negative
- **Existing projects on the legacy suffix form** (e.g. `spk-api`) diverge. Migration requires renaming resources, which is destructive for data-storage resources. Pragmatic approach: new projects follow the canonical form; existing projects migrate on next major infra refactor.
- **Long workload names** (e.g. `ptl-risk-engine`) can hit 24-char caps on storage and key vault. Mitigated by shortening workload (`ptlrisk` instead of `ptl-risk-engine`) when length-constrained.

### Neutral
- `shared` as an env value is uncommon in CAF docs but pragmatic for cross-env resources.

## Considered Alternatives

- **Suffix form `{app}-{env}-{type}`** — rejected. Less common in CAF, less discoverable via prefix wildcards.
- **No abbreviation (`resource-group-myapp-dev`)** — rejected. Verbose; exceeds character limits on some resource types.
- **Per-org prefix as separate token (`ptl-rg-risk-dev`)** — rejected. Double-prefix is ugly and breaks alignment with CAF. Org prefix belongs in workload name.

## References

- [Microsoft CAF — Resource Naming](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming)
- [Azure naming abbreviations](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/azure-best-practices/resource-abbreviations)
- `/home/skip/oatis/gas-flow-app/infra/main.bicep` — evidence of canonical pattern in existing work
