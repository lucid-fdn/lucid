import { describe, it, expect, vi } from 'vitest'
import {
  HOSTED_GUILD_COMMANDS,
  registerGuildCommands,
} from '../guild-commands'

describe('HOSTED_GUILD_COMMANDS manifest', () => {
  it('includes the hosted command set', () => {
    const names = HOSTED_GUILD_COMMANDS.map((c) => c.name).sort()
    expect(names).toEqual([
      'agents',
      'help',
      'leave',
      'model',
      'models',
      'ops',
      'probe',
      'status',
      'switch',
      'vc',
      'voice',
      'whoami',
    ])
  })

  it('switch command has an autocompletable name option', () => {
    const switchCmd = HOSTED_GUILD_COMMANDS.find((c) => c.name === 'switch')!
    expect(switchCmd).toBeDefined()
    const opts = (switchCmd as { options?: Array<{ name: string; autocomplete?: boolean; required?: boolean }> }).options
    expect(opts).toBeDefined()
    expect(opts![0]!.name).toBe('name')
    expect(opts![0]!.autocomplete).toBe(true)
    expect(opts![0]!.required).toBe(true)
  })

  it('model command has an autocompletable name option', () => {
    const modelCmd = HOSTED_GUILD_COMMANDS.find((c) => c.name === 'model')!
    expect(modelCmd).toBeDefined()
    const opts = (modelCmd as { options?: Array<{ name: string; autocomplete?: boolean; required?: boolean }> }).options
    expect(opts).toBeDefined()
    expect(opts![0]!.name).toBe('name')
    expect(opts![0]!.autocomplete).toBe(true)
    expect(opts![0]!.required).toBe(true)
  })

  it('voice command exposes autocompletable mode and voice options', () => {
    const voiceCmd = HOSTED_GUILD_COMMANDS.find((c) => c.name === 'voice')!
    expect(voiceCmd).toBeDefined()
    const opts = (voiceCmd as { options?: Array<{ name: string; autocomplete?: boolean; required?: boolean }> }).options
    expect(opts).toBeDefined()
    expect(opts).toHaveLength(2)
    expect(opts![0]!.name).toBe('mode')
    expect(opts![0]!.autocomplete).toBe(true)
    expect(opts![0]!.required).toBe(false)
    expect(opts![1]!.name).toBe('name')
    expect(opts![1]!.autocomplete).toBe(true)
    expect(opts![1]!.required).toBe(false)
  })
})

describe('registerGuildCommands', () => {
  it('PUTs the manifest to the correct Discord URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('[]', { status: 200 }),
    ) as unknown as typeof fetch
    await registerGuildCommands({
      clientId: 'cid',
      botToken: 'bot-token',
      guildId: 'g1',
      fetchImpl,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchImpl as unknown as vi.Mock).mock.calls[0]
    expect(url).toBe(
      'https://discord.com/api/v10/applications/cid/guilds/g1/commands',
    )
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe('Bot bot-token')
    const body = JSON.parse(init.body as string)
    expect(body).toHaveLength(HOSTED_GUILD_COMMANDS.length)
  })

  it('throws on non-2xx with status + body snippet', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"message":"Unauthorized"}', { status: 401 }),
    ) as unknown as typeof fetch
    await expect(
      registerGuildCommands({
        clientId: 'cid',
        botToken: 'bad',
        guildId: 'g1',
        fetchImpl,
      }),
    ).rejects.toThrow(/401/)
  })
})
