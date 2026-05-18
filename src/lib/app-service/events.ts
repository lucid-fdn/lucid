import 'server-only'

import { AppDeploymentEventSchema, type AppDeploymentEvent } from '@contracts/app-service'
import { supabase, ErrorService } from '@/lib/db/client'
import { redactAppServiceMetadata, redactAppServiceText } from './security-redaction'
import { APP_DEPLOYMENT_EVENT_SELECT } from './projections'

export interface RecordAppServiceEventInput {
  appDeploymentId?: string | null
  generationRunId?: string | null
  eventType: string
  severity?: 'debug' | 'info' | 'warning' | 'error'
  message?: string | null
  provider?: string | null
  externalId?: string | null
  payload?: Record<string, unknown>
}

export async function recordAppServiceEvent(
  input: RecordAppServiceEventInput,
): Promise<AppDeploymentEvent | null> {
  try {
    const { data, error } = await supabase
      .from('app_deployment_events')
      .insert({
        app_deployment_id: input.appDeploymentId ?? null,
        generation_run_id: input.generationRunId ?? null,
        event_type: input.eventType,
        severity: input.severity ?? 'info',
        message: input.message ? redactAppServiceText(input.message) : null,
        provider: input.provider ?? null,
        external_id: input.externalId ? redactAppServiceText(input.externalId) : null,
        payload: redactAppServiceMetadata(input.payload ?? {}),
      })
      .select(APP_DEPLOYMENT_EVENT_SELECT)
      .single()

    if (error || !data) {
      throw error ?? new Error('App service event insert returned no row')
    }

    return AppDeploymentEventSchema.parse(data)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'warning',
      context: { operation: 'recordAppServiceEvent', eventType: input.eventType },
      tags: { layer: 'app-service', feature: 'events' },
    })
    return null
  }
}
