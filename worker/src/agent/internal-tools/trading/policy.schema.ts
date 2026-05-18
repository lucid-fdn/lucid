import type { EnrichedToolDefinition } from '@lucid-fdn/agent-tools-core'

export const tradingPolicySchema: EnrichedToolDefinition = {
  name: 'get_trading_policy',
  description:
    'Get the current trading policy settings for this agent — limits, allowed chains, allowed tokens, slippage, daily usage.',
  category: 'internal',
  dangerLevel: 'safe' as const,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  when_to_use: [
    'user asks about trading limits or allowed chains',
    'user asks "what can I trade" or "what are my limits"',
    'user asks about daily usage or remaining allowance',
    'user asks about trading settings or slippage',
  ],
  examples: [
    { user: 'what are my trading limits?', tool_call: {} },
    { user: 'which chains can I trade on?', tool_call: {} },
  ],
}
