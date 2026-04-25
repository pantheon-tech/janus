// Static Web App for Vite/React frontends. Wraps AVM
// avm/res/web/static-site:0.9.4.
//
// Note: SWA deployments typically push artifacts via the deploy workflow's
// SWA action; this module only creates the resource.
metadata description = 'Azure Static Web App for SPA frontends.'

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

@description('Logical app suffix (e.g. "web").')
param appName string = 'web'

@description('Resource ID of the workload managed identity (optional).')
param identityResourceId string = ''

@description('SWA SKU.')
@allowed([
  'Free'
  'Standard'
])
param sku string = env == 'prod' ? 'Standard' : 'Free'

var tags = {
  workload: workload
  env: env
  managedBy: 'Bicep+AVM'
  templateVersion: 'janus-v0.1.0'
}

module swa 'br/public:avm/res/web/static-site:0.9.4' = {
  name: 'swa-${workload}-${appName}-${env}-deploy'
  params: {
    name: 'swa-${workload}-${appName}-${env}'
    location: location
    tags: tags
    enableTelemetry: false
    sku: sku
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: env == 'prod' ? 'Enabled' : 'Disabled'
    publicNetworkAccess: 'Enabled'
    managedIdentities: empty(identityResourceId) ? null : {
      userAssignedResourceIds: [
        identityResourceId
      ]
    }
  }
}

@description('Static Web App resource ID.')
output resourceId string = swa.outputs.resourceId
@description('Static Web App default hostname.')
output defaultHostname string = swa.outputs.defaultHostname
@description('Static Web App name.')
output name string = swa.outputs.name
