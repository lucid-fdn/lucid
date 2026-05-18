import { describe, expect, it } from 'vitest'
import {
  manifestContainsDisallowedData,
  sanitizeGeneratedAppManifest,
} from '../manifest-sanitizer'

describe('generated app manifest sanitizer', () => {
  it('strips secret, prompt, oauth, script, and internal execution keys from manifests', () => {
    const manifest = sanitizeGeneratedAppManifest({
      schema_version: '1.0',
      kind: 'app_service',
      name: 'Support Concierge',
      slug: 'support-concierge',
      description: 'A safe public service.',
      system_prompt: 'Never expose this.',
      V0_API_KEY: 'v0_super_secret',
      theme: {
        mode: 'dark',
        radius: 'md',
        primary_color: '#2563eb',
        font_family: 'Inter, system-ui',
        style: 'body{display:none}',
      },
      pages: [
        {
          path: '/',
          title: 'Home',
          blocks: [
            {
              id: 'hero',
              type: 'hero',
              props: {
                title: 'Support Concierge',
                href: 'javascript:alert(1)',
                onClick: 'steal()',
                dangerouslySetInnerHTML: { __html: '<script>alert(1)</script>' },
                nested: {
                  Authorization: 'Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456',
                },
              },
            },
          ],
        },
      ],
      capabilities: ['chat', 'lead', 'unknown'],
      public_api: {
        base_path: '/api/app-runtime/v1/public/apps/support-concierge',
        sdk_package: '@lucid/app-runtime-sdk',
        internal_route: '/api/db/raw',
      },
      agents: [{
        key: 'support',
        role: 'Support',
        public_chat_enabled: true,
        memory_policy: 'visitor_scoped',
        assistant_id: '6edccf93-3f7d-492d-a7d4-29d54d3d8949',
        system_prompt: 'hidden prompt',
      }],
      workflows: [{
        key: 'handoff',
        name: 'Handoff',
        trigger: 'public_action',
        public_action_key: 'handoff',
        dag_id: '2d34bcc7-5db8-4e80-a681-5b158c83193d',
      }],
      oauth_tokens: { refresh_token: 'refresh_secret' },
      marketplace: {
        tags: ['support'],
        demo_prompts: ['How do you help?'],
        creator_attribution: 'Built with Lucid',
      },
      consent: {
        privacy_url: 'https://example.com/privacy',
        terms_url: 'javascript:alert(1)',
      },
      limits: {
        public_requests_per_day: 100,
        monthly_cost_cents: 5000,
        unsupported: 1,
      },
    }, {
      name: 'Fallback',
      slug: 'fallback',
    })

    const serialized = JSON.stringify(manifest)
    expect(serialized).not.toContain('v0_super_secret')
    expect(serialized).not.toContain('hidden prompt')
    expect(serialized).not.toContain('refresh_secret')
    expect(serialized).not.toContain('assistant_id')
    expect(serialized).not.toContain('dag_id')
    expect(serialized).not.toContain('javascript:')
    expect(serialized).not.toContain('dangerouslySetInnerHTML')
    expect(serialized).not.toContain('onClick')
    expect(serialized).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456')
    expect(manifest.capabilities).toEqual(['chat', 'lead'])
    expect(manifest.public_api).toEqual({
      base_path: '/api/app-runtime/v1/public/apps/support-concierge',
      sdk_package: '@lucid/app-runtime-sdk',
    })
    expect(manifest.limits).toEqual({
      public_requests_per_day: 100,
      monthly_cost_cents: 5000,
    })
  })

  it('detects manifests that would change under sanitization', () => {
    expect(manifestContainsDisallowedData({
      name: 'App',
      slug: 'app',
      VERCEL_API_TOKEN: 'vercel_secret',
    })).toBe(true)

    expect(manifestContainsDisallowedData(sanitizeGeneratedAppManifest({
      name: 'App',
      slug: 'app',
      capabilities: ['status'],
    }, {
      name: 'App',
      slug: 'app',
    }))).toBe(false)

    expect(manifestContainsDisallowedData({
      name: 'App',
      slug: 'app',
      pages: [{
        path: '/',
        title: 'Home',
        blocks: [{
          type: 'hero',
          props: {
            title: 'Safe title',
            href: 'https://example.com',
          },
        }],
      }],
    })).toBe(false)
  })

  it('keeps provider-neutral paid public action declarations and strips commerce secrets', () => {
    const manifest = sanitizeGeneratedAppManifest({
      name: 'Research Desk',
      slug: 'research-desk',
      capabilities: ['status'],
      commerce: {
        paid_actions: {
          deep_report: {
            mode: 'enforce',
            amount: { amount: 299, currency: 'USD' },
            provider: 'machine_payments_x402',
            rail: 'machine_payment_x402',
            resource_type: 'generated_app_action',
            resource_id: 'report:deep',
            refund_policy: 'manual_review',
            api_key: 'sk-should-not-survive-123456789',
          },
          unsafe: {
            mode: 'enforce',
            amount: { amount: -5, currency: 'USD' },
          },
        },
      },
      workflows: [{
        key: 'deep-report',
        name: 'Deep report',
        trigger: 'public_action',
        public_action_key: 'deep_report',
        commerce: {
          mode: 'enforce',
          amount: { amount: 499, currency: 'EUR' },
          provider_secret: 'sk-should-not-survive-123456789',
          label: 'Deep report',
        },
      }],
    }, {
      name: 'Fallback',
      slug: 'fallback',
    })

    expect(manifest.capabilities).toEqual(['status', 'public_actions', 'paid_actions'])
    expect(manifest.commerce).toEqual({
      paid_actions: {
        deep_report: {
          mode: 'enforce',
          amount: { amount: 299, currency: 'usd' },
          provider: 'machine_payments_x402',
          rail: 'machine_payment_x402',
          resource_type: 'generated_app_action',
          resource_id: 'report:deep',
          refund_policy: 'manual_review',
        },
      },
    })
    expect(manifest.workflows).toEqual([{
      key: 'deep-report',
      name: 'Deep report',
      trigger: 'public_action',
      public_action_key: 'deep_report',
      commerce: {
        mode: 'enforce',
        amount: { amount: 499, currency: 'eur' },
        resource_type: 'generated_app_action',
        label: 'Deep report',
        refund_policy: 'manual_review',
      },
    }])
    expect(JSON.stringify(manifest)).not.toContain('sk-should-not-survive')
  })
})
