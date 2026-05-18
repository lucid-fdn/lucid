import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { GET } from '../route'

describe('GET /api/ai/image/[id]', () => {
  it('returns a typed gone response for retired prediction polling', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/ai/image/prediction-1'),
      { params: Promise.resolve({ id: 'prediction-1' }) },
    )

    await expect(response.json()).resolves.toEqual({
      error: 'Image prediction polling is no longer available.',
      code: 'image_prediction_polling_retired',
      id: 'prediction-1',
      replacement: '/api/ai/image',
    })
    expect(response.status).toBe(410)
  })
})
