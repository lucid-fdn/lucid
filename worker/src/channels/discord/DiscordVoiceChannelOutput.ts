import fs from 'node:fs'
import type { ChannelOutput, MessageRef } from '../ChannelOutput.js'
import { getDiscordHostedVoiceManager } from './runtime.js'

export class DiscordVoiceChannelOutput implements ChannelOutput {
  constructor(
    private readonly params: {
      guildId: string
      voiceChannelId: string
      voiceId?: string | null
      instructions?: string | null
    },
  ) {}

  async begin(): Promise<MessageRef | null> {
    return null
  }

  async append(_delta: string): Promise<void> {
    return
  }

  async finalize(fullText: string): Promise<void> {
    const manager = getDiscordHostedVoiceManager()
    if (!manager) {
      throw new Error('Hosted Discord voice manager is unavailable.')
    }

      await manager.playAssistantReply({
        guildId: this.params.guildId,
        channelId: this.params.voiceChannelId,
        text: fullText,
        voiceId: this.params.voiceId ?? null,
        ...(this.params.instructions ? { instructions: this.params.instructions } : {}),
      })
  }

  async error(err: Error): Promise<void> {
    const manager = getDiscordHostedVoiceManager()
    if (!manager) return

    const fallback = 'I hit an issue while speaking that reply.'
    try {
      await manager.playAssistantReply({
        guildId: this.params.guildId,
        channelId: this.params.voiceChannelId,
        text: fallback,
        voiceId: this.params.voiceId ?? null,
        ...(this.params.instructions ? { instructions: this.params.instructions } : {}),
      })
    } catch {
      // Final fallback: nothing else to do in a live voice session.
      const details = err instanceof Error ? err.message : String(err)
      fs.writeSync(2, `[discord-voice] output error fallback failed: ${details}\n`)
    }
  }
}
