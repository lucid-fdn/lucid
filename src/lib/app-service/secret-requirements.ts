import 'server-only'

import type { AppDeployment, AppDeploymentEvent } from '@contracts/app-service'
import { recordAppServiceEvent } from './events'
import {
  appSecretRequirementEventType,
  buildAppSecretRequirementAuditPayload,
  parseAppSecretRequirementConnectionInput,
  type AppSecretRequirementConnectionInput,
} from './secret-requirements-core'

export interface ConnectAppSecretRequirementResult {
  key: string
  status: AppSecretRequirementConnectionInput['action']
  source: AppSecretRequirementConnectionInput['source']
  reference: string
  event: AppDeploymentEvent | null
}

export async function connectAppSecretRequirement(params: {
  app: AppDeployment
  key: string
  input: unknown
  userId: string
}): Promise<ConnectAppSecretRequirementResult> {
  const connection = parseAppSecretRequirementConnectionInput(params.input)
  const payload = buildAppSecretRequirementAuditPayload({
    key: params.key,
    userId: params.userId,
    connection,
  })

  const event = await recordAppServiceEvent({
    appDeploymentId: params.app.id,
    generationRunId: params.app.generation_run_id,
    eventType: appSecretRequirementEventType(connection.action),
    message: `Secret requirement ${params.key} ${connection.action}.`,
    provider: connection.provider ?? null,
    payload,
  })

  return {
    key: params.key,
    status: connection.action,
    source: connection.source,
    reference: connection.reference,
    event,
  }
}
