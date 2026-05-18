/**
 * Mission Control — Health Score Computation (Hourly Cron)
 *
 * Computes a 0-100 health score per agent based on 6 dimensions:
 * - Response latency (20%)  — P75 of inbound event processing time
 * - Error rate (25%)        — failed/total inbound events ratio
 * - Memory health (15%)     — embedding coverage, count tiers, recency
 * - Tool reliability (15%)  — tool call success ratio from messages
 * - User satisfaction (15%) — conversation engagement heuristics
 * - Cost efficiency (10%)   — cost per run vs fleet median
 *
 * Called from the worker's cron loop every hour.
 *
 * IMPORTANT: Dimension names and weights are canonical — they're stored in
 * `mc_agent_health_scores.dimension_scores` JSONB and consumed by the
 * frontend via `src/lib/mission-control/health-score-constants.ts`.
 * If you rename a dimension or change a weight, update both files.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

interface HealthDimensions {
  latency: number
  error_rate: number
  memory_health: number
  tool_reliability: number
  user_satisfaction: number
  cost_efficiency: number
}

const WEIGHTS: Record<keyof HealthDimensions, number> = {
  latency: 0.20,
  error_rate: 0.25,
  memory_health: 0.15,
  tool_reliability: 0.15,
  user_satisfaction: 0.15,
  cost_efficiency: 0.10,
}

/**
 * Score returned when a dimension has no data to evaluate.
 * No data = nothing went wrong = healthy. An idle agent isn't unhealthy.
 */
const NO_DATA_SCORE = 100

export async function computeHealthScores(supabase: SupabaseClient): Promise<void> {
  try {
    // Get all active agents across all orgs
    const { data: agents, error } = await supabase
      .from('ai_assistants')
      .select('id, org_id')
      .is('deleted_at', null)

    if (error || !agents?.length) return

    // Pre-compute fleet cost median for cost efficiency comparison
    const fleetCostPerRun = await computeFleetMedianCostPerRun(supabase)

    const scores: Array<{
      agent_id: string
      org_id: string
      overall_score: number
      dimension_scores: HealthDimensions
    }> = []

    for (const agent of agents) {
      const dimensions = await computeAgentDimensions(supabase, agent.id, fleetCostPerRun)
      const overall = Object.entries(WEIGHTS).reduce(
        (sum, [key, weight]) => sum + dimensions[key as keyof HealthDimensions] * weight,
        0
      )

      scores.push({
        agent_id: agent.id,
        org_id: agent.org_id,
        overall_score: Math.round(overall * 100) / 100,
        dimension_scores: dimensions,
      })
    }

    if (scores.length === 0) return

    // Compute fleet percentiles
    const sortedScores = [...scores].sort((a, b) => a.overall_score - b.overall_score)
    const withPercentiles = scores.map((s) => {
      const rank = sortedScores.findIndex((ss) => ss.agent_id === s.agent_id)
      return {
        ...s,
        fleet_percentile: Math.round(((rank + 1) / sortedScores.length) * 100 * 100) / 100,
      }
    })

    // Batch insert
    const { error: insertError } = await supabase
      .from('mc_agent_health_scores')
      .insert(
        withPercentiles.map((s) => ({
          agent_id: s.agent_id,
          org_id: s.org_id,
          overall_score: s.overall_score,
          dimension_scores: s.dimension_scores,
          fleet_percentile: s.fleet_percentile,
        }))
      )

    if (insertError) {
      console.error(`[health-scores] Insert error: ${insertError.message}`)
    } else {
      console.log(`[health-scores] Computed scores for ${withPercentiles.length} agents`)
    }

    // Cleanup: remove scores older than 30 days
    await supabase
      .from('mc_agent_health_scores')
      .delete()
      .lt('computed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  } catch (err) {
    console.error(`[health-scores] Error:`, err)
  }
}

async function computeAgentDimensions(
  supabase: SupabaseClient,
  agentId: string,
  fleetCostPerRun: number | null,
): Promise<HealthDimensions> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Run all independent queries in parallel — each dimension is isolated
  // so one failure doesn't crash the others
  const [
    errorRateResult,
    latencyResult,
    toolResult,
    memoryResult,
    conversationResult,
    costResult,
  ] = await Promise.all([
    safeCompute(() => computeErrorRate(supabase, agentId, since24h)),
    safeCompute(() => computeLatency(supabase, agentId, since24h)),
    safeCompute(() => computeToolReliability(supabase, agentId, since7d)),
    safeCompute(() => computeMemoryHealth(supabase, agentId)),
    safeCompute(() => computeUserSatisfaction(supabase, agentId, since7d)),
    safeCompute(() => computeCostEfficiency(supabase, agentId, since7d, fleetCostPerRun)),
  ])

  return {
    error_rate: errorRateResult,
    latency: latencyResult,
    tool_reliability: toolResult,
    memory_health: memoryResult,
    user_satisfaction: conversationResult,
    cost_efficiency: costResult,
  }
}

