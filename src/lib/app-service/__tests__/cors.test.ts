import { describe, expect, it } from 'vitest'
import { withGeneratedAppCorsHeaders } from '../cors-core'

describe('generated app CORS helpers', () => {
  it('does not add CORS headers when no origin has been allowed', () => {
    const response = withGeneratedAppCorsHeaders(Response.json({ ok: true }), null)

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('vary')).toBeNull()
  })

  it('echoes only the explicitly allowed generated app origin', () => {
    const response = withGeneratedAppCorsHeaders(Response.json({ ok: true }), 'https://app.example.com')

    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
    expect(response.headers.get('access-control-allow-methods')).toBe('GET,POST,OPTIONS')
    expect(response.headers.get('access-control-allow-headers')).toBe('authorization,content-type,x-request-id')
    expect(response.headers.get('vary')).toBe('Origin')
  })
})
