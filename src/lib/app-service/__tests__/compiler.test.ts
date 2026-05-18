import { describe, expect, it } from 'vitest'
import type { AppServiceSpec } from '@contracts/app-service'
import { compileAppServiceSpec } from '../compiler'

const baseSpec: AppServiceSpec = {
  schema_version: '1.0',
  kind: 'app_service',
  name: 'Support Concierge',
  slug: 'support-concierge',
  description: 'A public AI support service with lead capture.',
  category: 'support',
  audience: 'SMB support teams',
  outcome: 'Resolve common requests and collect qualified leads.',
  frontend: {
    strategy: 'manifest',
    theme: { mode: 'system', radius: 'sm' },
    pages: [],
    required_states: ['loading', 'error', 'setup_required'],
  },
  agents: [
    {
      key: 'support',
      role: 'Support agent',
      public_chat_enabled: true,
      memory_policy: 'visitor_scoped',
    },
  ],
  workflows: [
    {
      key: 'handoff',
      name: 'Human handoff',
      trigger: 'public_action',
      public_action_key: 'handoff',
    },
  ],
  integrations: [],
  secrets: [],
  channels: [],
  deployment: {
    default_target: 'lucid_hosted',
    allowed_targets: ['lucid_hosted'],
    runtime: {
      frontend_target: 'lucid_manifest',
      app_runtime_api_target: 'shared_lucid_next',
      agent_runtime_target: 'shared_worker',
      generation_runtime_target: 'shared_appgen_worker',
    },
  },
  eval_pack: [],
  marketplace: {
    tags: ['support'],
    demo_prompts: [],
    proof_page_enabled: true,
  },
}

describe('compileAppServiceSpec', () => {
  it('creates a deterministic manifest deployment plan', () => {
    const plan = compileAppServiceSpec(baseSpec)
    const again = compileAppServiceSpec(baseSpec)

    expect(plan.slug).toBe('support-concierge')
    expect(plan.frontendStrategy).toBe('manifest')
    expect(plan.deploymentTarget).toBe('lucid_hosted')
    expect(plan.checksum).toBe(again.checksum)
    expect(plan.frontendManifest.capabilities).toEqual([
      'chat',
      'feedback',
      'lead',
      'public_actions',
      'status',
    ])
    expect(plan.frontendManifest).toMatchInlineSnapshot(`
      {
        "agents": [
          {
            "key": "support",
            "memory_policy": "visitor_scoped",
            "public_chat_enabled": true,
            "role": "Support agent",
          },
        ],
        "audience": "SMB support teams",
        "capabilities": [
          "chat",
          "feedback",
          "lead",
          "public_actions",
          "status",
        ],
        "category": "support",
        "commerce": {
          "paid_actions": {},
        },
        "consent": {
          "transcript_retention_days": 30,
        },
        "description": "A public AI support service with lead capture.",
        "integrations": [],
        "kind": "app_service",
        "limits": {},
        "marketplace": {
          "demo_prompts": [],
          "proof_page_enabled": true,
          "tags": [
            "support",
          ],
        },
        "name": "Support Concierge",
        "outcome": "Resolve common requests and collect qualified leads.",
        "pages": [
          {
            "blocks": [
              {
                "enabled": true,
                "id": "hero",
                "props": {
                  "outcome": "Resolve common requests and collect qualified leads.",
                  "title": "Support Concierge",
                },
                "type": "hero",
              },
              {
                "enabled": true,
                "id": "summary",
                "props": {
                  "description": "A public AI support service with lead capture.",
                },
                "type": "service_summary",
              },
              {
                "enabled": true,
                "id": "demo",
                "props": {},
                "type": "demo_chat",
              },
              {
                "enabled": true,
                "id": "lead",
                "props": {},
                "type": "lead_form",
              },
              {
                "enabled": true,
                "id": "proof",
                "props": {},
                "type": "proof_metrics",
              },
            ],
            "path": "/",
            "title": "Support Concierge",
          },
        ],
        "public_api": {
          "base_path": "/api/app-runtime/v1/public/apps/support-concierge",
          "sdk_package": "@lucid/app-runtime-sdk",
        },
        "required_states": [
          "loading",
          "error",
          "setup_required",
        ],
        "schema_version": "1.0",
        "slug": "support-concierge",
        "team": null,
        "theme": {
          "mode": "system",
          "radius": "sm",
        },
        "workflows": [
          {
            "key": "handoff",
            "name": "Human handoff",
            "public_action_key": "handoff",
            "trigger": "public_action",
          },
        ],
      }
    `)
  })

  it('supplies a default first page when no frontend pages are provided', () => {
    const plan = compileAppServiceSpec(baseSpec)
    const pages = plan.frontendManifest.pages as Array<{ path: string; blocks: Array<{ type: string }> }>

    expect(pages[0]?.path).toBe('/')
    expect(pages[0]?.blocks.map((block) => block.type)).toContain('demo_chat')
    expect(pages[0]?.blocks.map((block) => block.type)).toContain('lead_form')
  })
})
