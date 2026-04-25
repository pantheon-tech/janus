// Log Analytics workspace + Application Insights. Wraps AVM
// avm/res/operational-insights/workspace:0.15.0 and
// avm/res/insights/component:0.7.1.
metadata description = 'Log Analytics workspace + Application Insights.'

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

var tags = {
  workload: workload
  env: env
  managedBy: 'Bicep+AVM'
  templateVersion: 'janus-v0.1.0'
}

module law 'br/public:avm/res/operational-insights/workspace:0.15.0' = {
  name: 'law-${workload}-${env}-deploy'
  params: {
    name: 'log-${workload}-${env}'
    location: location
    tags: tags
    enableTelemetry: false
    dataRetention: env == 'prod' ? 90 : 30
  }
}

module appi 'br/public:avm/res/insights/component:0.7.1' = {
  name: 'appi-${workload}-${env}-deploy'
  params: {
    name: 'appi-${workload}-${env}'
    location: location
    tags: tags
    enableTelemetry: false
    workspaceResourceId: law.outputs.resourceId
  }
}

@description('Log Analytics workspace resource ID.')
output workspaceResourceId string = law.outputs.resourceId
@description('Application Insights connection string.')
output appInsightsConnectionString string = appi.outputs.connectionString
@description('Application Insights instrumentation key (legacy).')
output appInsightsInstrumentationKey string = appi.outputs.instrumentationKey
