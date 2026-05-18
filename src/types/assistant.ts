/**
 * Legacy assistant type exports.
 *
 * Canonical code should import from '@/types/agent'.
 * This file remains as a compatibility shim while older callsites are migrated.
 */

export type {
  Agent as Assistant,
  AgentChannel as AssistantChannel,
  AgentWallet,
} from '@/types/agent'

export type {
  Agent,
  AgentChannel,
} from '@/types/agent'
