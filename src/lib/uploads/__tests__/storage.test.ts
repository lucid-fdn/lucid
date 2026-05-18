import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://cdn.example/avatar.webp' } })),
  from: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

describe('uploadBuffer', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.SUPABASE_STORAGE_UPLOAD_RETRIES = '2'
    process.env.SUPABASE_STORAGE_UPLOAD_TIMEOUT_MS = '60000'
    mocks.upload.mockReset()
    mocks.getPublicUrl.mockClear()
    mocks.from.mockReset()
    mocks.from.mockReturnValue({
      upload: mocks.upload,
      getPublicUrl: mocks.getPublicUrl,
    })
    mocks.createClient.mockReset()
    mocks.createClient.mockReturnValue({
      storage: {
        from: mocks.from,
      },
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('retries transient Supabase Storage upload failures', async () => {
    mocks.upload
      .mockResolvedValueOnce({ error: new Error('fetch failed') })
      .mockResolvedValueOnce({ error: null })

    const { uploadBuffer } = await import('../storage')
    const upload = uploadBuffer(Buffer.from('avatar'), 'avatars', 'agents/a/avatar.webp', 'image/webp')

    await vi.advanceTimersByTimeAsync(500)
    await expect(upload).resolves.toBe('https://cdn.example/avatar.webp')
    expect(mocks.upload).toHaveBeenCalledTimes(2)
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-key',
      expect.objectContaining({
        global: expect.objectContaining({
          fetch: expect.any(Function),
        }),
      }),
    )
  })

  it('does not retry non-transient storage errors', async () => {
    mocks.upload.mockResolvedValueOnce({ error: new Error('The resource already exists') })

    const { uploadBuffer } = await import('../storage')

    await expect(uploadBuffer(Buffer.from('avatar'), 'avatars', 'agents/a/avatar.webp', 'image/webp'))
      .rejects
      .toThrow('Upload failed: The resource already exists')
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })
})
