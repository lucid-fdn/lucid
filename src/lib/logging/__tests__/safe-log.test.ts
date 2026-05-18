import { describe, expect, it } from 'vitest'

import {
  maskEmail,
  maskIdentifier,
  maskPhone,
  maskWalletAddress,
  redactLogMetadata,
  redactLogText,
  summarizeError,
} from '../safe-log'

describe('safe-log', () => {
  it('masks common user identifiers while preserving enough shape for debugging', () => {
    expect(maskIdentifier('user_1234567890')).toBe('user_1...7890')
    expect(maskEmail('quentin@example.com')).toBe('qu***@example.com')
    expect(maskPhone('+33 6 12 34 56 78')).toBe('***5678')
    expect(maskWalletAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234...5678')
  })

  it('summarizes thrown and non-thrown errors without serializing arbitrary payloads', () => {
    expect(summarizeError(new TypeError('boom for q@example.com'))).toEqual({
      name: 'TypeError',
      message: 'boom for q***@example.com',
    })
    expect(summarizeError({
      code: '57014',
      message: 'Timeout for q@example.com with sk-secret-value',
      details: 'statement timeout',
    })).toEqual({
      name: 'ObjectError',
      message: 'Timeout for q***@example.com with [redacted]',
    })
    expect(summarizeError({ code: 'PGRST116', details: 'No rows' })).toEqual({
      name: 'ObjectError',
      message: 'PGRST116 No rows',
    })
    expect(summarizeError('plain failure')).toEqual({ name: 'UnknownError', message: 'plain failure' })
  })

  it('redacts secrets, emails, users, resource ids, and wallet addresses recursively', () => {
    expect(redactLogText('Authorization: Bearer abc.def.ghi for 0x1234567890abcdef1234567890abcdef12345678')).toBe(
      'Authorization: Bearer [redacted] for 0x1234...5678',
    )
    expect(redactLogMetadata({
      api_key: 'provider-key',
      xApiKey: 'provider-key',
      token: 'secret-token',
      userId: 'user_1234567890',
      orgId: '26cb0bb8-6729-4d89-9036-17f599cb7c02',
      project_id: 'f242d981-7b66-4676-9b86-bbe6cd1dbf3b',
      assistantId: '8fe3c299-35c0-43e3-b9b3-3359f0fd85bd',
      conversationId: 'thread_1234567890abcdef',
      email: 'quentin@example.com',
      nested: {
        providerApiKey: 'nested-provider-key',
        channel_id: 'discord-channel-1234567890',
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      },
    })).toEqual({
      api_key: '[redacted]',
      xApiKey: '[redacted]',
      token: '[redacted]',
      userId: 'user_1...7890',
      orgId: '26cb0b...7c02',
      project_id: 'f242d9...bf3b',
      assistantId: '8fe3c2...85bd',
      conversationId: 'thread...cdef',
      email: 'qu***@example.com',
      nested: {
        providerApiKey: '[redacted]',
        channel_id: 'discor...7890',
        walletAddress: '0x1234...5678',
      },
    })
  })
})
