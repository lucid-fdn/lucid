import 'server-only'

import { AgentControlRequestSchema } from '@contracts/app-runtime'
import { AppServiceError } from '../errors'
import { recordAppServiceMetric, withAppServiceSpan } from '../observability'

export async function controlAppAgent(
  _appDeploymentId: string,
  _agentId: string,
  rawInput: unknown,
) {
  return withAppServiceSpan('app_service.runtime.operator.agent.control', {
    stage: 'runtime.operator',
    operation: 'controlAppAgent',
    appDeploymentId: _appDeploymentId,
    appRuntimeApiVersion: 'v1',
  }, () => {
    AgentControlRequestSchema.parse(rawInput)
    recordAppServiceMetric('operator_runtime_agent_control_requested', 1, {
      stage: 'runtime.operator',
      operation: 'controlAppAgent',
      appDeploymentId: _appDeploymentId,
      appRuntimeApiVersion: 'v1',
    }, {
      agent_id: _agentId,
    })
    throw new AppServiceError(
      'provider_unavailable',
      'App-scoped agent control facade is scaffolded but not yet connected to Mission Control.',
      501,
    )
  })
}
