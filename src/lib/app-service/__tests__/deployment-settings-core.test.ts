import { describe, expect, it } from 'vitest'
import type { AppDeployment } from '@contracts/app-service'
import {
  buildAppDeploymentSettingsUpdate,
  buildPauseDeploymentUpdate,
  buildResumeDeploymentUpdate,
  deriveResumeStatus,
} from '../deployment-settings-core'

const app: AppDeployment = {
  id: '0a3f7cb8-0e10-4c7c-bde9-1d8af7066c4a',
  org_id: '8abed822-343a-4f6b-83b8-5ad167f0743d',
  project_id: '9004b6c6-f9d0-42cb-ae3c-522dd5367ef5',
  generation_run_id: '69777b10-56a8-4aa6-a5c5-4a0b6e63045b',
  name: 'Support Concierge',
  slug: 'support-concierge',
  status: 'active',
  visibility: 'public',
  frontend_strategy: 'manifest',
  frontend_manifest: {
    name: 'Support Concierge',
    slug: 'support-concierge',
    theme: { mode: 'system', radius: 'sm' },
    public_api: { base_path: '/api/app-runtime/v1/public/apps/support-concierge' },
  },
  preview_url: '/apps/support-concierge',
  public_url: '/apps/support-concierge',
  assistant_ids: [],
  dag_ids: [],
  template_deployment_ids: [],
  deployment_target: 'lucid_hosted',
  latest_artifact_id: '8e5c3e98-9f48-4f99-9fb5-14b4f3a7d5e7',
  created_by: '98fd4493-317e-4182-9f68-c3e379f770a5',
  created_at: '2026-04-29T09:00:00.000Z',
  updated_at: '2026-04-29T09:15:00.000Z',
}

describe('deployment settings core', () => {
  it('builds settings updates while keeping public API paths aligned with slug changes', () => {
    const plan = buildAppDeploymentSettingsUpdate(app, {
      name: 'AI Support Desk',
      slug: 'ai-support-desk',
      visibility: 'unlisted',
      theme: { mode: 'dark', primary_color: '#2563eb' },
      limits: { public_requests_per_day: 500 },
      consent: { privacy_url: 'https://example.com/privacy' },
    })

    expect(plan.changedFields).toEqual(['name', 'slug', 'visibility', 'theme', 'limits', 'consent'])
    expect(plan.update).toMatchObject({
      name: 'AI Support Desk',
      slug: 'ai-support-desk',
      visibility: 'unlisted',
      preview_url: '/apps/ai-support-desk',
      public_url: '/apps/ai-support-desk',
    })
    expect(plan.update.frontend_manifest).toMatchObject({
      name: 'AI Support Desk',
      slug: 'ai-support-desk',
      public_api: { base_path: '/api/app-runtime/v1/public/apps/ai-support-desk' },
      theme: { mode: 'dark', radius: 'sm', primary_color: '#2563eb' },
      limits: { public_requests_per_day: 500 },
      consent: { privacy_url: 'https://example.com/privacy' },
    })
  })

  it('updates generated app paid action commerce without exposing provider internals', () => {
    const plan = buildAppDeploymentSettingsUpdate({
      ...app,
      frontend_manifest: {
        ...app.frontend_manifest,
        capabilities: ['status', 'public_actions'],
        workflows: [{
          key: 'deep-report',
          name: 'Deep report',
          trigger: 'public_action',
          public_action_key: 'deep_report',
        }],
      },
    }, {
      commerce: {
        paid_actions: {
          deep_report: {
            mode: 'shadow',
            amount: { amount: 1200, currency: 'USD' },
            provider: 'machine_payments_x402',
            rail: 'machine_payment_x402',
            resource_type: 'generated_app_action',
            free_quota_per_session: 1,
            refund_policy: 'manual_review',
          },
        },
      },
    })

    expect(plan.changedFields).toEqual(['commerce'])
    expect(plan.update.frontend_manifest).toMatchObject({
      capabilities: ['status', 'public_actions', 'paid_actions'],
      commerce: {
        paid_actions: {
          deep_report: {
            mode: 'shadow',
            amount: { amount: 1200, currency: 'usd' },
            provider: 'machine_payments_x402',
            rail: 'machine_payment_x402',
            free_quota_per_session: 1,
          },
        },
      },
    })
  })

  it('removes paid action commerce when an action is switched off', () => {
    const plan = buildAppDeploymentSettingsUpdate({
      ...app,
      frontend_manifest: {
        ...app.frontend_manifest,
        capabilities: ['status', 'public_actions', 'paid_actions'],
        commerce: {
          paid_actions: {
            deep_report: {
              mode: 'enforce',
              amount: { amount: 1200, currency: 'usd' },
              resource_type: 'generated_app_action',
              refund_policy: 'manual_review',
            },
          },
        },
      },
    }, {
      commerce: {
        paid_actions: {
          deep_report: {
            mode: 'off',
            resource_type: 'generated_app_action',
            refund_policy: 'manual_review',
          },
        },
      },
    })

    expect(plan.changedFields).toEqual(['commerce'])
    expect(plan.update.frontend_manifest).toMatchObject({
      commerce: { paid_actions: {} },
    })
  })

  it('pauses active app deployments and resumes private apps back to preview by default', () => {
    expect(buildPauseDeploymentUpdate(app)).toEqual({ status: 'paused' })

    const pausedPrivateApp: AppDeployment = {
      ...app,
      status: 'paused',
      visibility: 'private',
      public_url: null,
    }

    expect(deriveResumeStatus(pausedPrivateApp)).toBe('preview')
    expect(buildResumeDeploymentUpdate(pausedPrivateApp)).toEqual({ status: 'preview' })
  })

  it('resumes public paused apps as active by default', () => {
    expect(buildResumeDeploymentUpdate({ ...app, status: 'paused' })).toEqual({ status: 'active' })
  })

  it('rejects archived app setting and lifecycle changes', () => {
    const archivedApp: AppDeployment = { ...app, status: 'archived' }

    expect(() => buildAppDeploymentSettingsUpdate(archivedApp, { name: 'Archived' })).toThrow('Archived')
    expect(() => buildPauseDeploymentUpdate(archivedApp)).toThrow('Archived')
  })
})
