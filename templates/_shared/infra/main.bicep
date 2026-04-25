// Reference composition for a Container App archetype.
//
// Replace `our-container-app` with `our-function-app` or `our-static-site`
// for other archetypes; remove modules you don't need. Each module is
// independently substitutable — they share a workload+env naming scheme.
metadata description = 'Janus reference infra: identity, monitoring, KV, ACR, Container App.'

targetScope = 'resourceGroup'

@description('Workload slug (3-12 chars, lowercase alphanumeric).')
@minLength(3)
@maxLength(12)
param workload string

@description('Target environment.')
@allowed([
  'staging'
  'prod'
])
param env string

@description('Azure region. Defaults to the resource group location.')
param location string = resourceGroup().location

// Identity (must come first — KV + ACR reference its principal ID)
module identity './modules/our-identity.bicep' = {
  name: 'id-deploy'
  params: {
    workload: workload
    env: env
    location: location
  }
}

// Monitoring (LAW + AppInsights — KV diagnostic settings need the workspace)
module monitoring './modules/our-monitoring.bicep' = {
  name: 'monitoring-deploy'
  params: {
    workload: workload
    env: env
    location: location
  }
}

// Key Vault (depends on identity + monitoring)
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

// Container Registry (depends on identity)
module acr './modules/our-registry.bicep' = {
  name: 'acr-deploy'
  params: {
    workload: workload
    env: env
    location: location
    identityPrincipalId: identity.outputs.principalId
    workspaceResourceId: monitoring.outputs.workspaceResourceId
  }
}

// Container App (depends on identity, monitoring, KV, ACR)
module api './modules/our-container-app.bicep' = {
  name: 'ca-api-deploy'
  params: {
    workload: workload
    env: env
    location: location
    appName: 'api'
    workspaceResourceId: monitoring.outputs.workspaceResourceId
    registryLoginServer: acr.outputs.loginServer
    identityResourceId: identity.outputs.resourceId
    keyVaultUri: kv.outputs.uri
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
  }
}

@description('Public ingress FQDN of the Container App.')
output apiFqdn string = api.outputs.fqdn
@description('Key Vault URI.')
output kvUri string = kv.outputs.uri
@description('Workload identity client ID (for federated workload identity).')
output identityClientId string = identity.outputs.clientId
@description('ACR login server.')
output acrLoginServer string = acr.outputs.loginServer
@description('Application Insights connection string (write to app config).')
output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString
