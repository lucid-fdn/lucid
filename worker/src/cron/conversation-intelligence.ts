/**
 * Mission Control — Conversation Intelligence (Daily Cron)
 *
 * Computes heuristic conversation metrics per org:
 * - Satisfaction score (inverse of avg conversation length, capped at 1.0)
 * - Sentiment (neutral placeholder until real LLM classifier exists)
 * - Topic clusters (grouped by assistant_id with conversation counts)
 *
 * Called from the worker's cron loop every 24 hours.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export async function computeConversationIntelligence(supabase: SupabaseClient): Promise<void> {
  console.log('[MC:ConversationIntelligence] Starting...')

  try {
    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()

    // Get recent conversations grouped by org, with message counts
    const { data: conversations, error: convError } = await supabase
      .from('assistant_messages')
      .select('conversation_id, role, assistants:conversation_id')
      .gte('created_at', since)

    // Fall back to querying conversations with their assistant mapping
    // Query recent conversations from assistant_conversations (if available) or inbound events
    const { data: recentConvos, error: convoError } = await supabase
      .from('assistant_inbound_events')
      .select('id, org_id, assistant_id, conversation_id, created_at')
      .gte('created_at', since)
      .not('conversation_id', 'is', null)

    if (convoError || !recentConvos?.length) {
      console.log('[MC:ConversationIntelligence] No recent conversations found')
      return
    }

    // Group conversations by org
    const orgConversations = new Map<string, Map<string, { assistantId: string; count: number }>>()

    for (const event of recentConvos) {
      if (!event.org_id || !event.conversation_id) continue

      if (!orgConversations.has(event.org_id)) {
        orgConversations.set(event.org_id, new Map())
      }

      const orgMap = orgConversations.get(event.org_id)!
      const existing = orgMap.get(event.conversation_id)

      if (existing) {
        existing.count++
      } else {
        orgMap.set(event.conversation_id, {
          assistantId: event.assistant_id,
          count: 1,
        })
      }
    }

    let totalScores = 0
    let totalTopics = 0

    for (const [orgId, convMap] of orgConversations) {
      try {
        // --- Conversation Scores ---
        const scoreRows: Array<{
          org_id: string
          conversation_id: string
          agent_id: string
          sentiment_avg: number
          satisfaction_score: number
          turn_count: number
          reask_count: number
          abandonment: boolean
        }> = []

        for (const [conversationId, info] of convMap) {
          // Satisfaction heuristic: shorter conversations = higher satisfaction
          // Normalize: 1 turn = 1.0, 10+ turns = ~0.1
          const satisfaction = Math.min(1.0, Math.round((1 / Math.max(info.count, 1)) * 100) / 100)

          // Abandonment heuristic: single-message conversations are likely abandoned
          const abandonment = info.count <= 1

          scoreRows.push({
            org_id: orgId,
            conversation_id: conversationId,
            agent_id: info.assistantId,
            sentiment_avg: 0, // Neutral placeholder until real LLM classifier exists
            satisfaction_score: satisfaction,
            turn_count: info.count,
            reask_count: 0, // Placeholder until re-ask detection is implemented
            abandonment,
          })
        }

        if (scoreRows.length > 0) {
          // Batch upsert conversation scores (insert new, skip existing for same conversation)
          const { error: insertError } = await supabase
            .from('mc_conversation_scores')
            .upsert(scoreRows, { onConflict: 'id', ignoreDuplicates: true })

          if (insertError) {
            // If upsert fails (no unique constraint on conversation_id), fall back to insert
            const { error: fallbackError } = await supabase
              .from('mc_conversation_scores')
              .insert(scoreRows)

            if (fallbackError) {
              console.error(`[MC:ConversationIntelligence] Score insert error for org ${orgId}: ${fallbackError.message}`)
              continue
            }
          }

          totalScores += scoreRows.length
        }

        // --- Topic Clusters ---
        // Group by assistant_id as a proxy for "topic" until real NLP clustering exists
        const assistantCounts = new Map<string, number>()
        for (const info of convMap.values()) {
          assistantCounts.set(
            info.assistantId,
            (assistantCounts.get(info.assistantId) ?? 0) + 1
          )
        }

        // Get assistant names for labels
        const assistantIds = [...assistantCounts.keys()]
        const { data: assistants } = await supabase
          .from('ai_assistants')
          .select('id, name')
          .in('id', assistantIds)

        const nameMap = new Map<string, string>()
        for (const a of assistants ?? []) {
          nameMap.set(a.id, a.name || 'Unnamed Agent')
        }

        const topicRows = [...assistantCounts.entries()].map(([assistantId, count]) => ({
          org_id: orgId,
          cluster_label: nameMap.get(assistantId) || `Agent ${assistantId.slice(0, 8)}`,
          conversation_count: count,
          sample_messages: [],
        }))

        if (topicRows.length > 0) {
          // Delete old topic clusters for this org before inserting fresh ones
          await supabase
            .from('mc_topic_clusters')
            .delete()
            .eq('org_id', orgId)
            .lt('computed_at', since)

          const { error: topicError } = await supabase
            .from('mc_topic_clusters')
            .insert(topicRows)

          if (topicError) {
            console.error(`[MC:ConversationIntelligence] Topic insert error for org ${orgId}: ${topicError.message}`)
          } else {
            totalTopics += topicRows.length
          }
        }
      } catch (orgErr) {
        console.error(`[MC:ConversationIntelligence] Error processing org ${orgId}:`, orgErr)
      }
    }

    // Cleanup: remove scores older than 30 days
    await supabase
      .from('mc_conversation_scores')
      .delete()
      .lt('computed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    console.log(`[MC:ConversationIntelligence] Complete: ${totalScores} scores, ${totalTopics} topic clusters across ${orgConversations.size} orgs`)
  } catch (err) {
    console.error('[MC:ConversationIntelligence] Error:', err)
  }
}
