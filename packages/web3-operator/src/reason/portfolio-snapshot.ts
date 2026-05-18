/**
 * portfolio_snapshot + get_pnl — Competition-ready portfolio tracking.
 *
 * Snapshots record the full portfolio state at a point in time.
 * PnL compares current state against a snapshot to compute returns.
 *
 * Storage: Injected via SnapshotStore (config.ts).
 * Default: in-memory store. LucidMerged injects DB-backed store.
 */

import type { PortfolioSnapshot, PortfolioState, PnLReport, Chain } from '@lucid-fdn/web3-types'
import { formatDuration } from '../shared/format.js'
import { getConfig } from '../config.js'

// ── Snapshot ─────────────────────────────────────────────────────────

export interface SnapshotArgs {
  /** Assistant/agent ID */
  assistantId: string
  /** Portfolio state to snapshot */
  portfolio: PortfolioState
  /** Optional label (e.g. "competition_start") */
  label?: string
}

export async function createSnapshot(args: SnapshotArgs): Promise<PortfolioSnapshot> {
  const snapshot: PortfolioSnapshot = {
    id: crypto.randomUUID(),
    assistantId: args.assistantId,
    wallet: args.portfolio.wallet,
    state: args.portfolio,
    label: args.label,
    createdAt: new Date().toISOString(),
  }

  await getConfig().snapshotStore.put(snapshot)
  return snapshot
}

// ── Get Snapshots ────────────────────────────────────────────────────

export interface GetSnapshotsArgs {
  assistantId: string
  label?: string
  limit?: number
}

export async function getSnapshots(args: GetSnapshotsArgs): Promise<PortfolioSnapshot[]> {
  return getConfig().snapshotStore.list(args.assistantId, {
    label: args.label,
    limit: args.limit || 10,
  })
}

// ── PnL Calculation ──────────────────────────────────────────────────

export function calculatePnL(
  startSnapshot: PortfolioSnapshot,
  currentState: PortfolioState,
): PnLReport {
  const startValue = startSnapshot.state.totalValueUsd
  const currentValue = currentState.totalValueUsd
  const pnlUsd = currentValue - startValue
  const pnlPercent = startValue > 0 ? (pnlUsd / startValue) * 100 : 0

  // Per-asset breakdown
  const assetBreakdown: PnLReport['assetBreakdown'] = []
  const startByKey = new Map<string, { symbol: string; chain: Chain; value: number }>()

  for (const b of startSnapshot.state.balances) {
    const key = `${b.asset.chain}:${b.asset.address}`
    startByKey.set(key, {
      symbol: b.asset.symbol,
      chain: b.asset.chain,
      value: b.valueUsd || 0,
    })
  }

  for (const b of currentState.balances) {
    const key = `${b.asset.chain}:${b.asset.address}`
    const start = startByKey.get(key)
    const startVal = start?.value || 0
    const currentVal = b.valueUsd || 0
    const assetPnl = currentVal - startVal

    if (startVal > 0 || currentVal > 0) {
      assetBreakdown.push({
        symbol: b.asset.symbol,
        chain: b.asset.chain,
        startValue: startVal,
        currentValue: currentVal,
        pnlUsd: assetPnl,
        pnlPercent: startVal > 0 ? (assetPnl / startVal) * 100 : currentVal > 0 ? 100 : 0,
      })
    }
    startByKey.delete(key)
  }

  // Assets that were in start but not in current (sold completely)
  for (const [, start] of startByKey) {
    if (start.value > 0) {
      assetBreakdown.push({
        symbol: start.symbol,
        chain: start.chain,
        startValue: start.value,
        currentValue: 0,
        pnlUsd: -start.value,
        pnlPercent: -100,
      })
    }
  }

  // Sort by absolute PnL
  assetBreakdown.sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd))

  const startTime = new Date(startSnapshot.createdAt).getTime()
  const now = Date.now()
  const durationSeconds = Math.floor((now - startTime) / 1000)

  return {
    startSnapshot,
    currentState,
    pnlUsd,
    pnlPercent,
    assetBreakdown,
    durationSeconds,
    bestPerformer: assetBreakdown.find(a => a.pnlPercent > 0)?.symbol,
    worstPerformer: [...assetBreakdown].sort((a, b) => a.pnlPercent - b.pnlPercent)[0]?.symbol,
  }
}

// ── Tool Entry Points ────────────────────────────────────────────────

export async function toolPortfolioSnapshot(args: {
  assistantId: string
  portfolio: PortfolioState
  label?: string
}): Promise<string> {
  const snapshot = await createSnapshot({
    assistantId: args.assistantId,
    portfolio: args.portfolio,
    label: args.label,
  })

  return JSON.stringify({
    snapshotId: snapshot.id,
    label: snapshot.label,
    totalValueUsd: snapshot.state.totalValueUsd,
    assetCount: snapshot.state.balances.length,
    createdAt: snapshot.createdAt,
    formatted: `Snapshot saved: $${snapshot.state.totalValueUsd.toFixed(2)} across ${snapshot.state.balances.length} assets${snapshot.label ? ` (${snapshot.label})` : ''}`,
  })
}

export async function toolGetPnL(args: {
  assistantId: string
  currentPortfolio: PortfolioState
  snapshotLabel?: string
}): Promise<string> {
  const snapshots = await getSnapshots({
    assistantId: args.assistantId,
    label: args.snapshotLabel,
    limit: 1,
  })

  if (!snapshots.length) {
    return JSON.stringify({
      error: 'No snapshot found. Take a portfolio snapshot first using portfolio_snapshot.',
    })
  }

  const report = calculatePnL(snapshots[0], args.currentPortfolio)

  const sign = report.pnlUsd >= 0 ? '+' : ''
  const lines = [
    `PnL Report (${formatDuration(report.durationSeconds)})`,
    `Start: $${report.startSnapshot.state.totalValueUsd.toFixed(2)}`,
    `Current: $${report.currentState.totalValueUsd.toFixed(2)}`,
    `PnL: ${sign}$${report.pnlUsd.toFixed(2)} (${sign}${report.pnlPercent.toFixed(2)}%)`,
    '',
    'Per-Asset Breakdown:',
  ]

  for (const a of report.assetBreakdown.slice(0, 10)) {
    const s = a.pnlUsd >= 0 ? '+' : ''
    lines.push(`  ${a.symbol} (${a.chain}): ${s}$${a.pnlUsd.toFixed(2)} (${s}${a.pnlPercent.toFixed(1)}%)`)
  }

  if (report.bestPerformer) lines.push(`\nBest: ${report.bestPerformer}`)
  if (report.worstPerformer) lines.push(`Worst: ${report.worstPerformer}`)

  return JSON.stringify({
    pnl: report,
    formatted: lines.join('\n'),
  })
}
