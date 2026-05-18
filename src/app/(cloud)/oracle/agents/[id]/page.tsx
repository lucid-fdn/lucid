import { getAgent } from '@/lib/oracle/api'
import type { AgentDetail } from '@/lib/oracle/api'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { WalletPortfolio } from '@/components/oracle/wallet-portfolio'
import { AgentChart } from '@/components/oracle/agent-chart'
import { ReputationGauge } from '@/components/oracle/reputation-gauge'
import { MiniSparkline } from '@/components/oracle/mini-sparkline'
import { ShareButton } from '@/components/oracle/share-button'
import { StatusIndicator } from '@/components/oracle/status-indicator'
import { ChainBadge, ChainIcon } from '@/components/oracle/chain-badge'

// ── Helpers ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string | number | null; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-mono font-bold mt-0.5 ${accent ?? 'text-zinc-100'}`}>
        {value ?? '--'}
      </div>
    </div>
  )
}

import { formatUsd, formatCompact, truncateAddr } from '@/lib/oracle/format'

/** Generate a plausible 7-day sparkline from 24h and 7d totals */
function generateTxSparkline(tx24h: number, tx7d: number): number[] {
  const daily = tx7d / 7
  // Create a curve where the last day matches tx24h
  const data: number[] = []
  for (let i = 0; i < 6; i++) {
    // Earlier days: distribute remaining evenly with slight variation
    const remaining = tx7d - tx24h
    const base = remaining / 6
    // Deterministic variation based on index (no random to keep SSR stable)
    const variance = base * 0.3 * (i % 2 === 0 ? 1 : -1)
    data.push(Math.max(0, Math.round(base + variance)))
  }
  data.push(tx24h) // last day is today
  return data
}