/** Wraps a dimension computation so failures return NO_DATA_SCORE instead of crashing */
async function safeCompute(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[health-scores] Dimension computation failed:`, err)
    return NO_DATA_SCORE
  }
}

// ─── Individual dimension computations ───

async function computeErrorRate(
  supabase: SupabaseClient,
  agentId: string,
  since: string,
): Promise<number> {
  const [{ count: total }, { count: failed }] = await Promise.all([
    supabase
      .from('assistant_inbound_events')
      .select('id', { count: 'exact', head: true })
      .eq('assistant_id', agentId)
      .gte('created_at', since),
    supabase
      .from('assistant_inbound_events')
      .select('id', { count: 'exact', head: true })
      .eq('assistant_id', agentId)
      .eq('status', 'failed')
      .gte('created_at', since),
  ])

  if (!total || total === 0) return NO_DATA_SCORE
  const successRate = 1 - (failed ?? 0) / total
  return Math.min(Math.round(successRate * 100), 100)
}

async function computeLatency(
  supabase: SupabaseClient,
  agentId: string,
  since: string,
): Promise<number> {
  // Use processed_at - created_at from inbound events as response latency proxy
  const { data: events } = await supabase
    .from('assistant_inbound_events')
    .select('created_at, processed_at')
    .eq('assistant_id', agentId)
    .not('processed_at', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!events || events.length === 0) return NO_DATA_SCORE

  const latencies = events
    .map((e) => new Date(e.processed_at).getTime() - new Date(e.created_at).getTime())
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b)

  if (latencies.length === 0) return NO_DATA_SCORE

  // P75 latency (more forgiving than P95)
  const p75Index = Math.floor(latencies.length * 0.75)
  const p75Ms = latencies[p75Index]

  if (p75Ms < 3_000) return 100
  if (p75Ms < 5_000) return 90
  if (p75Ms < 10_000) return 75
  if (p75Ms < 20_000) return 50
  if (p75Ms < 30_000) return 25
  return 10
}

async function computeToolReliability(
  supabase: SupabaseClient,
  agentId: string,
  since: string,
): Promise<number> {
  // Step 1: Get this agent's conversation IDs
  const { data: conversations } = await supabase
    .from('assistant_conversations')
    .select('id')
    .eq('assistant_id', agentId)
    .gte('created_at', since)
    .limit(100)

  const convIds = conversations?.map((c) => c.id) ?? []
  if (convIds.length === 0) return NO_DATA_SCORE

  // Step 2: Get tool messages from those conversations (single query)
  const { data: toolMessages } = await supabase
    .from('assistant_messages')
    .select('tool_output')
    .eq('role', 'tool')
    .gte('created_at', since)
    .in('conversation_id', convIds)
    .limit(200)

  if (!toolMessages || toolMessages.length === 0) return NO_DATA_SCORE

  let successes = 0
  for (const msg of toolMessages) {
    const output = typeof msg.tool_output === 'string'
      ? msg.tool_output
      : JSON.stringify(msg.tool_output ?? '')
    const isError = /\b(error|failed|exception|ECONNREFUSED|timeout|403|404|500)\b/i.test(output)
    if (!isError) successes++
  }

  return Math.min(Math.round((successes / toolMessages.length) * 100), 100)
}

async function computeMemoryHealth(
  supabase: SupabaseClient,
  agentId: string,
): Promise<number> {
  // Only select lightweight columns — embedding is a 1536-dim vector, skip it.
  // Use a count query for embedding coverage instead.
  const [{ count: totalCount }, { count: withEmbeddingCount }, { data: memories }] = await Promise.all([
    supabase
      .from('assistant_memory')
      .select('id', { count: 'exact', head: true })
      .eq('assistant_id', agentId),
    supabase
      .from('assistant_memory')
      .select('id', { count: 'exact', head: true })
      .eq('assistant_id', agentId)
      .not('embedding', 'is', null),
    supabase
      .from('assistant_memory')
      .select('importance, last_accessed_at')
      .eq('assistant_id', agentId)
      .limit(200),
  ])

  const total = totalCount ?? 0
  if (total === 0) return NO_DATA_SCORE // No memories = nothing broken, agent just hasn't needed them

  const embeddingCoverage = (withEmbeddingCount ?? 0) / total

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const rows = memories ?? []
  const recentlyAccessed = rows.filter((m) => m.last_accessed_at && m.last_accessed_at > since7d).length
  const accessRate = rows.length > 0 ? recentlyAccessed / rows.length : 0
  const avgImportance = rows.length > 0
    ? rows.reduce((sum, m) => sum + (Number(m.importance) || 0.5), 0) / rows.length
    : 0.5

  // Count tier (40%), embedding coverage (30%), access recency (20%), importance (10%)
  let countScore: number
  if (total >= 50) countScore = 95
  else if (total >= 21) countScore = 85
  else if (total >= 6) countScore = 70
  else countScore = 55

  const score =
    countScore * 0.4 +
    embeddingCoverage * 100 * 0.3 +
    accessRate * 100 * 0.2 +
    avgImportance * 100 * 0.1

  return Math.min(Math.round(score), 100)
}

async function computeUserSatisfaction(
  supabase: SupabaseClient,
  agentId: string,
  since: string,
): Promise<number> {
  // Get conversations with message counts in a single query via the conversation table
  const { data: conversations } = await supabase
    .from('assistant_conversations')
    .select('id, created_at, last_message_at')
    .eq('assistant_id', agentId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!conversations || conversations.length === 0) return NO_DATA_SCORE

  // Batch count: get all messages for these conversations in one query
  const convIds = conversations.map((c) => c.id)
  const { data: messages } = await supabase
    .from('assistant_messages')
    .select('conversation_id')
    .in('conversation_id', convIds)

  // Count messages per conversation
  const turnMap = new Map<string, number>()
  for (const msg of messages ?? []) {
    turnMap.set(msg.conversation_id, (turnMap.get(msg.conversation_id) ?? 0) + 1)
  }

  const turnCounts = conversations.map((c) => turnMap.get(c.id) ?? 0)

  // Multi-turn ratio: conversations with 4+ messages (2+ exchanges)
  const multiTurn = turnCounts.filter((c) => c >= 4).length
  const multiTurnRatio = multiTurn / turnCounts.length

  // Average conversation depth
  const avgTurns = turnCounts.reduce((a, b) => a + b, 0) / turnCounts.length

  // Abandonment: conversations with only 1 message
  const abandoned = turnCounts.filter((c) => c <= 1).length
  const abandonmentRate = abandoned / turnCounts.length

  // Engagement (40%), depth (30%), low abandonment (30%)
  const engagementScore = Math.min(100, 50 + multiTurnRatio * 83)
  const depthScore = Math.min(100, 30 + (avgTurns / 6) * 70)
  const abandonmentScore = Math.max(30, 100 - abandonmentRate * 140)

  return Math.min(Math.round(engagementScore * 0.4 + depthScore * 0.3 + abandonmentScore * 0.3), 100)
}

async function computeCostEfficiency(
  supabase: SupabaseClient,
  agentId: string,
  since: string,
  fleetCostPerRun: number | null,
): Promise<number> {
  const sinceDate = since.slice(0, 10)

  const { data: costRows } = await supabase
    .from('mc_agent_cost_tracking')
    .select('estimated_cost_usd, run_count')
    .eq('agent_id', agentId)
    .gte('date', sinceDate)

  if (!costRows || costRows.length === 0) return NO_DATA_SCORE

  const totalCost = costRows.reduce((sum, r) => sum + Number(r.estimated_cost_usd || 0), 0)
  const totalRuns = costRows.reduce((sum, r) => sum + (r.run_count || 0), 0)

  if (totalRuns === 0) return NO_DATA_SCORE

  const costPerRun = totalCost / totalRuns

  // Score relative to fleet median if available
  if (fleetCostPerRun != null && fleetCostPerRun > 0) {
    const ratio = costPerRun / fleetCostPerRun
    if (ratio < 0.5) return 100
    if (ratio <= 1.0) return Math.round(90 - (ratio - 0.5) * 20)
    if (ratio <= 2.0) return Math.round(80 - (ratio - 1.0) * 30)
    if (ratio <= 5.0) return Math.round(50 - (ratio - 2.0) * 10)
    return 10
  }

  // Absolute cost per run thresholds
  if (costPerRun < 0.01) return 100
  if (costPerRun < 0.05) return 90
  if (costPerRun < 0.20) return 75
  if (costPerRun < 1.00) return 55
  return 30
}

async function computeFleetMedianCostPerRun(supabase: SupabaseClient): Promise<number | null> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data } = await supabase
    .from('mc_agent_cost_tracking')
    .select('agent_id, estimated_cost_usd, run_count')
    .gte('date', since7d)

  if (!data || data.length === 0) return null

  const agentCosts = new Map<string, { cost: number; runs: number }>()
  for (const row of data) {
    const entry = agentCosts.get(row.agent_id) ?? { cost: 0, runs: 0 }
    entry.cost += Number(row.estimated_cost_usd || 0)
    entry.runs += row.run_count || 0
    agentCosts.set(row.agent_id, entry)
  }

  const costPerRuns = [...agentCosts.values()]
    .filter((e) => e.runs > 0)
    .map((e) => e.cost / e.runs)
    .sort((a, b) => a - b)

  if (costPerRuns.length === 0) return null

  const mid = Math.floor(costPerRuns.length / 2)
  return costPerRuns.length % 2 === 0
    ? (costPerRuns[mid - 1] + costPerRuns[mid]) / 2
    : costPerRuns[mid]
}
