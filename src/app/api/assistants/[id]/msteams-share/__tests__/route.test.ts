import { describe, expect, it } from 'vitest'

import { PATCH } from '../route'

describe('assistant msteams share route', () => {
  it('returns 410 because hosted share toggles are deprecated', async () => {
    const request = new Request('https://www.lucid.foundation/api/assistants/a1/msteams-share', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await PATCH(request as never)

    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({
      error: 'Microsoft Teams share toggles are no longer supported. Use Install on Microsoft Teams directly.',
    })
  })
})
