import { ImageResponse } from 'next/og'
import { ORACLE_API_URL, ORACLE_API_KEY } from '@/lib/oracle/config'

export const dynamic = 'force-dynamic'

export const runtime = 'edge'

async function fetchAgent(id: string) {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (ORACLE_API_KEY) headers['x-api-key'] = ORACLE_API_KEY

  const res = await fetch(`${ORACLE_API_URL}/v1/oracle/agents/${encodeURIComponent(id)}`, { headers })
  if (!res.ok) return null
  const json = await res.json()
  return json.data ?? null
}

function formatUsd(v: number | null | undefined): string {
  if (v == null || v === 0) return '$0'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

function scoreColor(score: number): string {
  if (score >= 90) return '#34d399' // emerald-400
  if (score >= 70) return '#fbbf24' // amber-400
  if (score >= 50) return '#fb923c' // orange-400
  return '#f87171' // red-400
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const agent = await fetchAgent(id)

  if (!agent) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#09090b',
            color: '#71717a',
            fontSize: 32,
            fontFamily: 'monospace',
          }}
        >
          Agent not found
        </div>
      ),
      { width: 1200, height: 630 },
    )
  }

  const name = agent.display_name ?? `Agent #${agent.erc8004_id}`
  const meta = agent.metadata_json ?? {}
  const services = Array.isArray(meta.services) ? meta.services : []
  const rep = agent.reputation_json ?? null
  const stats = agent.stats ?? null
  const walletCount = stats?.wallet_count ?? (agent.wallets?.length ?? 0)
  const score = rep?.avg_value ?? null
  const ecosystem = agent.ecosystem ?? null
  const portfolioValue = stats?.portfolio_value_usd ?? 0

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#09090b',
          padding: 60,
          fontFamily: 'monospace',
        }}
      >
        {/* Top row: branding */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 40,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: agent.active ? '#34d399' : '#52525b',
              }}
            />
            <span style={{ color: '#a1a1aa', fontSize: 18 }}>
              Lucid Agent Economy Oracle
            </span>
          </div>
          {ecosystem && (
            <div
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                fontSize: 16,
              }}
            >
              {ecosystem}
            </div>
          )}
        </div>

        {/* Agent name */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: '#e4e4e7',
            marginBottom: 16,
            lineHeight: 1.1,
          }}
        >
          {name.length > 30 ? name.slice(0, 29) + '...' : name}
        </div>

        {/* Description */}
        {(meta.description || agent.description) && (
          <div
            style={{
              fontSize: 18,
              color: '#71717a',
              marginBottom: 32,
              maxWidth: 800,
              lineHeight: 1.4,
            }}
          >
            {(meta.description || agent.description).slice(0, 120)}
          </div>
        )}

        {/* Metrics row */}
        <div
          style={{
            display: 'flex',
            gap: 48,
            marginTop: 'auto',
          }}
        >
          {/* Reputation Score */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1 }}>
              Reputation
            </span>
            <span
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: score != null ? scoreColor(score) : '#3f3f46',
                marginTop: 4,
              }}
            >
              {score != null ? `${score.toFixed(1)}%` : '--'}
            </span>
          </div>

          {/* Portfolio */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1 }}>
              Portfolio
            </span>
            <span
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: '#34d399',
                marginTop: 4,
              }}
            >
              {formatUsd(portfolioValue)}
            </span>
          </div>

          {/* Wallets */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1 }}>
              Wallets
            </span>
            <span
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: '#e4e4e7',
                marginTop: 4,
              }}
            >
              {walletCount}
            </span>
          </div>

          {/* Services */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1 }}>
              Services
            </span>
            <span
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: '#e4e4e7',
                marginTop: 4,
              }}
            >
              {services.length}
            </span>
          </div>

          {/* Transactions */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1 }}>
              Txns (24h)
            </span>
            <span
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: '#60a5fa',
                marginTop: 4,
              }}
            >
              {stats?.tx_count_24h ?? 0}
            </span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
