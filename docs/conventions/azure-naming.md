---
title: Azure Naming (Full Reference)
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
---

# Azure Naming — Full Reference


## Pattern

`{type-abbrev}-{workload}-{env}` where the resource allows hyphens; concat without hyphens otherwise.

## Full table

| Resource | Abbrev | Hyphens? | Length cap | Example (workload=`myapp`, env=`staging`) |
|---|---|---|---|---|
| Resource Group | `rg` | yes | 90 | `rg-myapp-staging` |
| Storage Account | `st` | **no** | 24 (lowercase) | `stmyappstaging` |
| Key Vault | `kv` | yes | 24 | `kv-myapp-staging` |
| Function App | `func` | yes | 60 | `func-myapp-staging` |
| App Service Plan | `plan` | yes | 40 | `plan-myapp-staging` |
| App Service (Web App) | `app` | yes | 60 | `app-myapp-staging` |
| Static Web App | `swa` | yes | 60 | `swa-myapp-staging` |
| Container App Environment | `cae` | yes | 60 | `cae-myapp-staging` |
| Container App | `ca` | yes | 32 | `ca-myapp-api-staging` |
| Container Registry | `cr` | **no** | 50 (lowercase) | `crmyappstaging` |
| Log Analytics Workspace | `log` | yes | 63 | `log-myapp-staging` |
| Application Insights | `appi` | yes | 260 | `appi-myapp-staging` |
| User-assigned Managed Identity | `id` | yes | 128 | `id-myapp-staging` |
| Private Endpoint | `pep` | yes | 80 | `pep-myapp-kv-staging` |
| Private DNS Zone | — | (use FQDN) | 63 | `privatelink.vaultcore.azure.net` |
| Event Grid Topic | `egst` | yes | 50 | `egst-myapp-staging` |
| Event Grid System Topic | `egsys` | yes | 50 | `egsys-myapp-staging` |
| Service Bus Namespace | `sb` | yes | 50 | `sb-myapp-staging` |
| Service Bus Queue | `sbq` | yes | 260 | `sbq-orders` |
| Service Bus Topic | `sbt` | yes | 260 | `sbt-events` |
| API Management | `apim` | yes | 50 | `apim-myapp-shared` |
| SignalR Service | `sigr` | yes | 63 | `sigr-myapp-staging` |
| Cosmos DB Account | `cosmos` | yes | 44 (lowercase) | `cosmos-myapp-staging` |
| SQL Server | `sql` | yes | 63 | `sql-myapp-staging` |
| SQL Database | `sqldb` | yes | 128 | `sqldb-myapp-staging` |
| VNet | `vnet` | yes | 64 | `vnet-myapp-staging` |
| Subnet | `snet` | yes | 80 | `snet-apps` |
| NSG | `nsg` | yes | 80 | `nsg-apps-staging` |
| Route Table | `rt` | yes | 80 | `rt-hub-staging` |
| Public IP | `pip` | yes | 80 | `pip-gw-staging` |
| Load Balancer | `lb` | yes | 80 | `lb-apps-staging` |
| Application Gateway | `agw` | yes | 80 | `agw-myapp-staging` |
| Front Door Profile | `afd` | yes | 64 | `afd-myapp-prod` |
| CDN Profile | `cdnp` | yes | 260 | `cdnp-myapp-prod` |
| Disk | `disk` | yes | 80 | `disk-jumpbox-staging` |
| VM | `vm` | yes | 64 (Linux), 15 (Windows) | `vm-jumpbox-staging` |
| Managed Cluster (AKS) | `aks` | yes | 63 | `aks-myapp-prod` |
| Redis Cache | `redis` | yes | 63 | `redis-myapp-staging` |
| Cognitive Services | `cog` | yes | 64 | `cog-myapp-openai-staging` |

## Conventions

### Workload slug

- 3–12 chars, `a-z0-9`, lowercase.
- May embed org prefix: `ptlrisk` not `ptl-risk` when length-constrained.
- Reserved: `shared`, `global`, `internal` — don't use as workload names (conflict with env suffix).

### Environments

Two: `staging`, `prod` (plus `shared` for cross-environment resources).
**NOT**: `dev`, `uat`, `test`, `qa`, `preprod`, `integration`, `sandbox`.

For cross-environment (shared) resources: use `shared` as the suffix.

### Instance numbering

- Omit `-001` by default.
- Add when resource must exist twice in same scope: `func-myapp-staging-001`, `func-myapp-staging-002`.
- Numbering starts at `001`, zero-padded.

### Length warnings

Some abbrev + env combinations cut close to the resource length cap. Plan workload-slug length up-front:

- **Key Vault** — 24 chars max. Pattern `kv-{workload}-{env}`:
  - `staging` env (7 chars) → `kv-` + workload + `-staging` = 11 fixed → workload max 13 chars
  - `prod` env (4 chars) → workload max 16 chars
  - With region embedded (`kv-{workload}-staging-aue`), workload max drops to **9 chars**
- **Storage Account** — 24 chars max, lowercase, **no hyphens**. Pattern `st{workload}{env}`:
  - `staging` env → workload max 15 chars
  - `prod` env → workload max 18 chars
  - With region (`st{workload}staging{aue}`) → workload max 12 chars
- **Container App** — 32 chars max. Pattern `ca-{workload}-{appName}-{env}`:
  - `staging` env, 4-char `appName` (e.g. `api`, `worker`) → workload max ~16 chars
- **Container Registry** — 50 chars max, lowercase, no hyphens. Generous; almost always fits.
- **Cosmos DB Account** — 44 chars max, lowercase. Generous; usually fits with region.

If a chosen workload slug pushes past the cap on the tightest resource (KV), shorten the slug rather than the env name — env names are fixed across the convention.

### Region embedding

- **Default**: don't embed region (saves length, region is implicit per RG).
- **Multi-region**: embed 3-char code: `kv-myapp-staging-aue` (australiaeast), `kv-myapp-staging-sea` (southeastasia).

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

For `workload=myapp`, `env=staging`:

```
rg-myapp-staging                   # Resource Group
├─ id-myapp-staging                # User-assigned Managed Identity
├─ log-myapp-staging               # Log Analytics Workspace
├─ appi-myapp-staging              # Application Insights
├─ kv-myapp-staging                # Key Vault
├─ stmyappstaging                  # Storage Account
├─ crmyappstaging                  # Container Registry
├─ cae-myapp-staging               # Container App Environment
├─ ca-myapp-api-staging            # Container App (API)
├─ ca-myapp-worker-staging         # Container App (Worker)
├─ swa-myapp-staging               # Static Web App (frontend)
└─ pep-myapp-kv-staging            # Private Endpoint (KV, prod only)
```

## Anti-patterns

- `<app>-<env>-<type>` suffix form (legacy, retired).
- `<type>-<env>-<app>` env-before-app (breaks prefix-matching workflows).
- Inconsistent casing (`RG-MyApp-Staging`) — always lowercase.
- Abbreviations from portal displays (`rgp` for RG) — use the CAF abbreviations above.
- Custom separators (`rg_myapp_staging`, `rg.myapp.staging`) — always hyphens (or nothing).
