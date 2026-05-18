import { describe, it, expect } from 'vitest'
import {
  defineTool,
  buildToolPrompt,
  composeSkill,
  CATEGORY_ORDER,
} from '../index.js'
import type {
  EnrichedToolDefinition,
  ToolDefinition,
  TransactionSigner,
  TransactionRequest,
  EIP712TypedData,
  ExecutionResult,
  SignatureResult,
} from '../index.js'

// ── defineTool ──────────────────────────────────────────────────────

describe('defineTool', () => {
  it('returns the input unchanged', () => {
    const def: ToolDefinition = {
      name: 'test_tool',
      description: 'A test tool',
      category: 'read',
    }
    expect(defineTool(def)).toBe(def)
  })

  it('preserves generic type on examples', () => {
    const def = defineTool<{ chain: string }>({
      name: 'get_price',
      description: 'Get price',
      category: 'read',
      when_to_use: ['user asks about price'],
      examples: [{ user: 'price of SOL', tool_call: { chain: 'solana' } }],
    })
    expect(def.examples?.[0].tool_call.chain).toBe('solana')
  })
})

// ── buildToolPrompt ─────────────────────────────────────────────────

describe('buildToolPrompt', () => {
  const readTool: EnrichedToolDefinition = {
    name: 'get_price',
    description: 'Get current USD price of a token',
    category: 'read',
    dangerLevel: 'safe',
    when_to_use: ['user asks "price of X"', 'need value before swap', 'third trigger capped'],
    examples: [
      { user: 'what is SOL worth?', tool_call: {} },
      { user: 'ETH price', tool_call: {} },
    ],
    related_tools: ['search_token'],
  }

  const reasonTool: EnrichedToolDefinition = {
    name: 'risk_check',
    description: 'Assess risk before trading',
    category: 'reason',
    when_to_use: ['before any trade to assess safety'],
  }

  const actTool: EnrichedToolDefinition = {
    name: 'dex_swap',
    description: 'Execute a token swap',
    category: 'act',
    dangerLevel: 'elevated',
    when_to_use: ['user wants to swap tokens'],
    requires_confirmation: true,
    related_tools: ['dex_get_quote', 'risk_check'],
  }

  it('includes tool name and description', () => {
    const result = buildToolPrompt([readTool])
    expect(result).toContain('get_price')
    expect(result).toContain('Get current USD price of a token')
  })

  it('caps when_to_use at 2 entries', () => {
    const result = buildToolPrompt([readTool])
    expect(result).toContain('user asks "price of X"')
    expect(result).toContain('need value before swap')
    expect(result).not.toContain('third trigger capped')
  })

  it('shows first example only', () => {
    const result = buildToolPrompt([readTool])
    expect(result).toContain('what is SOL worth?')
    expect(result).not.toContain('ETH price')
  })

  it('includes related_tools', () => {
    const result = buildToolPrompt([readTool])
    expect(result).toContain('search_token')
  })

  it('marks tools requiring confirmation', () => {
    const result = buildToolPrompt([actTool])
    expect(result).toContain('requires confirmation')
  })

  it('returns empty string for empty array', () => {
    expect(buildToolPrompt([])).toBe('')
  })

  it('sorts by category: read < reason < act', () => {
    const result = buildToolPrompt([actTool, readTool, reasonTool])
    const readPos = result.indexOf('get_price')
    const reasonPos = result.indexOf('risk_check')
    const actPos = result.indexOf('dex_swap')
    expect(readPos).toBeLessThan(reasonPos)
    expect(reasonPos).toBeLessThan(actPos)
  })

  it('does not contain undefined or null', () => {
    const result = buildToolPrompt([readTool, actTool, reasonTool])
    expect(result).not.toContain('undefined')
    expect(result).not.toContain('null')
  })
})

// ── composeSkill ────────────────────────────────────────────────────

describe('composeSkill', () => {
  it('joins fragments with double newline', () => {
    const result = composeSkill(['Rule 1', 'Rule 2', 'Workflow'])
    expect(result).toBe('Rule 1\n\nRule 2\n\nWorkflow')
  })

  it('filters empty strings', () => {
    const result = composeSkill(['Rule 1', '', '  ', 'Rule 2'])
    expect(result).toBe('Rule 1\n\nRule 2')
  })

  it('trims whitespace', () => {
    const result = composeSkill(['  Rule 1  ', '\n Rule 2 \n'])
    expect(result).toBe('Rule 1\n\nRule 2')
  })

  it('returns empty string for empty array', () => {
    expect(composeSkill([])).toBe('')
  })

  it('returns empty string for all-empty fragments', () => {
    expect(composeSkill(['', '  ', '\n'])).toBe('')
  })
})

// ── CATEGORY_ORDER ──────────────────────────────────────────────────

describe('CATEGORY_ORDER', () => {
  it('orders read before reason before act', () => {
    expect(CATEGORY_ORDER['read']).toBeLessThan(CATEGORY_ORDER['reason'])
    expect(CATEGORY_ORDER['reason']).toBeLessThan(CATEGORY_ORDER['act'])
  })

  it('treats web3 as read (legacy)', () => {
    expect(CATEGORY_ORDER['web3']).toBe(CATEGORY_ORDER['read'])
  })

  it('treats trading as act (legacy)', () => {
    expect(CATEGORY_ORDER['trading']).toBe(CATEGORY_ORDER['act'])
  })
})

// ── TransactionSigner (type compatibility) ──────────────────────────

describe('TransactionSigner interface', () => {
  it('can be implemented with a mock', async () => {
    const mockSigner: TransactionSigner = {
      executeTransaction: async (tx: TransactionRequest): Promise<ExecutionResult> => {
        if (tx.chain === 'evm') {
          return { success: true, txHash: '0xabc' }
        }
        return { success: true, txHash: 'abc123' }
      },
      signTypedData: async (typedData: EIP712TypedData): Promise<SignatureResult> => {
        return { success: true, signature: '0xsig' }
      },
    }

    const evmResult = await mockSigner.executeTransaction({
      chain: 'evm',
      to: '0x123',
      value: '1000000000',
    })
    expect(evmResult.success).toBe(true)
    expect(evmResult.txHash).toBe('0xabc')

    const solResult = await mockSigner.executeTransaction({
      chain: 'solana',
      serializedTransaction: 'base64tx',
    })
    expect(solResult.success).toBe(true)

    const sigResult = await mockSigner.signTypedData({
      domain: { name: 'Test' },
      types: { Order: [{ name: 'amount', type: 'uint256' }] },
      primaryType: 'Order',
      message: { amount: '100' },
    })
    expect(sigResult.success).toBe(true)
    expect(sigResult.signature).toBe('0xsig')
  })

  it('supports error results', async () => {
    const failingSigner: TransactionSigner = {
      executeTransaction: async () => ({ success: false, error: 'insufficient funds' }),
      signTypedData: async () => ({ success: false, error: 'user rejected' }),
    }

    const result = await failingSigner.executeTransaction({
      chain: 'evm',
      to: '0x123',
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('insufficient funds')
  })
})
