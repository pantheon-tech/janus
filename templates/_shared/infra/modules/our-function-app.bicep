// Azure Functions (v4) integrated with App Insights and using the workload
// managed identity. Wraps AVM avm/res/web/site:0.22.0.
//
// Note: this is a minimal reference. Real workloads will configure storage,
// networking, and app settings beyond these defaults.
metadata description = 'Azure Functions app + plan.'

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

@description('Logical app name suffix (e.g. "fn", "events").')
param appName string = 'fn'

@description('Resource ID of the workload managed identity.')
param identityResourceId string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('Application Insights resource ID.')
param appInsightsResourceId string

@description('Resource ID of an existing storage account for Functions runtime state.')
param storageAccountResourceId string

@description('Functions runtime worker (e.g. node, dotnet-isolated).')
@allowed([
  'node'
  'dotnet-isolated'
  'python'
  'java'
])
param functionsWorkerRuntime string = 'node'

@description('Hosting SKU. Y1 = consumption, FC1 = flex consumption.')
param skuName string = 'Y1'

var tags = {
  workload: workload
  env: env
  managedBy: 'Bicep+AVM'
  templateVersion: 'janus-v0.1.0'
}

// Hosting plan — created inline; Functions consumption is too small to
// warrant a wrapper module of its own.
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-${workload}-${appName}-${env}'
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuName == 'Y1' ? 'Dynamic' : 'FlexConsumption'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

module fn 'br/public:avm/res/web/site:0.22.0' = {
  name: 'fn-${workload}-${appName}-${env}-deploy'
  params: {
    name: 'fn-${workload}-${appName}-${env}'
    location: location
    tags: tags
    enableTelemetry: false
    kind: 'functionapp,linux'
    serverFarmResourceId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    managedIdentities: {
      userAssignedResourceIds: [
        identityResourceId
      ]
    }
    configs: [
      {
        name: 'appsettings'
        storageAccountResourceId: storageAccountResourceId
        storageAccountUseIdentityAuthentication: true
        applicationInsightResourceId: appInsightsResourceId
        properties: {
          FUNCTIONS_EXTENSION_VERSION: '~4'
          FUNCTIONS_WORKER_RUNTIME: functionsWorkerRuntime
          APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
          WORKLOAD: workload
          ENVIRONMENT: env
        }
      }
      {
        name: 'web'
        properties: {
          linuxFxVersion: 'NODE|20'
          minTlsVersion: '1.2'
          ftpsState: 'Disabled'
        }
      }
    ]
  }
}

@description('Function app resource ID.')
output resourceId string = fn.outputs.resourceId
@description('Function app default hostname.')
output defaultHostname string = fn.outputs.defaultHostname
@description('Function app name.')
output name string = fn.outputs.name
