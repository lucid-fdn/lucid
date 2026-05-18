import { describe, expect, it } from 'vitest'
import type {
  AppArtifact,
  AppDeployment,
  AppDeploymentEvent,
  AppExternalDeployment,
  AppFrontendGeneration,
  AppPublicUsageBucket,
} from '@contracts/app-service'
import {
  summarizeAppServiceOperatorVisibility,
  summarizeArtifactForOperator,
} from '../operator-visibility-core'

const app: AppDeployment = {
  id: '0a3f7cb8-0e10-4c7c-bde9-1d8af7066c4a',
  org_id: '8abed822-343a-4f6b-83b8-5ad167f0743d',
  project_id: '9004b6c6-f9d0-42cb-ae3c-522dd5367ef5',
  generation_run_id: '69777b10-56a8-4aa6-a5c5-4a0b6e63045b',
  name: 'Support Concierge',
  slug: 'support-concierge',
  status: 'preview',
  visibility: 'private',
  frontend_strategy: 'generated_code',
  frontend_manifest: {
    capabilities: ['chat', 'lead'],
    limits: {
      public_requests_per_day: 100,
      monthly_cost_cents: 5000,
    },
    consent: {
      privacy_url: 'https://example.com/privacy',
    },
  },
  preview_url: '/apps/support-concierge',
  public_url: null,
  assistant_ids: ['6edccf93-3f7d-492d-a7d4-29d54d3d8949'],
  dag_ids: [],
  template_deployment_ids: [],
  deployment_target: 'vercel',
  created_by: '98fd4493-317e-4182-9f68-c3e379f770a5',
  created_at: '2026-04-29T09:00:00.000Z',
  updated_at: '2026-04-29T09:15:00.000Z',
}

const frontendGeneration: AppFrontendGeneration = {
  id: '6b3a8e85-df3c-47a1-8cb8-528a16acbff4',
  generation_run_id: app.generation_run_id!,
  app_deployment_id: app.id,
  provider: 'v0',
  status: 'ready',
  provider_project_id: 'proj_123',
  provider_chat_id: 'chat_123',
  provider_version_id: 'ver_123',
  prompt_hash: 'hash',
  brief: {},
  result: {
    source_artifact_id: '2d34bcc7-5db8-4e80-a681-5b158c83193d',
    validation: { passed: true, checksum: 'abc' },
    sandbox: { passed: true, build_log_artifact_id: '5fcf7c87-e71a-47d3-bf34-aa0c30e24001' },
  },
  preview_url: 'https://preview.v0.dev/support',
  web_url: 'https://v0.app/chat/chat_123',
  created_at: '2026-04-29T09:05:00.000Z',
  updated_at: '2026-04-29T09:10:00.000Z',
}

const externalDeployment: AppExternalDeployment = {
  id: '477c34da-790f-403b-9e1a-d8f392a2b03f',
  app_deployment_id: app.id,
  provider: 'v0',
  external_project_id: 'proj_123',
  external_deployment_id: 'dpl_123',
  external_url: 'https://support-concierge.vercel.app',
  status: 'ready',
  metadata: {
    environment: 'preview',
    build_log_artifact_id: '5fcf7c87-e71a-47d3-bf34-aa0c30e24001',
  },
  created_at: '2026-04-29T09:12:00.000Z',
  updated_at: '2026-04-29T09:14:00.000Z',
}

const artifacts: AppArtifact[] = [
  {
    id: '2d34bcc7-5db8-4e80-a681-5b158c83193d',
    app_deployment_id: app.id,
    generation_run_id: app.generation_run_id!,
    kind: 'source_archive',
    version: 1,
    checksum: 'abc',
    metadata: {
      provider: 'v0',
      total_bytes: 42,
      file_count: 1,
      files: [
        {
          path: 'app/page.tsx',
          content: 'do not expose raw source',
          bytes: 42,
          sha256: 'filehash',
        },
      ],
    },
    created_at: '2026-04-29T09:11:00.000Z',
  },
  {
    id: '5fcf7c87-e71a-47d3-bf34-aa0c30e24001',
    app_deployment_id: app.id,
    generation_run_id: app.generation_run_id!,
    kind: 'build_log',
    version: 1,
    checksum: 'def',
      metadata: {
        provider: 'mock',
        phase: 'generated_frontend_build',
        passed: true,
        logs: ['build ok', 'OPENAI_API_KEY=sk-secretsecretsecret'],
        errors: {
          fullErrorText: 'Authorization: Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456',
        },
      },
    created_at: '2026-04-29T09:12:00.000Z',
  },
]

const events: AppDeploymentEvent[] = [
  {
    id: 'c85eb0c1-f53a-48ed-9d20-9aa7c7a66dd5',
    app_deployment_id: app.id,
    generation_run_id: app.generation_run_id,
    event_type: 'v0_frontend_source_validated',
    severity: 'info',
    message: 'Validated.',
    provider: 'v0',
    external_id: 'chat_123',
    payload: {},
    created_at: '2026-04-29T09:13:00.000Z',
  },
]

