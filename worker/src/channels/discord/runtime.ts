import type { DiscordHostedVoiceManager } from './voice-manager.js'

let discordHostedVoiceManager: DiscordHostedVoiceManager | null = null

export function setDiscordHostedVoiceManager(manager: DiscordHostedVoiceManager | null): void {
  discordHostedVoiceManager = manager
}

export function getDiscordHostedVoiceManager(): DiscordHostedVoiceManager | null {
  return discordHostedVoiceManager
}
