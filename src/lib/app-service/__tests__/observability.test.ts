import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appServiceErrorContext,
  appServiceSentryTags,
  appServiceTelemetryAttributes,
  logAppServiceTelemetry,
  recordAppServiceMetric,
  redactedTelemetryValue,
  withAppServiceSpan,
} from '../observability'

describe('app service observability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.APP_SERVICE_STRUCTURED_LOGS
  })

  it('builds stable OpenTelemetry attributes without empty values', () => {
    expect(appServiceTelemetryAttributes({
      stage: 'planner',
      operation: 'plan',
      orgId: 'org-1',
      projectId: '',
      generationRunId: 'run-1',
      provider: 'v0',
    }, {
      attempts: 2,
      dry_run: false,
      empty: '',
      secret_key: 'sk-test-secret',
    })).toEqual({
      'app.service.stage': 'planner',
      'app.service.operation': 'plan',
      'app.service.org_id': 'org-1',
      'app.service.generation_run_id': 'run-1',
      'app.service.provider': 'v0',
      'app.service.attempts': 2,
      'app.service.dry_run': false,
      'app.service.secret_key': redactedTelemetryValue(),
    })
  })

  it('creates Sentry tags for run, app, org, project, provider, and stage', () => {
    expect(appServiceSentryTags({
      stage: 'provider.v0',
      operation: 'launch',
      orgId: 'org-1',
      projectId: 'project-1',
      appDeploymentId: 'app-1',
      generationRunId: 'run-1',
      provider: 'v0',
    })).toEqual({
      layer: 'app-service',
      feature: 'provider.v0',
      app_service_stage: 'provider.v0',
      operation: 'launch',
      org_id: 'org-1',
      project_id: 'project-1',
      app_deployment_id: 'app-1',
      generation_run_id: 'run-1',
      provider: 'v0',
    })
  })

  it('redacts structured logs and emits metrics as JSON', () => {
    process.env.APP_SERVICE_STRUCTURED_LOGS = 'true'
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    logAppServiceTelemetry('info', 'test event', {
      stage: 'runtime.public',
      appDeploymentId: 'app-1',
      slug: 'demo',
    }, {
      bearer: 'Bearer secret-token',
      nested: {
        api_key: 'sk-test-secret',
      },
    })
    recordAppServiceMetric('public_requests', 1, {
      stage: 'runtime.public',
      appDeploymentId: 'app-1',
    })

    expect(info).toHaveBeenCalledTimes(2)
    const first = JSON.parse(info.mock.calls[0]?.[0] as string) as Record<string, unknown>
    const second = JSON.parse(info.mock.calls[1]?.[0] as string) as Record<string, unknown>

    expect(first).toMatchObject({
      level: 'info',
      message: 'test event',
      service: 'lucid-app-service',
      stage: 'runtime.public',
      app_deployment_id: 'app-1',
      slug: 'demo',
    })
    expect(first.bearer).toBe(redactedTelemetryValue())
    expect(first.nested).toEqual({ api_key: redactedTelemetryValue() })
    expect(second).toMatchObject({
      message: 'app_service_metric',
      metric_name: 'public_requests',
      metric_value: 1,
    })
  })

  it('can disable structured logs with an env flag', () => {
    process.env.APP_SERVICE_STRUCTURED_LOGS = 'false'
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    logAppServiceTelemetry('info', 'hidden', { stage: 'generation' })

    expect(info).not.toHaveBeenCalled()
  })

  it('wraps successful and failed work in spans', async () => {
    process.env.APP_SERVICE_STRUCTURED_LOGS = 'true'
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(withAppServiceSpan(
      'app_service.test.success',
      { stage: 'compiler', operation: 'compile' },
      async () => 'ok',
    )).resolves.toBe('ok')

    await expect(withAppServiceSpan(
      'app_service.test.failure',
      { stage: 'compiler', operation: 'compile' },
      async () => {
        throw new Error('compile failed')
      },
    )).rejects.toThrow('compile failed')

    expect(info.mock.calls.map((call) => JSON.parse(call[0] as string).message)).toEqual([
      'app_service_span_started',
      'app_service_span_completed',
      'app_service_span_started',
    ])
    expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toMatchObject({
      message: 'app_service_span_failed',
      error_message: 'compile failed',
    })
  })

  it('returns ErrorService-compatible context and tags', () => {
    expect(appServiceErrorContext('syncProviders', {
      stage: 'provider.sync',
      orgId: 'org-1',
      projectId: 'project-1',
      appDeploymentId: 'app-1',
      generationRunId: 'run-1',
    }, {
      provider_token: 'v0_secret_value',
    })).toEqual({
      context: {
        operation: 'syncProviders',
        stage: 'provider.sync',
        requestId: undefined,
        orgId: 'org-1',
        projectId: 'project-1',
        appDeploymentId: 'app-1',
        generationRunId: 'run-1',
        frontendGenerationId: undefined,
        externalDeploymentId: undefined,
        appRuntimeApiVersion: undefined,
        visitorSessionId: undefined,
        operatorUserId: undefined,
        agentopsTraceId: undefined,
        provider: undefined,
        slug: undefined,
        provider_token: redactedTelemetryValue(),
      },
      tags: {
        layer: 'app-service',
        feature: 'provider.sync',
        app_service_stage: 'provider.sync',
        operation: 'syncProviders',
        org_id: 'org-1',
        project_id: 'project-1',
        app_deployment_id: 'app-1',
        generation_run_id: 'run-1',
      },
    })
  })
})
