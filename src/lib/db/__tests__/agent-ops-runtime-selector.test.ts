import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const getRuntimes = vi.fn()

vi.mock('../mission-control', () => ({
  getRuntimes: (...args: unknown[]) => getRuntimes(...args),
}))

const { supabaseAgentOpsRuntimeSelector } = await import('../agent-ops-runtime-selector')

describe('supabaseAgentOpsRuntimeSelector', () => {
  it('keeps protocol smoke runtimes out of Agent Ops dispatch candidates', async () => {
    getRuntimes.mockResolvedValue([
      {
        id: 'runtime-smoke',
        displayName: 'lucid-byo-runtime-smoke-prod',
        status: 'connected',
        runtimeFlavor: 'c2a_autonomous',
        engine: 'openclaw',
        engineMetadata: {
          smoke: true,
          source: 'railway-byo-runtime-smoke',
          permanent: true,
        },
        adapterIdentity: {
          adapterType: 'railway_byo_smoke',
          metadata: { smoke: true },
        },
        runtimeServices: [
          {
            metadata: { smoke: true },
          },
        ],
      },
    ])

    const candidates = await supabaseAgentOpsRuntimeSelector.listCandidates({
      orgId: 'org-1',
      projectId: null,
      assistantId: null,
      workflow: {} as never,
    })

    expect(candidates).toEqual([
      expect.objectContaining({ profileId: 'shared' }),
      expect.objectContaining({
        id: 'runtime-smoke',
        profileId: 'c2a_autonomous',
        unavailable: true,
      }),
    ])
  })
})
