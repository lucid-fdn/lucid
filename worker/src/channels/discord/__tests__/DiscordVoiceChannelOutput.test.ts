import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiscordVoiceChannelOutput } from '../DiscordVoiceChannelOutput.js'
import { setDiscordHostedVoiceManager } from '../runtime.js'

describe('DiscordVoiceChannelOutput', () => {
  afterEach(() => {
    setDiscordHostedVoiceManager(null)
  })

  it('plays the finalized assistant reply through the hosted voice manager', async () => {
    const playAssistantReply = vi.fn().mockResolvedValue(undefined)
    setDiscordHostedVoiceManager({
      playAssistantReply,
    } as any)

    const output = new DiscordVoiceChannelOutput({
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      voiceId: 'coral',
    })

    await output.finalize('Hello from Lucid')

    expect(playAssistantReply).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'voice-1',
      text: 'Hello from Lucid',
      voiceId: 'coral',
    })
  })
})
