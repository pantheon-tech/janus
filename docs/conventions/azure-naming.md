---
title: Azure Naming (Full Reference)
type: reference
last_reviewed: 2026-04-24
---

# Azure Naming — Full Reference


## Pattern

`{type-abbrev}-{workload}-{env}` where the resource allows hyphens; concat without hyphens otherwise.

## Full table

| Resource | Abbrev | Hyphens? | Length cap | Example (workload=`myapp`, env=`dev`) |
|---|---|---|---|---|
| Resource Group | `rg` | yes | 90 | `rg-myapp-dev` |
| Storage Account | `st` | **no** | 24 (lowercase) | `stmyappdev` |
| Key Vault | `kv` | yes | 24 | `kv-myapp-dev` |
| Function App | `func` | yes | 60 | `func-myapp-dev` |
| App Service Plan | `plan` | yes | 40 | `plan-myapp-dev` |
| App Service (Web App) | `app` | yes | 60 | `app-myapp-dev` |
| Static Web App | `swa` | yes | 60 | `swa-myapp-dev` |
| Container App Environment | `cae` | yes | 60 | `cae-myapp-dev` |
| Container App | `ca` | yes | 32 | `ca-myapp-api-dev` |
| Container Registry | `cr` | **no** | 50 (lowercase) | `crmyappdev` |
| Log Analytics Workspace | `log` | yes | 63 | `log-myapp-dev` |
| Application Insights | `appi` | yes | 260 | `appi-myapp-dev` |
| User-assigned Managed Identity | `id` | yes | 128 | `id-myapp-dev` |
| Private Endpoint | `pep` | yes | 80 | `pep-myapp-kv-dev` |
| Private DNS Zone | — | (use FQDN) | 63 | `privatelink.vaultcore.azure.net` |
| Event Grid Topic | `egst` | yes | 50 | `egst-myapp-dev` |
| Event Grid System Topic | `egsys` | yes | 50 | `egsys-myapp-dev` |
| Service Bus Namespace | `sb` | yes | 50 | `sb-myapp-dev` |
| Service Bus Queue | `sbq` | yes | 260 | `sbq-orders` |
| Service Bus Topic | `sbt` | yes | 260 | `sbt-events` |
| API Management | `apim` | yes | 50 | `apim-myapp-shared` |
| SignalR Service | `sigr` | yes | 63 | `sigr-myapp-dev` |
| Cosmos DB Account | `cosmos` | yes | 44 (lowercase) | `cosmos-myapp-dev` |
| SQL Server | `sql` | yes | 63 | `sql-myapp-dev` |
| SQL Database | `sqldb` | yes | 128 | `sqldb-myapp-dev` |
| VNet | `vnet` | yes | 64 | `vnet-myapp-dev` |
| Subnet | `snet` | yes | 80 | `snet-apps` |
| NSG | `nsg` | yes | 80 | `nsg-apps-dev` |
| Route Table | `rt` | yes | 80 | `rt-hub-dev` |
| Public IP | `pip` | yes | 80 | `pip-gw-dev` |
| Load Balancer | `lb` | yes | 80 | `lb-apps-dev` |
| Application Gateway | `agw` | yes | 80 | `agw-myapp-dev` |
| Front Door Profile | `afd` | yes | 64 | `afd-myapp-prod` |
| CDN Profile | `cdnp` | yes | 260 | `cdnp-myapp-prod` |
| Disk | `disk` | yes | 80 | `disk-jumpbox-dev` |
| VM | `vm` | yes | 64 (Linux), 15 (Windows) | `vm-jumpbox-dev` |
| Managed Cluster (AKS) | `aks` | yes | 63 | `aks-myapp-prod` |
| Redis Cache | `redis` | yes | 63 | `redis-myapp-dev` |
| Cognitive Services | `cog` | yes | 64 | `cog-myapp-openai-dev` |

## Conventions

### Workload slug

- 3–12 chars, `a-z0-9`, lowercase.
- May embed org prefix: `ptlrisk` not `ptl-risk` when length-constrained.
- Reserved: `shared`, `global`, `internal` — don't use as workload names (conflict with env suffix).

### Environments

Exactly three: `dev`, `staging`, `prod`.
**NOT**: `uat`, `test`, `qa`, `preprod`, `integration`, `sandbox`.

For cross-environment (shared) resources: use `shared` as the suffix.

### Instance numbering

- Omit `-001` by default.
- Add when resource must exist twice in same scope: `func-myapp-dev-001`, `func-myapp-dev-002`.
- Numbering starts at `001`, zero-padded.

### Region embedding

- **Default**: don't embed region (saves length, region is implicit per RG).
- **Multi-region**: embed 3-char code: `kv-myapp-dev-aue` (australiaeast), `kv-myapp-dev-use` (southeastasia via eastasia-substitute).

### Region short codes

| Region | Code |
|---|---|
| australiaeast | `aue` |
| australiasoutheast | `aus` |
| eastus | `eus` |
| westus3 | `wus3` |
| northeurope | `neu` |
| westeurope | `weu` |
| eastasia | `eas` |
| southeastasia | `sea` |

## Examples — full stack

For `workload=myapp`, `env=dev`:

```
rg-myapp-dev                       # Resource Group
├─ id-myapp-dev                    # User-assigned Managed Identity
├─ log-myapp-dev                   # Log Analytics Workspace
├─ appi-myapp-dev                  # Application Insights
├─ kv-myapp-dev                    # Key Vault
├─ stmyappdev                      # Storage Account
├─ crmyappdev                      # Container Registry
├─ cae-myapp-dev                   # Container App Environment
├─ ca-myapp-api-dev                # Container App (API)
├─ ca-myapp-worker-dev             # Container App (Worker)
├─ swa-myapp-dev                   # Static Web App (frontend)
└─ pep-myapp-kv-dev                # Private Endpoint (KV, prod only)
```

## Anti-patterns

- `<app>-<env>-<type>` suffix form (legacy, retired).
- `<type>-<env>-<app>` env-before-app (breaks prefix-matching workflows).
- Inconsistent casing (`RG-MyApp-Dev`) — always lowercase.
- Abbreviations from portal displays (`rgp` for RG) — use the CAF abbreviations above.
- Custom separators (`rg_myapp_dev`, `rg.myapp.dev`) — always hyphens (or nothing).
