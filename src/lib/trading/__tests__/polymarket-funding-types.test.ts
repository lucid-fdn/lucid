/**
 * Polymarket Funding — Type and contract tests.
 *
 * Validates that Bridge/Funding types are correctly defined and
 * the API response shapes match expectations.
 */

import { describe, it, expect } from 'vitest'
import type {
  FundingInfo,
  FundingApiResponse,
  WithdrawApiRequest,
  WithdrawApiResponse,
} from '@/lib/trading/polymarket/types'

describe('Funding types', () => {
  it('FundingInfo has all required fields', () => {
    const funding: FundingInfo = {
      solanaDepositAddress: 'SoLaNaAddr123',
      evmDepositAddress: '0x123',
      btcDepositAddress: 'bc1q123',
      note: 'Only certain tokens supported',
    }

    expect(funding.solanaDepositAddress).toBeTruthy()
    expect(funding.evmDepositAddress).toBeTruthy()
    expect(funding.btcDepositAddress).toBeTruthy()
    expect(funding.note).toBeTruthy()
  })

  it('FundingApiResponse wraps FundingInfo', () => {
    const response: FundingApiResponse = {
      funding: {
        solanaDepositAddress: 'SoLaNa123',
        evmDepositAddress: '0xevm',
        btcDepositAddress: 'bc1q',
        note: 'test',
      },
    }

    expect(response.funding).toBeDefined()
    expect(response.error).toBeUndefined()
  })

  it('FundingApiResponse supports error shape', () => {
    const response: FundingApiResponse = {
      funding: {
        solanaDepositAddress: '',
        evmDepositAddress: '',
        btcDepositAddress: '',
        note: '',
      },
      error: 'Bridge unavailable',
    }

    expect(response.error).toBe('Bridge unavailable')
  })

  it('WithdrawApiRequest has required fields', () => {
    const req: WithdrawApiRequest = {
      recipientAddress: 'SoLaNaAddr123',
      amount: '100.50',
    }

    expect(req.recipientAddress).toBeTruthy()
    expect(req.amount).toBeTruthy()
  })

  it('WithdrawApiResponse success shape', () => {
    const res: WithdrawApiResponse = {
      success: true,
      withdrawAddress: '0xwithdraw',
      note: 'Send USDC.e here',
    }

    expect(res.success).toBe(true)
    expect(res.withdrawAddress).toBeTruthy()
  })

  it('WithdrawApiResponse error shape', () => {
    const res: WithdrawApiResponse = {
      success: false,
      error: 'Insufficient balance',
    }

    expect(res.success).toBe(false)
    expect(res.error).toBeTruthy()
  })
})
