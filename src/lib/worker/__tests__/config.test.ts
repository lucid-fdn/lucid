import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('worker config', () => {
  beforeEach(() => {
    delete process.env.WORKER_URL
    delete process.env.WORKER_HEALTH_URL
    delete process.env.RAILWAY_PUBLIC_DOMAIN
  })

  it('normalizes escaped newlines and trailing slashes from WORKER_URL', async () => {
    process.env.WORKER_URL = 'https://worker.example.com/\\r\\n'
    const { getWorkerUrl } = await import('../config')

    expect(getWorkerUrl()).toBe('https://worker.example.com')
  })

  it('normalizes actual newlines from explicit health URLs', async () => {
    process.env.WORKER_HEALTH_URL = 'https://worker.example.com/health\n'
    const { getWorkerHealthUrl } = await import('../config')

    expect(getWorkerHealthUrl()).toBe('https://worker.example.com/health')
  })
})
