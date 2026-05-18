import { describe, expect, it } from 'vitest'

import { assertSafeWebhookUrl } from '../webhook.js'

describe('Webhook executor URL safety', () => {
  it('rejects non-HTTPS and credentialed URLs', async () => {
    await expect(assertSafeWebhookUrl('http://example.com/hook')).rejects.toThrow(/HTTPS/)
    await expect(assertSafeWebhookUrl('https://user:pass@example.com/hook')).rejects.toThrow(/credentials/)
  })

  it('rejects localhost and private-network targets', async () => {
    await expect(assertSafeWebhookUrl('https://localhost/hook')).rejects.toThrow(/private networks/)
    await expect(assertSafeWebhookUrl('https://127.0.0.1/hook')).rejects.toThrow(/private networks/)
    await expect(assertSafeWebhookUrl('https://10.0.0.4/hook')).rejects.toThrow(/private networks/)
  })
})
