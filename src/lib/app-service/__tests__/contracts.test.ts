import { describe, expect, it } from 'vitest'
import {
  AppServiceSpecSchema,
  FrontendBuildBriefSchema,
  PUBLIC_APP_RUNTIME_OPENAPI_PATH,
} from '@contracts/app-service'

describe('app service contracts', () => {
  it('accepts a valid app service spec with shared runtime defaults', () => {
    const spec = AppServiceSpecSchema.parse({
      schema_version: '1.0',
      kind: 'app_service',
      name: 'Support Concierge',
      slug: 'support-concierge',
      description: 'Answers support questions from approved knowledge.',
      category: 'support',
      audience: 'Support teams',
      outcome: 'Resolve common requests.',
      frontend: {
        strategy: 'manifest',
        theme: { mode: 'system', radius: 'sm' },
        pages: [],
        required_states: ['loading', 'error', 'setup_required'],
      },
      agents: [{
        key: 'support',
        role: 'Support agent',
        public_chat_enabled: true,
        memory_policy: 'visitor_scoped',
      }],
    })

    expect(spec.deployment.runtime).toMatchObject({
      app_runtime_api_target: 'shared_lucid_next',
      agent_runtime_target: 'shared_worker',
      generation_runtime_target: 'shared_appgen_worker',
    })
  })

  it('rejects invalid specs and non-public frontend brief contracts', () => {
    expect(() => AppServiceSpecSchema.parse({
      schema_version: '1.0',
      kind: 'app_service',
      name: 'Bad App',
      slug: 'Bad App',
      description: 'x',
      category: 'support',
      audience: 'x',
      outcome: 'x',
      frontend: {},
      agents: [],
    })).toThrow()

    expect(() => FrontendBuildBriefSchema.parse({
      schema_version: '1.0',
      app_name: 'Bad App',
      app_slug: 'bad-app',
      purpose: 'test',
      audience: 'test',
      outcome: 'test',
      frontend: { strategy: 'manifest' },
      public_api_contract_url: '/api/app-services/internal',
      public_api_contract: {},
      allowed_runtime_endpoints: [],
      generated_frontend_env: {},
    })).toThrow('public_api_contract_url')

    expect(FrontendBuildBriefSchema.parse({
      schema_version: '1.0',
      app_name: 'Good App',
      app_slug: 'good-app',
      purpose: 'test',
      audience: 'test',
      outcome: 'test',
      frontend: { strategy: 'manifest' },
      public_api_contract_url: PUBLIC_APP_RUNTIME_OPENAPI_PATH,
      public_api_contract: {},
      allowed_runtime_endpoints: [],
      generated_frontend_env: {},
    }).public_api_contract_url).toBe(PUBLIC_APP_RUNTIME_OPENAPI_PATH)
  })
})
