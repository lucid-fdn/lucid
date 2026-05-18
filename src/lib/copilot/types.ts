/**
 * Copilot — Shared Types
 *
 * Centralized type definitions for the Mission Control AI Copilot.
 * Used by: API route, tools, context builder.
 *
 * Note: Message types come from Vercel AI SDK (UIMessage, ModelMessage).
 * No custom message types needed — useChat() manages message state.
 */

// ── Fleet Context (injected into system prompt) ─────────────────────

export interface FleetSnapshot {
  agents: FleetAgent[]
  pendingApprovals: number
  recentErrors: FleetError[]
  costTodayUsd: number
}

export interface FleetAgent {
  id: string
  name: string
  status: string
  model: string
  healthScore: number | null
  costTodayUsd: number
  errorsLastHour: number
  riskLevel: string
  pendingApprovals: number
  lastActiveAt: string | null
  runtime?: { name: string | null; provider: string | null; status: string | null }
}

export interface FleetError {
  agentName: string
  eventType: string
  message: string
  timestamp: string
}

// ── Tool Results ────────────────────────────────────────────────────

export interface AgentDetailResult {
  id: string
  name: string
  status: string
  model: string
  healthScore: number | null
  costTodayUsd: number
  errorsLastHour: number
  approvalRequiredTools: string[]
  costLimits: {
    perRunUsd: number | null
    dailyUsd: number | null
    monthlyUsd: number | null
  }
}

export interface FeedEventsResult {
  events: Array<{
    type: string
    agentName: string
    summary: string
    timestamp: string
  }>
  total: number
}

// ── User Context (injected into system prompt) ──────────────────────

export interface CopilotUserContext {
  userName: string | null
  userRole: string | null
  workspaceName: string
}

// ── Config ──────────────────────────────────────────────────────────

export interface CopilotConfig {
  /** Model ID to use for copilot inference */
  modelId: string
  /** Max tokens for copilot response */
  maxTokens: number
  /** Temperature for copilot inference */
  temperature: number
  /** Max tool-call roundtrips before stopping */
  maxSteps: number
}
