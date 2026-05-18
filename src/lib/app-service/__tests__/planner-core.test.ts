import { describe, expect, it } from 'vitest'
import type { AppGenerationRun } from '@contracts/app-service'
import {
  buildPlannerPrompt,
  createDeterministicAppServicePlan,
  planInputFromGenerationRun,
} from '../planner-core'

describe('app service planner core', () => {
  it('creates a production-shaped deterministic app service spec', () => {
    const result = createDeterministicAppServicePlan({
      prompt: 'Build a customer support assistant for pricing and onboarding questions.',
      preferredName: 'Support Concierge',
      preferredSlug: 'Support Concierge!',
    })

    expect(result.spec.name).toBe('Support Concierge')
    expect(result.spec.slug).toBe('support-concierge')
    expect(result.spec.category).toBe('support')
    expect(result.spec.frontend.strategy).toBe('manifest')
    expect(result.spec.agents).toHaveLength(1)
    expect(result.spec.agents[0].public_chat_enabled).toBe(true)
    expect(result.spec.deployment.runtime.agent_runtime_target).toBe('shared_worker')
    expect(result.spec.deployment.runtime.generation_runtime_target).toBe('shared_appgen_worker')
  })

  it('keeps private/internal prompts off public chat by default', () => {
    const result = createDeterministicAppServicePlan({
      prompt: 'Create an internal only ops assistant for private incident reports.',
    })

    expect(result.spec.agents[0].public_chat_enabled).toBe(false)
    expect(result.spec.agents[0].memory_policy).toBe('private')
    expect(result.spec.frontend.pages[0].blocks.some((block) => block.type === 'demo_chat')).toBe(false)
  })

  it('maps generation run input into planner hints', () => {
    const run = {
      prompt: 'Create a sales app.',
      org_id: '2f9a9e5e-9d0d-43d0-8559-d4dccf66b8c9',
      project_id: '8c2ff08b-af6b-40d4-8313-5c2eda54f548',
      input: {
        preferredName: 'Pipeline Pilot',
        category: 'sales',
        platformBlueprintSlug: 'ai-sdr-lead-qualifier',
        mode: 'deterministic',
        ignored: true,
      },
    } as unknown as AppGenerationRun

    expect(planInputFromGenerationRun(run)).toMatchObject({
      prompt: 'Create a sales app.',
      orgId: '2f9a9e5e-9d0d-43d0-8559-d4dccf66b8c9',
      projectId: '8c2ff08b-af6b-40d4-8313-5c2eda54f548',
      preferredName: 'Pipeline Pilot',
      category: 'sales',
      blueprintSlug: 'ai-sdr-lead-qualifier',
      mode: 'deterministic',
    })
  })

  it('uses a platform blueprint as the deterministic one-click plan', () => {
    const result = createDeterministicAppServicePlan({
      prompt: 'One click from the platform catalog.',
      blueprintSlug: 'content-engine',
    })

    expect(result.spec.slug).toBe('content-engine')
    expect(result.spec.category).toBe('content')
    expect(result.recommended_next_steps).toContain('Add brand voice')
  })

  it('serializes platform defaults for the AI planner', () => {
    const prompt = buildPlannerPrompt({
      prompt: 'Build a knowledge assistant.',
      preferredSlug: 'knowledge-buddy',
    })

    expect(JSON.parse(prompt)).toMatchObject({
      user_prompt: 'Build a knowledge assistant.',
      preferred_slug: 'knowledge-buddy',
      platform_defaults: {
        frontend_target: 'lucid_manifest',
        app_runtime_api_target: 'shared_lucid_next',
        agent_runtime_target: 'shared_worker',
        generation_runtime_target: 'shared_appgen_worker',
      },
    })
  })
})
