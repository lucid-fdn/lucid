import { describe, expect, it } from 'vitest'
import { buildToolAwarenessPrompt } from '../awareness.js'
import type { ActivatedPlugin } from '../../plugin-types.js'
import type { ClientToolDefinition, ToolSelectionSummary } from '../types.js'

function clientTool(name: string): ClientToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description: `${name} description`,
    },
  }
}

describe('buildToolAwarenessPrompt', () => {
  it('describes only the selected tool surface and hidden-tool budget note', () => {
    const plugins = [{
      slug: 'github',
      tools: [
        { name: 'list_issues', description: 'List issues', parameters: { type: 'object' } },
        { name: 'close_issue', description: 'Close issue', parameters: { type: 'object' } },
      ],
    }] satisfies Array<Pick<ActivatedPlugin, 'slug' | 'tools'>>

    const selection: ToolSelectionSummary = {
      engine: 'openclaw',
      model: 'openai/gpt-4.1',
      provider: 'openai',
      originalCount: 130,
      selectedCount: 128,
      maxClientTools: 128,
      decisions: [
        { toolName: 'wallet_balance', included: true, reason: 'within_budget' },
        { toolName: 'github__list_issues', included: true, reason: 'within_budget' },
        { toolName: 'github__close_issue', included: false, reason: 'provider_budget' },
      ],
    }

    const prompt = buildToolAwarenessPrompt({
      selectedClientTools: [clientTool('wallet_balance'), clientTool('github__list_issues')],
      selectedBuiltInTools: [{
        name: 'wallet_balance',
        description: 'Inspect wallet balances',
        when_to_use: ['Use when the user asks about wallet balances.'],
      }],
      plugins: plugins as ActivatedPlugin[],
      approvalRequiredTools: ['github__close_issue'],
      selection,
    })

    expect(prompt).toContain('wallet_balance')
    expect(prompt).toContain('github__list_issues')
    expect(prompt).not.toContain('github__close_issue')
    expect(prompt).toContain('Run-scoped capability limits: 1 eligible tools are hidden')
    expect(prompt).not.toContain('Approval-gated tools:')
  })
})
