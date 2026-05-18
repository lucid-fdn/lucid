import 'server-only'

import { recordAppServiceMetric, withAppServiceSpan } from '../observability'

export interface AppIntegrationStatus {
  provider: string
  status: 'connected' | 'missing' | 'requires_action'
  required: boolean
}

export async function listAppIntegrationStatuses(_appDeploymentId: string): Promise<AppIntegrationStatus[]> {
  return withAppServiceSpan('app_service.runtime.operator.integrations.list', {
    stage: 'runtime.operator',
    operation: 'listAppIntegrationStatuses',
    appDeploymentId: _appDeploymentId,
    appRuntimeApiVersion: 'v1',
  }, () => {
    recordAppServiceMetric('operator_runtime_integrations_listed', 1, {
      stage: 'runtime.operator',
      operation: 'listAppIntegrationStatuses',
      appDeploymentId: _appDeploymentId,
      appRuntimeApiVersion: 'v1',
    })
    return []
  })
}
