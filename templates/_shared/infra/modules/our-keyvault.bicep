// Key Vault with RBAC, soft-delete, and diagnostic settings to LAW.
// Grants the workload managed identity the "Key Vault Secrets User" role.
// Wraps AVM avm/res/key-vault/vault:0.13.3.
metadata description = 'Key Vault with RBAC + diagnostic settings.'

@description('Workload slug.')
param workload string

@description('Environment.')
@allowed([
  'staging'
  'prod'
])
param env string

@description('Azure region.')
param location string = resourceGroup().location

@description('Log Analytics workspace resource ID for diagnostic settings.')
param workspaceResourceId string

@description('Principal ID of the workload managed identity (granted Secrets User).')
param identityPrincipalId string

@description('Enable purge protection. Required for prod; optional for staging.')
param enablePurgeProtection bool = (env == 'prod')

var tags = {
  workload: workload
  env: env
  managedBy: 'Bicep+AVM'
  templateVersion: 'janus-v0.1.0'
}

// Built-in role: Key Vault Secrets User
var roleSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'

module kv 'br/public:avm/res/key-vault/vault:0.13.3' = {
  name: 'kv-${workload}-${env}-deploy'
  params: {
    name: 'kv-${workload}-${env}'
    location: location
    tags: tags
    enableTelemetry: false
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: enablePurgeProtection
    softDeleteRetentionInDays: 90
    sku: 'standard'
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
    diagnosticSettings: [
      {
        name: 'to-law'
        workspaceResourceId: workspaceResourceId
        logCategoriesAndGroups: [
          {
            categoryGroup: 'audit'
          }
          {
            categoryGroup: 'allLogs'
          }
        ]
      }
    ]
    roleAssignments: [
      {
        principalId: identityPrincipalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: roleSecretsUser
      }
    ]
  }
}

@description('Key Vault resource ID.')
output resourceId string = kv.outputs.resourceId
@description('Key Vault URI (https://<name>.vault.azure.net/).')
output uri string = kv.outputs.uri
@description('Key Vault name.')
output name string = kv.outputs.name