const abuseEvents: AppDeploymentEvent[] = [
  {
    id: 'f9f40a83-60a5-4cf8-8c10-ad048971d136',
    app_deployment_id: app.id,
    generation_run_id: app.generation_run_id,
    event_type: 'public_origin_denied',
    severity: 'warning',
    message: 'Denied origin.',
    provider: null,
    external_id: null,
    payload: { origin: 'https://unknown.example.com' },
    created_at: '2026-04-29T11:00:00.000Z',
  },
  {
    id: '45d648ca-49d6-4a95-b66a-0aa90d683829',
    app_deployment_id: app.id,
    generation_run_id: app.generation_run_id,
    event_type: 'public_feedback_reported',
    severity: 'warning',
    message: 'Unsafe answer reported.',
    provider: null,
    external_id: null,
    payload: { report_type: 'unsafe' },
    created_at: '2026-04-29T11:05:00.000Z',
  },
]

const usageBuckets: AppPublicUsageBucket[] = [
  {
    id: '2a6735ca-2630-4d66-82da-ac0df31c0883',
    app_deployment_id: app.id,
    org_id: app.org_id,
    project_id: app.project_id,
    bucket_kind: 'day',
    metric: 'public_requests',
    bucket_start: '2026-04-29T00:00:00.000Z',
    count_value: 37,
    created_at: '2026-04-29T09:00:00.000Z',
    updated_at: '2026-04-29T09:30:00.000Z',
  },
  {
    id: '0ce73141-fc9e-4a87-9c84-df65ec3ea81e',
    app_deployment_id: app.id,
    org_id: app.org_id,
    project_id: app.project_id,
    bucket_kind: 'month',
    metric: 'public_chat_cost_cents',
    bucket_start: '2026-04-01T00:00:00.000Z',
    count_value: 123,
    created_at: '2026-04-29T09:00:00.000Z',
    updated_at: '2026-04-29T09:30:00.000Z',
  },
  {
    id: '7778f46a-1e5b-44a5-81b7-4deaf8f21672',
    app_deployment_id: app.id,
    org_id: app.org_id,
    project_id: app.project_id,
    bucket_kind: 'month',
    metric: 'public_chat_completions',
    bucket_start: '2026-04-01T00:00:00.000Z',
    count_value: 12,
    created_at: '2026-04-29T09:00:00.000Z',
    updated_at: '2026-04-29T09:30:00.000Z',
  },
]

describe('operator visibility core', () => {
  it('summarizes provider status, URLs, artifacts, and timeline', () => {
    const result = summarizeAppServiceOperatorVisibility({
      app,
      frontendGenerations: [frontendGeneration],
      externalDeployments: [externalDeployment],
      artifacts,
      events,
      abuseEvents,
      usageBuckets,
      now: new Date('2026-04-29T12:00:00.000Z'),
    })

    expect(result.health).toMatchObject({
      app_status: 'preview',
      frontend_status: 'ready',
      external_deployment_status: 'ready',
      validation_passed: true,
      sandbox_passed: true,
      has_failed_provider_step: false,
    })
    expect(result.links).toMatchObject({
      provider_web_url: 'https://v0.app/chat/chat_123',
      provider_preview_url: 'https://preview.v0.dev/support',
      external_url: 'https://support-concierge.vercel.app',
    })
    expect(result.latest.source_archive?.metadata.files).toEqual([
      {
        path: 'app/page.tsx',
        bytes: 42,
        sha256: 'filehash',
      },
    ])
    expect(JSON.stringify(result.latest.source_archive)).not.toContain('do not expose raw source')
    expect(result.timeline[0]?.event_type).toBe('v0_frontend_source_validated')
    expect(result.usage.daily_public_requests).toMatchObject({
      current: 37,
      limit: 100,
      percent: 37,
    })
    expect(result.usage.monthly_chat_cost_cents).toMatchObject({
      current: 123,
      limit: 5000,
      percent: 2,
    })
    expect(result.usage.monthly_chat_completions.current).toBe(12)
    expect(result.abuse).toMatchObject({
      status: 'watch',
      denied_origins_24h: { current_24h: 1, last_event_at: '2026-04-29T11:00:00.000Z' },
      unsafe_feedback_24h: { current_24h: 1, last_event_at: '2026-04-29T11:05:00.000Z' },
      blocked_public_runtime_24h: 1,
      recommended_actions: ['review_allowed_origins', 'triage_unsafe_feedback'],
    })
    expect(result.launch_readiness.status).toBe('blocked')
    expect(result.launch_readiness.blockers.map((item) => item.code)).toContain('app_not_active')
    expect(result.launch_readiness.warnings.map((item) => item.code)).toContain('origin_denials_detected')
    expect(JSON.stringify(result.latest.build_log)).not.toContain('sk-secretsecretsecret')
    expect(JSON.stringify(result.latest.build_log)).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456')
  })

  it('redacts inline source content from source artifact summaries', () => {
    const summary = summarizeArtifactForOperator(artifacts[0]!)

    expect(JSON.stringify(summary)).not.toContain('do not expose raw source')
    expect(summary.metadata.files).toEqual([
      {
        path: 'app/page.tsx',
        bytes: 42,
        sha256: 'filehash',
      },
    ])
  })
})
