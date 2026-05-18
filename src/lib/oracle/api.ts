import 'server-only'

import { ORACLE_API_URL, ORACLE_API_KEY } from './config'

interface FetchOptions {
  path: string
  revalidate?: number
}

export async function oracleFetch<T>(opts: FetchOptions): Promise<T> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (ORACLE_API_KEY) {
    headers['x-api-key'] = ORACLE_API_KEY
  }

  const res = await fetch(`${ORACLE_API_URL}${opts.path}`, {
    headers,
    next: { revalidate: opts.revalidate ?? 30 },
  })

  if (!res.ok) {
    throw new Error(`Oracle API error: ${res.status} ${res.statusText}`)
  }

  return res.json()
}

// ── Feed types ──────────────────────────────────────────────

export interface FeedValue {
  feed_id: string
  value: string
  confidence: number
  completeness: number
  freshness_ms: number
  staleness_risk: string
  computed_at: string
  signer: string
  signature: string
}

export interface Feed {
  id: string
  name: string
  description: string
  version: number
  methodology_url: string
  update_interval_ms: number
  deviation_threshold_bps: number
  latest_value: FeedValue | null
}

export interface FeedListResponse {
  feeds: Feed[]
}

export interface FeedDetailResponse {
  feed: Feed
  latest: FeedValue | null
  methodology_url: string
}

// ── Economy types ────────────────────────────────────────────

export interface EconomySnapshot {
  total_agents: number
  active_agents_24h: number
  total_wallets: number
  total_tvl_usd: number
  tx_volume_24h_usd: number
  tx_count_24h: number
  new_agents_7d: number
  avg_reputation_score: number
  top_tokens_json: string | null
  snapshot_at: string
}

// ── Agent types ─────────────────────────────────────────────

export interface AgentSearchResult {
  id: string
  display_name: string | null
  erc8004_id: string | null
  created_at: string
  wallet_count: number
  protocol_count: number
  feedback_count: number
  agent_uri: string | null
  description: string | null
  ecosystem: string | null
  active: boolean | null
  services_count: number
  reputation_score: number | null
  category: string | null
  image_url: string | null
  portfolio_value_usd: number | null
  tx_count_24h: number | null
  tx_count_7d: number | null
  volume_24h_usd: number | null
  volume_7d_usd: number | null
}

export interface AgentDetail {
  id: string
  display_name: string | null
  erc8004_id: string | null
  created_at: string
  agent_uri: string | null
  description: string | null
  ecosystem: string | null
  active: boolean | null
  category: string | null
  image_url: string | null
  metadata_json: Record<string, any> | null
  reputation_json: {
    avg_value: number | null
    feedback_count: number
    latest_tag1: string | null
    latest_tag2: string | null
  } | null
  stats: {
    wallet_count: number
    protocol_count: number
    feedback_count: number
    services_count: number
    first_seen: string | null
    last_active: string | null
  } | null
  balances?: {
    total_usd: number
    tokens: Array<{
      chain: string
      token_address: string
      token_symbol: string
      balance_raw: string
      balance_usd: number | null
    }>
  }
  transactions_summary?: {
    count_24h: number
    count_7d: number
    volume_usd_24h: number
    volume_usd_7d: number
  }
  wallets: Array<{
    address: string
    chain: string
    link_type: string
    confidence: number
  }>
  protocols: Array<{
    protocol: string
    protocol_id: string
    link_type: string
  }>
  wallet_transactions?: Array<{
    hash: string
    from: string
    to: string
    value: string
    chain: string
    timestamp: string
    type: string
  }>
  feedback?: Array<{
    id: string
    value: number
    tag1: string | null
    tag2: string | null
    created_at: string
    source: string | null
  }>
  // Phase B enrichment fields
  ens_name?: string | null
  basename?: string | null
  owner_wallet?: string | null
  gas_used_24h?: number | null
  gas_used_7d?: number | null
  top_contracts?: Array<{
    address: string
    name: string | null
    call_count: number
    last_called: string | null
  }> | null
  agent_connections?: Array<{
    agent_id: string
    agent_name: string | null
    tx_count: number
    total_value_usd: number | null
    last_interaction: string | null
  }> | null
}

// Phase B: Network graph types
export interface GraphNode {
  id: string
  name: string | null
  tx_count: number
  portfolio_value_usd: number | null
}

export interface GraphLink {
  source: string
  target: string
  tx_count: number
  total_value_usd: number | null
}

export interface NetworkGraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export interface AgentSearchResponse {
  data: AgentSearchResult[]
  pagination: { next_cursor: string | null }
}

// ── API functions ───────────────────────────────────────────

export async function getEconomySnapshot(): Promise<EconomySnapshot | null> {
  try {
    const result = await oracleFetch<{ data: EconomySnapshot }>({ path: '/v1/oracle/economy/current', revalidate: 30 })
    return result.data
  } catch {
    return null
  }
}

export async function getFeeds(): Promise<FeedListResponse> {
  return oracleFetch({ path: '/v1/oracle/feeds', revalidate: 15 })
}

export async function getFeed(id: string): Promise<FeedDetailResponse> {
  return oracleFetch({ path: `/v1/oracle/feeds/${id}`, revalidate: 15 })
}

export async function getFeedMethodology(id: string) {
  return oracleFetch({ path: `/v1/oracle/feeds/${id}/methodology`, revalidate: 300 })
}

export async function searchAgents(params?: { wallet?: string; q?: string; limit?: number; sort?: string }) {
  const searchParams = new URLSearchParams()
  if (params?.wallet) searchParams.set('wallet', params.wallet)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.sort) searchParams.set('sort', params.sort)
  // q=* lists all agents; always pass at least q to satisfy API requirement
  searchParams.set('q', params?.q ?? '*')
  return oracleFetch<AgentSearchResponse>({
    path: `/v1/oracle/agents/search?${searchParams.toString()}`,
    revalidate: 30,
  })
}

export async function getAgentStats() {
  return oracleFetch<{
    total_agents: string
    named_agents: string
    active_agents: string
    total_wallets: string
    total_feedback: string
    total_transactions: string
  }>({ path: '/v1/oracle/agents/stats', revalidate: 30 })
}

export async function getAgent(id: string) {
  return oracleFetch<{ data: AgentDetail }>({ path: `/v1/oracle/agents/${id}`, revalidate: 30 })
}

export async function getReportsLatest() {
  return oracleFetch({ path: '/v1/oracle/reports/latest', revalidate: 15 })
}
