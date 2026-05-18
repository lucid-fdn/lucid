import { describe, expect, it } from 'vitest'
import { selectCapabilityPlan } from '../capability-selector.js'

describe('selectCapabilityPlan', () => {
  it('filters tool-ineligible integrations before tool assembly', () => {
    const plan = selectCapabilityPlan({
      plugins: [
        {
          slug: 'github',
          name: 'GitHub',
          tools: [{ name: 'list_issues', description: 'List issues', parameters: {} }],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'github',
          connectionId: 'conn-1',
        },
        {
          slug: 'notion',
          name: 'Notion',
          tools: [{ name: 'search', description: 'Search', parameters: {} }],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'notion',
        },
        {
          slug: 'empty',
          name: 'Empty',
          tools: [],
          config: {},
          kind: 'plugin',
          transport: 'remote-mcp',
          trustLevel: 'community',
          executionMode: 'gateway',
          authType: 'none',
          authProvider: null,
        },
      ],
    })

    expect(plan.toolPlugins.map((plugin) => plugin.slug)).toEqual(['github'])
    expect(plan.pluginDecisions).toEqual([
      {
        slug: 'github',
        selectedForTools: true,
        reason: 'eligible',
        relevance: 'background',
        executionFit: 'standard',
        priorityRank: 0,
      },
      {
        slug: 'notion',
        selectedForTools: false,
        reason: 'missing_connection',
        relevance: 'background',
        executionFit: 'standard',
      },
      {
        slug: 'empty',
        selectedForTools: false,
        reason: 'no_tools',
        relevance: 'background',
        executionFit: 'standard',
      },
    ])
  })

  it('prioritizes explicitly referenced integrations for tool assembly', () => {
    const plan = selectCapabilityPlan({
      userMessage: 'Use github to list issues and then summarize them',
      plugins: [
        {
          slug: 'slack',
          name: 'Slack',
          tools: [{ name: 'post_message', description: 'Post message', parameters: {} }],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'slack',
          connectionId: 'conn-slack',
        },
        {
          slug: 'github',
          name: 'GitHub',
          tools: [{ name: 'list_issues', description: 'List issues', parameters: {} }],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'github',
          connectionId: 'conn-github',
        },
      ],
    })

    expect(plan.toolPlugins.map((plugin) => plugin.slug)).toEqual(['github', 'slack'])
    expect(plan.pluginDecisions).toEqual([
      {
        slug: 'slack',
        selectedForTools: true,
        reason: 'eligible',
        relevance: 'background',
        executionFit: 'standard',
        priorityRank: 1,
      },
      {
        slug: 'github',
        selectedForTools: true,
        reason: 'eligible',
        relevance: 'explicit',
        executionFit: 'standard',
        priorityRank: 0,
      },
    ])
  })

  it('prefers in-process capabilities on autonomous runtimes without excluding gateway ones', () => {
    const plan = selectCapabilityPlan({
      runtimeFlavor: 'c2a_autonomous',
      plugins: [
        {
          slug: 'remote-research',
          name: 'Remote Research',
          tools: [{ name: 'search_web', description: 'Search web', parameters: {} }],
          config: {},
          kind: 'plugin',
          transport: 'remote-mcp',
          trustLevel: 'community',
          executionMode: 'gateway',
          authType: 'none',
          authProvider: null,
        },
        {
          slug: 'lucid-seo',
          name: 'Lucid SEO',
          tools: [{ name: 'research_keywords', description: 'Research keywords', parameters: {} }],
          config: {},
          kind: 'plugin',
          transport: 'embedded',
          trustLevel: 'internal',
          executionMode: 'in_process',
          authType: 'none',
          authProvider: null,
        },
      ],
    })

    expect(plan.toolPlugins.map((plugin) => plugin.slug)).toEqual(['lucid-seo', 'remote-research'])
    expect(plan.pluginDecisions).toEqual([
      {
        slug: 'remote-research',
        selectedForTools: true,
        reason: 'eligible',
        relevance: 'background',
        executionFit: 'standard',
        priorityRank: 1,
      },
      {
        slug: 'lucid-seo',
        selectedForTools: true,
        reason: 'eligible',
        relevance: 'background',
        executionFit: 'preferred',
        priorityRank: 0,
      },
    ])
  })

  it('prefers in-process capabilities for runtime-native ownership too', () => {
    const plan = selectCapabilityPlan({
      runtimeFlavor: 'shared',
      channelOwnership: 'runtime_native',
      plugins: [
        {
          slug: 'remote-research',
          name: 'Remote Research',
          tools: [{ name: 'search_web', description: 'Search web', parameters: {} }],
          config: {},
          kind: 'plugin',
          transport: 'remote-mcp',
          trustLevel: 'community',
          executionMode: 'gateway',
          authType: 'none',
          authProvider: null,
        },
        {
          slug: 'lucid-seo',
          name: 'Lucid SEO',
          tools: [{ name: 'research_keywords', description: 'Research keywords', parameters: {} }],
          config: {},
          kind: 'plugin',
          transport: 'embedded',
          trustLevel: 'internal',
          executionMode: 'in_process',
          authType: 'none',
          authProvider: null,
        },
      ],
    })

    expect(plan.toolPlugins.map((plugin) => plugin.slug)).toEqual(['lucid-seo', 'remote-research'])
    expect(plan.pluginDecisions).toEqual([
      {
        slug: 'remote-research',
        selectedForTools: true,
        reason: 'eligible',
        relevance: 'background',
        executionFit: 'standard',
        priorityRank: 1,
      },
      {
        slug: 'lucid-seo',
        selectedForTools: true,
        reason: 'eligible',
        relevance: 'background',
        executionFit: 'preferred',
        priorityRank: 0,
      },
    ])
  })

  it('suppresses background integrations on trivial turns', () => {
    const plan = selectCapabilityPlan({
      userMessage: 'hi',
      plugins: [
        {
          slug: 'github',
          name: 'GitHub',
          tools: [{ name: 'list_issues', description: 'List issues', parameters: {} }],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'github',
          connectionId: 'conn-github',
        },
        {
          slug: 'slack',
          name: 'Slack',
          tools: [{ name: 'post_message', description: 'Post message', parameters: {} }],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'slack',
          connectionId: 'conn-slack',
        },
      ],
    })

    expect(plan.toolPlugins).toEqual([])
    expect(plan.pluginDecisions).toEqual([
      {
        slug: 'github',
        selectedForTools: false,
        reason: 'trivial_turn',
        relevance: 'background',
        executionFit: 'standard',
      },
      {
        slug: 'slack',
        selectedForTools: false,
        reason: 'trivial_turn',
        relevance: 'background',
        executionFit: 'standard',
      },
    ])
  })

  it('still keeps background integrations eligible when the turn is no longer purely trivial', () => {
    const plan = selectCapabilityPlan({
      userMessage: 'hi github',
      plugins: [
        {
          slug: 'github',
          name: 'GitHub',
          tools: [{ name: 'list_issues', description: 'List issues', parameters: {} }],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'github',
          connectionId: 'conn-github',
        },
        {
          slug: 'slack',
          name: 'Slack',
          tools: [{ name: 'post_message', description: 'Post message', parameters: {} }],
          config: {},
          kind: 'integration',
          transport: 'nango',
          trustLevel: 'verified',
          executionMode: 'gateway',
          authType: 'oauth2',
          authProvider: 'slack',
          connectionId: 'conn-slack',
        },
      ],
    })

    expect(plan.toolPlugins.map((plugin) => plugin.slug)).toEqual(['github', 'slack'])
    expect(plan.pluginDecisions).toEqual([
      {
        slug: 'github',
        selectedForTools: true,
        reason: 'eligible',
        relevance: 'explicit',
        executionFit: 'standard',
        priorityRank: 0,
      },
      {
        slug: 'slack',
        selectedForTools: true,
        reason: 'eligible',
        relevance: 'background',
        executionFit: 'standard',
        priorityRank: 1,
      },
    ])
  })
})
