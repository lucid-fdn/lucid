import { beforeEach, describe, expect, it, vi } from 'vitest'

const publishInternalSkillsToMcpgate = vi.fn()
const listMcpgateSkills = vi.fn()
const upsertMirroredSkills = vi.fn()
const withInternalJobLock = vi.fn()
const captureException = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/skills/publish', () => ({
  publishInternalSkillsToMcpgate,
}))

vi.mock('@/lib/skills/mcpgate', () => ({
  listMcpgateSkills,
}))

vi.mock('@/lib/db', () => ({
  upsertMirroredSkills,
}))

vi.mock('@/lib/locks/internal-job-lock', () => ({
  withInternalJobLock,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException,
  },
}))

describe('reconcileSkillCatalog', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    withInternalJobLock.mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn())
  })

  it('runs publish_and_sync under the distributed lock', async () => {
    publishInternalSkillsToMcpgate.mockResolvedValue({ discovered: 3, published: 2, skipped: 1 })
    listMcpgateSkills.mockResolvedValue([{ slug: 'alpha' }, { slug: 'beta' }])
    upsertMirroredSkills.mockResolvedValue(2)

    const { reconcileSkillCatalog } = await import('@/lib/skills/reconcile')
    const result = await reconcileSkillCatalog('publish_and_sync')

    expect(withInternalJobLock).toHaveBeenCalledWith('skills:catalog-reconcile', expect.any(Function))
    expect(result).toEqual({
      mode: 'publish_and_sync',
      publish: { discovered: 3, published: 2, skipped: 1 },
      fetched: 2,
      upserted: 2,
    })
  })

  it('supports publish-only and sync-only modes', async () => {
    publishInternalSkillsToMcpgate.mockResolvedValue({ discovered: 1, published: 1, skipped: 0 })
    listMcpgateSkills.mockResolvedValue([{ slug: 'alpha' }])
    upsertMirroredSkills.mockResolvedValue(1)

    const { reconcileSkillCatalog } = await import('@/lib/skills/reconcile')

    await expect(reconcileSkillCatalog('publish')).resolves.toEqual({
      mode: 'publish',
      publish: { discovered: 1, published: 1, skipped: 0 },
      fetched: 0,
      upserted: 0,
    })

    await expect(reconcileSkillCatalog('sync')).resolves.toEqual({
      mode: 'sync',
      publish: { discovered: 0, published: 0, skipped: 0 },
      fetched: 1,
      upserted: 1,
    })
  })

  it('returns a skipped result and emits a warning on lock contention', async () => {
    withInternalJobLock.mockRejectedValue(Object.assign(new Error('busy'), { name: 'InternalJobLockError' }))

    const { reconcileSkillCatalog } = await import('@/lib/skills/reconcile')
    await expect(reconcileSkillCatalog('publish_and_sync')).resolves.toEqual({
      mode: 'publish_and_sync',
      publish: { discovered: 0, published: 0, skipped: 0 },
      fetched: 0,
      upserted: 0,
      skipped: 'locked',
    })

    expect(captureException).toHaveBeenCalledTimes(1)
  })
})
