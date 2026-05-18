import 'server-only'

import { recordAppServiceMetric, withAppServiceSpan } from '../observability'

export interface AppWorkflowRunRequest {
  workflowKey: string
  input: Record<string, unknown>
  idempotencyKey?: string
}

export async function enqueueAppWorkflowRun(_appDeploymentId: string, request: AppWorkflowRunRequest) {
  return withAppServiceSpan('app_service.runtime.operator.workflow.run', {
    stage: 'runtime.operator',
    operation: 'enqueueAppWorkflowRun',
    appDeploymentId: _appDeploymentId,
    appRuntimeApiVersion: 'v1',
  }, () => {
    recordAppServiceMetric('operator_runtime_workflow_run_queued', 1, {
      stage: 'runtime.operator',
      operation: 'enqueueAppWorkflowRun',
      appDeploymentId: _appDeploymentId,
      appRuntimeApiVersion: 'v1',
    }, {
      workflow_key: request.workflowKey,
    })
    return {
      action: request.workflowKey,
      status: 'queued' as const,
      run_id: undefined,
    }
  })
}
