// Azure Container Registry. Grants the workload managed identity AcrPull.
// Wraps AVM avm/res/container-registry/registry:0.12.1.
metadata description = 'Azure Container Registry with AcrPull granted to workload identity.'

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

@description('Principal ID of the workload identity (granted AcrPull).')
param identityPrincipalId string

@description('Log Analytics workspace resource ID for diagnostic settings.')
param workspaceResourceId string = ''

var tags = {
  workload: workload
  env: env
  managedBy: 'Bicep+AVM'
  templateVersion: 'janus-v0.1.0'
}

// Built-in role: AcrPull
var roleAcrPull = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

// ACR names must be globally unique, alphanumeric, 5-50 chars.
var acrName = replace('acr${workload}${env}', '-', '')

module acr 'br/public:avm/res/container-registry/registry:0.12.1' = {
  name: 'acr-${workload}-${env}-deploy'
  params: {
    name: acrName
    location: location
    tags: tags
    enableTelemetry: false
    acrSku: env == 'prod' ? 'Premium' : 'Basic'
    acrAdminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    diagnosticSettings: empty(workspaceResourceId) ? null : [
      {
        name: 'to-law'
        workspaceResourceId: workspaceResourceId
        logCategoriesAndGroups: [
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
        roleDefinitionIdOrName: roleAcrPull
      }
    ]
  }
}

@description('Container registry resource ID.')
output resourceId string = acr.outputs.resourceId
@description('Login server (e.g. acrfooprod.azurecr.io).')
output loginServer string = acr.outputs.loginServer
@description('Registry name.')
output name string = acr.outputs.name
