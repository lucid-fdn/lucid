import { describe, expect, it } from 'vitest'
import type { AppServiceSpec } from '@contracts/app-service'
import {
  PUBLIC_APP_RUNTIME_OPENAPI_PATH,
  buildFrontendBriefFromSpec,
} from '../frontend-brief'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('frontend brief', () => {
  it('builds a provider-safe v0 brief without internal prompts, provider refs, OAuth tokens, or private memory', () => {
    const spec: AppServiceSpec = {
      schema_version: '1.0',
      kind: 'app_service',
      name: 'Support Concierge',
      slug: 'support-concierge',
      description: 'Answers support and pricing questions.',
      category: 'support',
      audience: 'Website visitors',
      outcome: 'Qualified support requests',
      frontend: {
        strategy: 'generated_code',
        theme: { mode: 'system', radius: 'sm' },
        pages: [
          {
            path: '/',
            title: 'Support Concierge',
            blocks: [
              {
                id: 'hero',
                type: 'hero',
                props: {
                  headline: 'Get help now',
                  cta_url: 'https://example.com/start',
                  system_prompt: 'hidden agent prompt',
                  provider_refs: { v0: { chat_id: 'chat_secret' } },
                  nested: {
                    oauth_refresh_token: 'refresh_secret',
                    private_memory: 'private visitor memory',
                    safe_copy: 'We respond in two minutes.',
                  },
                },
              },
            ],
          },
        ],
        required_states: ['loading', 'error', 'rate_limited'],
      },
      agents: [
        {
          key: 'primary',
          role: 'Support concierge',
          template: {
            kind: 'agent',
            system_prompt: 'You are the hidden system prompt.',
          },
          assistant_id: uuid,
          public_chat_enabled: true,
          memory_policy: 'private',
        },
      ],
      team: {
        key: 'handoff-team',
        template: {
          kind: 'team',
          objective: 'Handle escalations.',
          members: [
            {
              role: 'Escalation',
              system_prompt: 'Hidden team prompt.',
            },
          ],
          edges: [],
        },
        crew_id: uuid,
        public_chat_enabled: true,
      },
      workflows: [
        {
          key: 'support-workflow',
          name: 'Support Workflow',
          dag_id: uuid,
          trigger: 'manual',
        },
      ],
      integrations: [
        {
          provider: 'oauth-crm',
          label: 'CRM',
          required: true,
          scopes: ['contacts:read'],
          tools: ['sync_contacts'],
        },
      ],
      secrets: [
        {
          key: 'OPENAI_API_KEY',
          label: 'OpenAI',
          required: true,
          target: 'lucid_server',
          description: 'Server-only key.',
        },
      ],
      channels: [],
      deployment: {
        default_target: 'lucid_hosted',
        allowed_targets: ['lucid_hosted'],
        runtime: {
          frontend_target: 'v0_vercel',
          app_runtime_api_target: 'shared_lucid_next',
          agent_runtime_target: 'shared_worker',
          generation_runtime_target: 'shared_appgen_worker',
        },
      },
      eval_pack: [],
      marketplace: {
        tags: [],
        demo_prompts: [],
        proof_page_enabled: true,
      },
    }

    const brief = buildFrontendBriefFromSpec(spec)
    const serialized = JSON.stringify(brief)

    expect(brief.public_api_contract_url).toBe(PUBLIC_APP_RUNTIME_OPENAPI_PATH)
    expect(brief.frontend.pages[0]?.blocks[0]?.props).toMatchObject({
      headline: 'Get help now',
      cta_url: 'https://example.com/start',
      nested: { safe_copy: 'We respond in two minutes.' },
    })
    expect(serialized).not.toContain('/api/app-services')
    expect(serialized).not.toContain('hidden agent prompt')
    expect(serialized).not.toContain('Hidden team prompt')
    expect(serialized).not.toContain('refresh_secret')
    expect(serialized).not.toContain('private visitor memory')
    expect(serialized).not.toContain('chat_secret')
    expect(serialized).not.toContain('OPENAI_API_KEY')
    expect(serialized).not.toContain(uuid)
  })
})
