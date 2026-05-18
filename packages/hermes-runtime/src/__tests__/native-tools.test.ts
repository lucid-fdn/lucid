import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  authorizeRequest,
  buildRuntimeToolPrompt,
  executeHermesNativeTool,
  type HermesRuntimeConfig,
} from '../index.js'
import type { RunPacket } from '@lucid/agent-bridge'

const tempDirs: string[] = []

function makeConfig(hermesHome: string): HermesRuntimeConfig {
  return {
    command: 'hermes',
    args: ['chat'],
    bridgeMode: 'full',
    runtimeId: 'rt-hermes',
    runtimeKey: 'key',
    controlPlaneUrl: 'http://localhost:3000',
    engineVersion: 'hermes',
    runtimeVersion: 'lucid-hermes-runtime/0.1.0',
    port: 3000,
    timeoutMs: 60_000,
    toolsets: [],
    hermesHome,
  }
}

function makePacket(runtimeFlavor: RunPacket['assistantConfig']['runtimeFlavor']): RunPacket {
  return {
    eventId: 'evt-1',
    idempotencyToken: 'tok-1',
    channelMeta: {
      channelType: 'web',
      channelId: 'ch-1',
      externalUserId: 'user-1',
      externalChatId: 'chat-1',
    },
    assistantConfig: {
      id: 'asst-1',
      name: 'Hermes',
      engine: 'hermes',
      systemPrompt: 'Be concise',
      soulContent: null,
      runtimeFlavor,
      modelId: 'openai/gpt-4.1',
      temperature: 0.2,
      maxTokens: 4096,
      enabledTools: [],
      policyConfig: {},
      memoryEnabled: true,
      approvalRequiredTools: [],
      orgId: 'org-1',
    },
    recentMessages: [],
    memoryInjection: [],
    boardMemories: [],
    conversationSummary: null,
    userMessage: {
      text: 'hello',
      externalMessageId: 'msg-1',
      externalUserId: 'user-1',
      messageData: null,
    },
    skills: [],
    plugins: [],
  }
}

async function makeHermesHome(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lucid-hermes-runtime-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('Hermes native runtime tools', () => {
  it('fails closed for stream auth when no worker trigger secret is configured', () => {
    const wrong = { headers: { authorization: 'Bearer anything' } }
    const right = { headers: { authorization: 'Bearer secret' } }

    expect(authorizeRequest(wrong, undefined)).toBe(false)
    expect(authorizeRequest(wrong, 'secret')).toBe(false)
    expect(authorizeRequest(right, 'secret')).toBe(true)
  })

  it('exposes native tool prompt only for dedicated runtime flavors', () => {
    const dedicatedPrompt = buildRuntimeToolPrompt(makePacket('c1_managed'))
    expect(dedicatedPrompt).toContain('Hermes native tools available on this runtime')
    expect(dedicatedPrompt).toContain('**memory**')
    expect(dedicatedPrompt).toContain('**skill_manage**')

    const sharedPrompt = buildRuntimeToolPrompt(makePacket('shared'))
    expect(sharedPrompt).not.toContain('Hermes native tools available on this runtime')
  })

  it('returns reviewable candidates for Hermes memory writes on dedicated runtimes', async () => {
    const hermesHome = await makeHermesHome()
    const result = await executeHermesNativeTool(
      makeConfig(hermesHome),
      makePacket('c1_managed'),
      'memory',
      { content: 'Remember this fact', target: 'memory' },
    )

    expect(result.handled).toBe(true)
    expect(result.result?.status).toBe('failed')
    expect(result.result?.output).toContain('candidate_required')
    await expect(stat(path.join(hermesHome, 'memories', 'MEMORY.md'))).rejects.toThrow()
  })

  it('returns reviewable candidates for Hermes local skill mutations', async () => {
    const hermesHome = await makeHermesHome()
    const config = makeConfig(hermesHome)
    const packet = makePacket('c2a_autonomous')

    const createResult = await executeHermesNativeTool(
      config,
      packet,
      'skill_manage_create',
      {
        slug: 'trade-alpha',
        content: '# Trade Alpha\n\nInitial procedure',
      },
    )
    expect(createResult.handled).toBe(true)
    expect(createResult.result?.status).toBe('failed')
    expect(createResult.result?.output).toContain('candidate_required')

    const updateResult = await executeHermesNativeTool(
      config,
      packet,
      'skill_manage',
      {
        action: 'update',
        slug: 'trade-alpha',
        content: 'Updated procedure',
        mode: 'append',
      },
    )
    expect(updateResult.handled).toBe(true)
    expect(updateResult.result?.status).toBe('failed')
    expect(updateResult.result?.output).toContain('candidate_required')
    await expect(stat(path.join(hermesHome, 'skills', 'trade-alpha', 'SKILL.md'))).rejects.toThrow()
  })

  it('denies native mutation execution on shared runtimes', async () => {
    const hermesHome = await makeHermesHome()
    const result = await executeHermesNativeTool(
      makeConfig(hermesHome),
      makePacket('shared'),
      'memory',
      { content: 'Remember this fact' },
    )

    expect(result.handled).toBe(true)
    expect(result.result?.status).toBe('failed')
    expect(result.result?.output).toContain('not available on shared compute')
  })
})
