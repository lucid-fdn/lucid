import 'server-only'

import {
  AppArtifactSchema,
  AppDeploymentEventSchema,
  AppExternalDeploymentSchema,
  AppFrontendGenerationSchema,
  AppPublicUsageBucketSchema,
  type AppArtifact,
  type AppDeployment,
  type AppDeploymentEvent,
  type AppExternalDeployment,
  type AppFrontendGeneration,
  type AppPublicUsageBucket,
} from '@contracts/app-service'
import { supabase, ErrorService } from '@/lib/db/client'
import { AppServiceError } from './errors'
import {
  PUBLIC_RUNTIME_ABUSE_EVENT_TYPES,
  summarizeAppServiceOperatorVisibility,
  type AppAllowedOriginSummary,
  type AppServiceOperatorVisibility,
} from './operator-visibility-core'
import {
  APP_ARTIFACT_SELECT,
  APP_DEPLOYMENT_EVENT_SELECT,
  APP_EXTERNAL_DEPLOYMENT_SELECT,
  APP_FRONTEND_GENERATION_SELECT,
  APP_PUBLIC_USAGE_BUCKET_SELECT,
} from './projections'

async function listFrontendGenerationsForApp(app: AppDeployment): Promise<AppFrontendGeneration[]> {
  let query = supabase
    .from('app_frontend_generations')
    .select(APP_FRONTEND_GENERATION_SELECT)
    .order('updated_at', { ascending: false })
    .limit(20)

  query = app.generation_run_id
    ? query.or(`app_deployment_id.eq.${app.id},generation_run_id.eq.${app.generation_run_id}`)
    : query.eq('app_deployment_id', app.id)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => AppFrontendGenerationSchema.parse(row))
}

async function listExternalDeploymentsForApp(app: AppDeployment): Promise<AppExternalDeployment[]> {
  const { data, error } = await supabase
    .from('app_external_deployments')
    .select(APP_EXTERNAL_DEPLOYMENT_SELECT)
    .eq('app_deployment_id', app.id)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return (data ?? []).map((row) => AppExternalDeploymentSchema.parse(row))
}

async function listArtifactsForApp(app: AppDeployment): Promise<AppArtifact[]> {
  let query = supabase
    .from('app_artifacts')
    .select(APP_ARTIFACT_SELECT)
    .order('created_at', { ascending: false })
    .limit(100)

  query = app.generation_run_id
    ? query.or(`app_deployment_id.eq.${app.id},generation_run_id.eq.${app.generation_run_id}`)
    : query.eq('app_deployment_id', app.id)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => AppArtifactSchema.parse(row))
}

async function listEventsForApp(app: AppDeployment): Promise<AppDeploymentEvent[]> {
  let query = supabase
    .from('app_deployment_events')
    .select(APP_DEPLOYMENT_EVENT_SELECT)
    .order('created_at', { ascending: false })
    .limit(100)

  query = app.generation_run_id
    ? query.or(`app_deployment_id.eq.${app.id},generation_run_id.eq.${app.generation_run_id}`)
    : query.eq('app_deployment_id', app.id)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => AppDeploymentEventSchema.parse(row))
}

async function listAbuseEventsForApp(app: AppDeployment): Promise<AppDeploymentEvent[]> {
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('app_deployment_events')
    .select(APP_DEPLOYMENT_EVENT_SELECT)
    .eq('app_deployment_id', app.id)
    .in('event_type', [...PUBLIC_RUNTIME_ABUSE_EVENT_TYPES])
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) throw error
  return (data ?? []).map((row) => AppDeploymentEventSchema.parse(row))
}

async function listUsageBucketsForApp(app: AppDeployment): Promise<AppPublicUsageBucket[]> {
  const { data, error } = await supabase
    .from('app_public_usage_buckets')
    .select(APP_PUBLIC_USAGE_BUCKET_SELECT)
    .eq('app_deployment_id', app.id)
    .order('bucket_start', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data ?? []).map((row) => AppPublicUsageBucketSchema.parse(row))
}

async function listAllowedOriginsForApp(app: AppDeployment): Promise<AppAllowedOriginSummary[]> {
  const { data, error } = await supabase
    .from('app_allowed_origins')
    .select('origin, source, created_at')
    .eq('app_deployment_id', app.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>
    return {
      origin: typeof record.origin === 'string' ? record.origin : '',
      source: typeof record.source === 'string' ? record.source : 'manual',
      created_at: typeof record.created_at === 'string' ? record.created_at : new Date(0).toISOString(),
    }
  }).filter((row) => row.origin)
}

export async function getAppServiceOperatorVisibility(
  app: AppDeployment,
): Promise<AppServiceOperatorVisibility> {
  try {
    const [
      frontendGenerations,
      externalDeployments,
      artifacts,
      events,
      abuseEvents,
      usageBuckets,
      allowedOrigins,
    ] = await Promise.all([
      listFrontendGenerationsForApp(app),
      listExternalDeploymentsForApp(app),
      listArtifactsForApp(app),
      listEventsForApp(app),
      listAbuseEventsForApp(app),
      listUsageBucketsForApp(app),
      listAllowedOriginsForApp(app),
    ])

    return summarizeAppServiceOperatorVisibility({
      app,
      frontendGenerations,
      externalDeployments,
      artifacts,
      events,
      abuseEvents,
      usageBuckets,
      allowedOrigins,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'getAppServiceOperatorVisibility', appDeploymentId: app.id },
      tags: { layer: 'app-service', feature: 'operator-visibility' },
    })
    throw new AppServiceError('internal_error', 'Failed to read app operator visibility.', 500)
  }
}
