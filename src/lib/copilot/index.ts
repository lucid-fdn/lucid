/**
 * Copilot — Barrel Exports
 *
 * Central entry point for the Mission Control AI Copilot module.
 *
 * Architecture:
 *   config.ts   — Switchable model/temperature/limits via env vars
 *   types.ts    — Shared types (messages, fleet snapshot, tool results)
 *   prompt.ts   — System prompt assembly (persona + fleet context)
 *   context.ts  — Fleet context builder (reuses @/lib/db/mission-control)
 *   tools.ts    — Vercel AI SDK tool definitions (reuses @/lib/db/mission-control)
 */

export { getCopilotConfig } from './config'
export { buildFleetSnapshot, serializeFleetContext } from './context'
export { buildCopilotSystemPrompt } from './prompt'
export { createCopilotTools } from './tools'
export type {
  CopilotConfig,
  CopilotUserContext,
  FleetSnapshot,
  FleetAgent,
  FleetError,
} from './types'
