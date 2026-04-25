// Container App + Container App Environment. Mounts the workload managed
// identity for ACR pull and KV secret access. Wraps AVM
// avm/res/app/managed-environment:0.13.2 and avm/res/app/container-app:0.22.1.
metadata description = 'Container App on a managed environment.'

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

@description('Logical app name (e.g. "api", "worker").')
param appName string = 'api'

@description('Log Analytics workspace resource ID for the Container App Environment.')
param workspaceResourceId string

@description('ACR login server (e.g. acrfooprod.azurecr.io).')
param registryLoginServer string

@description('Resource ID of the workload managed identity.')
param identityResourceId string

@description('Key Vault URI (https://<name>.vault.azure.net/) — for reference / app config.')
param keyVaultUri string = ''

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('Container image (registry/repo:tag). Defaults to a hello-world image; replace at deploy time.')
param image string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container target port.')
param targetPort int = 8080

@description('Allow ingress from internet (true) or restrict to VNet (false).')
param externalIngress bool = true

@description('Min replica count.')
param minReplicas int = env == 'prod' ? 1 : 0

@description('Max replica count.')
param maxReplicas int = env == 'prod' ? 10 : 3

var tags = {
  workload: workload
  env: env
  managedBy: 'Bicep+AVM'
  templateVersion: 'janus-v0.1.0'
}

// Container App Environment (one per workload+env).
// The AVM wrapper reads customerId + sharedKey from the LAW reference itself.
module cae 'br/public:avm/res/app/managed-environment:0.13.2' = {
  name: 'cae-${workload}-${env}-deploy'
  params: {
    name: 'cae-${workload}-${env}'
    location: location
    tags: tags
    enableTelemetry: false
    zoneRedundant: false
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsWorkspaceResourceId: workspaceResourceId
    }
  }
}

module ca 'br/public:avm/res/app/container-app:0.22.1' = {
  name: 'ca-${workload}-${appName}-${env}-deploy'
  params: {
    name: 'ca-${workload}-${appName}-${env}'
    location: location
    tags: tags
    enableTelemetry: false
    environmentResourceId: cae.outputs.resourceId
    managedIdentities: {
      userAssignedResourceIds: [
        identityResourceId
      ]
    }
    registries: [
      {
        server: registryLoginServer
        identity: identityResourceId
      }
    ]
    ingressExternal: externalIngress
    ingressTargetPort: targetPort
    ingressTransport: 'auto'
    ingressAllowInsecure: false
    scaleSettings: {
      minReplicas: minReplicas
      maxReplicas: maxReplicas
    }
    containers: [
      {
        name: appName
        image: image
        resources: {
          cpu: json('0.5')
          memory: '1Gi'
        }
        env: [
          {
            name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
            value: appInsightsConnectionString
          }
          {
            name: 'KEY_VAULT_URI'
            value: keyVaultUri
          }
          {
            name: 'WORKLOAD'
            value: workload
          }
          {
            name: 'ENVIRONMENT'
            value: env
          }
        ]
      }
    ]
  }
}

@description('Container App resource ID.')
output resourceId string = ca.outputs.resourceId
@description('Container App ingress FQDN.')
output fqdn string = ca.outputs.fqdn
@description('Container App name.')
output name string = ca.outputs.name
@description('Managed environment resource ID.')
output environmentResourceId string = cae.outputs.resourceId
