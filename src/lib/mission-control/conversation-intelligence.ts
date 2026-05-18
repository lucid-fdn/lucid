/**
 * Mission Control — Conversation Intelligence
 *
 * Client-side types and helpers for the conversation intelligence pipeline.
 * The actual pipeline runs in the worker (worker/src/cron/conversation-intelligence.ts).
 */

export interface SentimentResult {
  score: number // -1 to 1
  label: 'positive' | 'neutral' | 'negative'
}

export interface TopicCluster {
  cluster_label: string
  conversation_count: number
  representative_messages: string[]
}

export interface ConversationScore {
  conversation_id: string
  satisfaction: number // 0-1
  re_ask_count: number
  abandonment: boolean
  turn_count: number
}

export interface ConversationIntelligence {
  avg_sentiment: number
  avg_satisfaction: number
  total_conversations_7d: number
  abandonment_rate: number
  topics: TopicCluster[]
  recent_insights: Array<{
    id: string
    insight_type: string
    title: string
    body: string
    severity: string
    created_at: string
  }>
}

/** Derive sentiment label from score */
export function sentimentLabel(score: number): SentimentResult['label'] {
  if (score > 0.3) return 'positive'
  if (score < -0.3) return 'negative'
  return 'neutral'
}

/** Derive satisfaction percentage from 0-1 score */
export function satisfactionPercent(score: number): string {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`
}

/** Calculate abandonment rate from conversation scores */
export function calcAbandonmentRate(scores: ConversationScore[]): number {
  if (scores.length === 0) return 0
  const abandoned = scores.filter((s) => s.abandonment).length
  return abandoned / scores.length
}
