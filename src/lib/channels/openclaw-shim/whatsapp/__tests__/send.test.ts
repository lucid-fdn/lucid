import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { PermanentChannelError } from '../../shared/errors'
import { sendWhatsAppViaShim } from '../send'

describe('sendWhatsAppViaShim', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws when credentials are missing', async () => {
    await expect(sendWhatsAppViaShim({}, '+15555550123', 'hi')).rejects.toThrow(/credentials/i)
  })

  it('sends a message and returns the external message id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'wamid-1' }] }),
      } as Response),
    )

    const result = await sendWhatsAppViaShim(
      { access_token: 'wa-token', phone_number_id: '12345' },
      '+15555550123',
      'hello world',
    )

    expect(result).toEqual({ delivered: true, externalMessageId: 'wamid-1' })
    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/12345/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer wa-token',
        }),
      }),
    )
  })

  it('splits oversized payloads into multiple WhatsApp sends and returns the first message id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: 'wamid-first' }] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: 'wamid-second' }] }),
        } as Response),
    )

    const text = `${'a'.repeat(4090)} ${'b'.repeat(32)}`
    const result = await sendWhatsAppViaShim(
      { access_token: 'wa-token', phone_number_id: '12345' },
      '+15555550123',
      text,
    )

    expect(result).toEqual({ delivered: true, externalMessageId: 'wamid-first' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('maps 401 responses to PermanentChannelError(auth_revoked)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid OAuth access token.' } }),
      } as Response),
    )

    await expect(
      sendWhatsAppViaShim(
        { access_token: 'wa-token', phone_number_id: '12345' },
        '+15555550123',
        'hello',
      ),
    ).rejects.toBeInstanceOf(PermanentChannelError)

    await expect(
      sendWhatsAppViaShim(
        { access_token: 'wa-token', phone_number_id: '12345' },
        '+15555550123',
        'hello',
      ),
    ).rejects.toMatchObject({ kind: 'auth_revoked' })
  })

  it('re-throws transient errors unchanged', async () => {
    const err = new Error('ECONNRESET')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err))

    await expect(
      sendWhatsAppViaShim(
        { access_token: 'wa-token', phone_number_id: '12345' },
        '+15555550123',
        'hello',
      ),
    ).rejects.toBe(err)
  })
})