// ── Metadata (OG image) ─────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const result = await getAgent(id)
    const agent = result.data as AgentDetail
    const name = agent?.display_name ?? `Agent #${agent?.erc8004_id ?? id}`
    return {
      title: `${name} - Agent Economy Oracle`,
      openGraph: {
        title: `${name} - Agent Economy Oracle`,
        images: [`/api/oracle/agents/${id}/og`],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${name} - Agent Economy Oracle`,
        images: [`/api/oracle/agents/${id}/og`],
      },
    }
  } catch {
    return { title: 'Agent - Oracle' }
  }
}

// ── Page ────────────────────────────────────────────────────

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let agent: AgentDetail

  try {
    const result = await getAgent(id)
    agent = result.data as AgentDetail
  } catch {
    notFound()
  }

  if (!agent) notFound()

  const meta = agent.metadata_json ?? {}
  const services = Array.isArray(meta.services) ? meta.services : []
  const wallets = agent.wallets ?? []
  const protocols = agent.protocols ?? []
  const rep = agent.reputation_json ?? null
  const stats = agent.stats ?? null
  const txSummary = agent.transactions_summary ?? null
  const topContracts = agent.top_contracts ?? []
  const agentConnections = agent.agent_connections ?? []

  // Resolved name: prefer ENS, then Basename, then null
  const resolvedName = agent.ens_name ?? agent.basename ?? null

  // Read balances from top-level balances field (actual API shape)
  const totalPortfolioValue = agent.balances?.total_usd ?? 0
  const allBalances = (agent.balances?.tokens ?? []).map((t) => ({
    token: t.token_address,
    symbol: t.token_symbol,
    balance: Number(t.balance_raw) || 0,
    usd_value: t.balance_usd ?? 0,
  }))

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/oracle/agents"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-1"
        >
          <span>&larr;</span> Back to Agent Registry
        </Link>
        <ShareButton agentId={id} agentName={agent.display_name ?? `Agent ${agent.erc8004_id?.slice(0, 8) ?? id}`} />
      </div>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        {/* Agent image */}
        {agent.image_url && agent.image_url.startsWith('http') && (
          <div className="w-14 h-14 rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={agent.image_url}
              alt={agent.display_name ?? 'Agent'}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <StatusIndicator
              active={(txSummary?.count_7d ?? 0) > 0 || (rep?.feedback_count ?? 0) > 0}
              variant="live"
            />
            <h1 className="text-2xl font-bold text-zinc-100 truncate">
              {agent.display_name ?? `Agent #${agent.erc8004_id}`}
            </h1>
            {agent.ecosystem && typeof agent.ecosystem === 'string' && agent.ecosystem.length < 20 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                {agent.ecosystem}
              </span>
            )}
            {agent.category && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0">
                {agent.category}
              </span>
            )}
          </div>
          {(meta.description || agent.description) && (
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              {meta.description || agent.description}
            </p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-600 font-mono">
            <span className="flex items-center gap-1.5">
              {wallets.length > 0 && <ChainBadge chain={wallets[0].chain} />}
              {agent.erc8004_id && agent.erc8004_id.length > 10
                ? `8004 ${agent.erc8004_id.slice(0, 6)}...${agent.erc8004_id.slice(-4)}`
                : `8004 #${agent.erc8004_id}`}
            </span>
            <span>ID: {agent.id}</span>
            <span>Registered: {new Date(agent.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <Metric
            label="Portfolio Value"
            value={formatUsd(totalPortfolioValue)}
            accent="text-emerald-400"
          />
        </div>

        {/* Reputation Score -- circular gauge */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col items-center justify-center">
          <ReputationGauge
            score={rep?.avg_value != null && rep.avg_value <= 100 ? rep.avg_value : null}
            size={80}
            label="Reputation"
          />
          {rep?.latest_tag1 && (
            <div className="text-[10px] text-zinc-600 mt-1 text-center">
              {rep.latest_tag1}{rep.latest_tag2 ? ` / ${rep.latest_tag2}` : ''}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Metric
                label="Transactions"
                value={txSummary?.count_24h ?? 0}
                accent="text-blue-400"
              />
              <div className="text-[10px] text-zinc-600 mt-0.5">
                {txSummary?.count_7d ?? 0} (7d)
              </div>
            </div>
            {(txSummary?.count_7d ?? 0) > 0 && (
              <div className="mt-3">
                <MiniSparkline
                  data={generateTxSparkline(txSummary?.count_24h ?? 0, txSummary?.count_7d ?? 0)}
                  color="#3b82f6"
                  width={56}
                  height={20}
                />
              </div>
            )}
          </div>
        </div>

        {/* Gas Usage -- Phase B */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <Metric
            label="Gas Used (24h)"
            value={agent.gas_used_24h != null ? formatCompact(agent.gas_used_24h) : '--'}
            accent="text-purple-400"
          />
          {agent.gas_used_7d != null && (
            <div className="text-[10px] text-zinc-600 mt-0.5">
              {formatCompact(agent.gas_used_7d)} (7d)
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <Metric label="Services" value={services.length} />
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <Metric label="Protocol Links" value={stats?.protocol_count ?? protocols.length} />
        </div>
      </div>

      {/* Two-column detail grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          {/* Wallet Portfolio */}
          <WalletPortfolio
            balances={allBalances}
            totalValue={totalPortfolioValue}
          />

          {/* Activity Chart */}
          <AgentChart
            txCount24h={txSummary?.count_24h ?? 0}
            txCount7d={txSummary?.count_7d ?? 0}
            volume24h={txSummary?.volume_usd_24h ?? 0}
            volume7d={txSummary?.volume_usd_7d ?? 0}
            firstSeen={stats?.first_seen ?? agent.created_at}
            lastActive={stats?.last_active ?? null}
          />

          {/* Top Contract Interactions -- Phase B */}
          <Section title="Top Contract Interactions">
            {topContracts.length > 0 ? (
              <div className="space-y-1">
                {topContracts.slice(0, 10).map((c, i) => (
                  <div key={c.address ?? i} className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-300">
                          {c.name ?? truncateAddr(c.address)}
                        </span>
                        {c.name && (
                          <span className="text-[10px] font-mono text-zinc-600">
                            {truncateAddr(c.address)}
                          </span>
                        )}
                      </div>
                      {c.last_called && (
                        <div className="text-[10px] text-zinc-600 mt-0.5">
                          Last: {new Date(c.last_called).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 ml-2 flex items-center gap-1.5">
                      <span className="text-xs font-mono text-blue-400">{c.call_count}</span>
                      <span className="text-[10px] text-zinc-600">calls</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No contract interaction data yet</p>
            )}
          </Section>

          {/* Recent Transactions */}
          <Section title="Recent Transactions">
            {agent.wallet_transactions && agent.wallet_transactions.length > 0 ? (
              <div className="space-y-1">
                {agent.wallet_transactions.slice(0, 10).map((tx, i) => (
                  <div key={tx.hash ?? i} className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${
                          tx.type === 'send' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {tx.type}
                        </span>
                        <span className="text-xs font-mono text-zinc-400 truncate">
                          {truncateAddr(tx.hash)}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">
                        {tx.chain} &middot; {new Date(tx.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-zinc-300 shrink-0 ml-2">
                      {tx.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No transaction data yet</p>
            )}
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Services */}
          <Section title="Services">
            {services.length === 0 ? (
              <p className="text-xs text-zinc-600">No services registered</p>
            ) : (
              <div className="space-y-2">
                {services.map((s: any, i: number) => (
                  <div key={i} className="py-1.5 border-b border-zinc-800/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-300">{s.name}</span>
                      {s.description && <span className="text-[10px] text-zinc-600">-- {s.description}</span>}
                    </div>
                    {s.endpoint && (
                      <a href={s.endpoint} target="_blank" rel="noopener noreferrer"
                         className="text-[10px] font-mono text-blue-400/70 hover:text-blue-400 truncate block">
                        {s.endpoint}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Agent Connections -- Phase B */}
          <Section title="Agent Connections">
            {agentConnections.length > 0 ? (
              <div className="space-y-1">
                {agentConnections.slice(0, 10).map((conn, i) => (
                  <Link
                    key={conn.agent_id ?? i}
                    href={`/oracle/agents/${conn.agent_id}`}
                    className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors -mx-1 px-1 rounded"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-zinc-300">
                        {conn.agent_name ?? `Agent ${conn.agent_id.slice(0, 8)}`}
                      </span>
                      {conn.last_interaction && (
                        <div className="text-[10px] text-zinc-600 mt-0.5">
                          Last: {new Date(conn.last_interaction).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 ml-2 flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-xs font-mono text-amber-400">{conn.tx_count}</span>
                        <span className="text-[10px] text-zinc-600 ml-1">txns</span>
                      </div>
                      {conn.total_value_usd != null && conn.total_value_usd > 0 && (
                        <span className="text-xs font-mono text-zinc-400">
                          {formatUsd(conn.total_value_usd)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No agent-to-agent connections detected</p>
            )}
          </Section>

          {/* Protocol Links */}
          <Section title="Protocol Links">
            {protocols.length === 0 ? (
              <p className="text-xs text-zinc-600">No protocol links</p>
            ) : (
              <div className="space-y-2">
                {protocols.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0">
                    <div>
                      <span className="text-xs font-medium text-zinc-300">{p.protocol}</span>
                      <span className="text-xs font-mono text-zinc-500 ml-2">#{p.protocol_id}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600">{p.link_type}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* On-Chain Metadata */}
          <Section title="On-Chain Metadata">
            <div className="space-y-1.5">
              {/* ENS / Basename -- Phase B */}
              {resolvedName && (
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500">Resolved Name</span>
                  <span className="text-xs font-mono text-emerald-400">{resolvedName}</span>
                </div>
              )}
              {agent.owner_wallet && (
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500">Owner Wallet</span>
                  <span className="text-xs font-mono text-zinc-300">{truncateAddr(agent.owner_wallet)}</span>
                </div>
              )}
              {meta.agentWallet && (
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500">Agent Wallet</span>
                  <span className="text-xs font-mono text-zinc-300">{truncateAddr(meta.agentWallet)}</span>
                </div>
              )}
              {meta.serviceId && (
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500">Service ID</span>
                  <span className="text-xs font-mono text-zinc-300">{meta.serviceId}</span>
                </div>
              )}
              {meta.serviceRegistry && (
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500">Service Registry</span>
                  <span className="text-xs font-mono text-zinc-300 truncate ml-4">{truncateAddr(meta.serviceRegistry)}</span>
                </div>
              )}
              {meta.supportedTrust && (
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500">Trust Methods</span>
                  <span className="text-xs text-zinc-300">{Array.isArray(meta.supportedTrust) ? meta.supportedTrust.join(', ') : meta.supportedTrust}</span>
                </div>
              )}
              {agent.agent_uri && (
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500">Registration URI</span>
                  <a href={agent.agent_uri} target="_blank" rel="noopener noreferrer"
                     className="text-xs font-mono text-blue-400/70 hover:text-blue-400 truncate ml-4">
                    {agent.agent_uri}
                  </a>
                </div>
              )}

              {/* Wallets list with expanded details */}
              {wallets.length > 0 && (
                <div className="pt-2 mt-2 border-t border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Wallets</div>
                  {wallets.map((w, i) => (
                      <div key={i} className="group relative py-1.5 text-xs border-b border-zinc-800/30 last:border-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono text-zinc-300">{truncateAddr(w.address)}</span>
                            <span className="text-[10px] text-zinc-600 ml-1.5 inline-flex items-center gap-0.5"><ChainIcon chain={w.chain} size={10} /> {w.chain} &middot; {w.link_type}</span>
                          </div>
                          <span className="font-mono text-zinc-500">{(w.confidence * 100).toFixed(0)}%</span>
                        </div>
                        {resolvedName && i === 0 && (
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[10px] text-emerald-400/70 font-mono">{resolvedName}</span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </Section>

          {/* Recent Reputation Signals */}
          <Section title="Reputation Signals">
            {agent.feedback && agent.feedback.length > 0 ? (
              <div className="space-y-1.5">
                {agent.feedback.slice(0, 8).map((fb) => (
                  <div key={fb.id} className="flex items-center justify-between py-1 border-b border-zinc-800/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold font-mono ${
                        fb.value >= 80 ? 'text-emerald-400' : fb.value >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {fb.value}
                      </span>
                      {fb.tag1 && (
                        <span className="text-[10px] text-zinc-500">{fb.tag1}</span>
                      )}
                      {fb.tag2 && (
                        <span className="text-[10px] text-zinc-600">/ {fb.tag2}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-600 font-mono">
                      {new Date(fb.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No reputation signals yet</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
