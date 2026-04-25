// User-assigned managed identity used by Container Apps / Functions to pull
// images from ACR and read secrets from Key Vault. Wraps AVM
// avm/res/managed-identity/user-assigned-identity:0.5.0.
metadata description = 'User-assigned managed identity (workload identity).'

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

module id 'br/public:avm/res/managed-identity/user-assigned-identity:0.5.0' = {
  name: 'id-${workload}-${env}-deploy'
  params: {
    name: 'id-${workload}-${env}'
    location: location
    tags: tags
    enableTelemetry: false
  }
}

@description('Resource ID of the managed identity.')
output resourceId string = id.outputs.resourceId
@description('Principal (object) ID — use for role assignments.')
output principalId string = id.outputs.principalId
@description('Client ID — use for federated workload identity.')
output clientId string = id.outputs.clientId
@description('Identity name.')
output name string = id.outputs.name
