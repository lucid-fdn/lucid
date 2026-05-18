import 'server-only'

import { recordAppServiceMetric, withAppServiceSpan } from '../observability'

export interface AppTeamRunRequest {
  teamKey?: string
  input: Record<string, unknown>
  idempotencyKey?: string
}

export async function enqueueAppTeamRun(_appDeploymentId: string, _request: AppTeamRunRequest) {
  return withAppServiceSpan('app_service.runtime.operator.team.run', {
    stage: 'runtime.operator',
    operation: 'enqueueAppTeamRun',
    appDeploymentId: _appDeploymentId,
    appRuntimeApiVersion: 'v1',
  }, () => {
    recordAppServiceMetric('operator_runtime_team_run_queued', 1, {
      stage: 'runtime.operator',
      operation: 'enqueueAppTeamRun',
      appDeploymentId: _appDeploymentId,
      appRuntimeApiVersion: 'v1',
    }, {
      team_key: _request.teamKey ?? null,
    })
    return {
      status: 'queued' as const,
      run_id: null,
    }
  })
}
