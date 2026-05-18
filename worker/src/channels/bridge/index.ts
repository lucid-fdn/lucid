/**
 * P2-15 Multi-channel bridge exports.
 * 
 * Each bridge adapts OpenClaw channel plugins to our ChannelOutput lifecycle
 * while keeping control-plane invariants (dedup/lock/rate/policy/encryption/runId)
 * in the inbound pipeline.
 */

export * from './OpenClawBridgeContract.js'
export * from './telegram/TelegramOpenClawBridge.js'
export * from './telegram/TelegramPlugin.js'
export * from './discord/DiscordPlugin.js'
export * from './whatsapp/WhatsAppPlugin.js'
export * from './whatsapp/WhatsAppOpenClawBridge.js'
