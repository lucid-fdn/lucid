/**
 * OpenClaw Runtime — compiled entry points for the Lucid worker.
 *
 * Bundles OpenClaw TypeScript source into compiled JS via tsup.
 * Worker imports from here instead of dynamic imports with tsx.
 */

// Agent runtime
export { runEmbeddedPiAgent } from '../../openclaw-core/src/agents/pi-embedded-runner/run.ts'
export { compactEmbeddedPiSession } from '../../openclaw-core/src/agents/pi-embedded-runner/compact.ts'

// Config bootstrap (SaaS mode: empty config, no YAML files)
export { setRuntimeConfigSnapshot } from '../../openclaw-core/src/config/io.ts'

// Telegram
export {
  sendMessageTelegram,
  editMessageTelegram,
  reactMessageTelegram,
  sendStickerTelegram,
} from '../../openclaw-core/src/telegram/send.ts'

// Discord
export { sendMessageDiscord } from '../../openclaw-core/src/discord/send.outbound.ts'
export { editMessageDiscord } from '../../openclaw-core/src/discord/send.messages.ts'
export { sendVoiceMessageDiscord } from '../../openclaw-core/src/discord/send.outbound.ts'

// Slack
export { sendMessageSlack } from '../../openclaw-core/src/slack/send.ts'
export { editSlackMessage } from '../../openclaw-core/src/slack/actions.ts'

// iMessage (legacy / self-hosted + hosted provider node)
export { sendMessageIMessage } from '../../openclaw-core/src/imessage/send.ts'
export { probeIMessage } from '../../openclaw-core/src/imessage/probe.ts'
export { monitorIMessageProvider } from '../../openclaw-core/src/imessage/monitor/monitor-provider.ts'
