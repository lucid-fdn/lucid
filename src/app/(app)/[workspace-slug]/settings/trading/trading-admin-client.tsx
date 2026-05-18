'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  ShieldOff,
  Shield,
  Search,
} from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface TradingTransaction {
  id: string
  user_id: string
  assistant_id: string
  chain_type: string
  chain_id: string
  tx_type: string
  input_token: string
  output_token: string
  input_amount: string
  output_amount: string
  value_usd: number
  status: string
  tx_hash: string | null
  error_message: string | null
  created_at: string
}

interface TradingStats {
  totalTransactions: number
  totalVolumeUsd: number
  pendingCount: number
  failedCount: number
  successCount: number
}

interface KillSwitchStatus {
  enabled: boolean
  lastUpdated: string | null
}

// ============================================================================
// Status Helpers
// ============================================================================

const STATUS_BADGES: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  pending: { variant: 'outline', icon: Clock, label: 'Pending' },
  submitted: { variant: 'secondary', icon: Activity, label: 'Submitted' },
  confirmed: { variant: 'default', icon: CheckCircle2, label: 'Confirmed' },
  failed: { variant: 'destructive', icon: XCircle, label: 'Failed' },
  cancelled: { variant: 'outline', icon: XCircle, label: 'Cancelled' },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_BADGES[status] || STATUS_BADGES.pending
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

function formatUsd(value: number | null): string {
  if (value == null) return '—'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function shortenHash(hash: string | null): string {
  if (!hash) return '—'
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ============================================================================
// Component
// ============================================================================

export function TradingAdminClient() {
  const [transactions, setTransactions] = useState<TradingTransaction[]>([])
  const [stats, setStats] = useState<TradingStats>({
    totalTransactions: 0,
    totalVolumeUsd: 0,
    pendingCount: 0,
    failedCount: 0,
    successCount: 0,
  })
  const [killSwitch, setKillSwitch] = useState<KillSwitchStatus>({ enabled: false, lastUpdated: null })
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      // In production, these would be real API calls
      // For now, we show the admin UI structure with placeholder data
      setStats({
        totalTransactions: 0,
        totalVolumeUsd: 0,
        pendingCount: 0,
        failedCount: 0,
        successCount: 0,
      })
      setTransactions([])
      setKillSwitch({ enabled: false, lastUpdated: null })
    } catch (error) {
      console.error('[TradingAdmin] Failed to fetch data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    fetchData()
  }, [fetchData])

  const filteredTransactions = transactions.filter((tx) => {
    if (statusFilter !== 'all' && tx.status !== statusFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        tx.tx_hash?.toLowerCase().includes(q) ||
        tx.input_token.toLowerCase().includes(q) ||
        tx.output_token.toLowerCase().includes(q) ||
        tx.chain_type.toLowerCase().includes(q)
      )
    }
    return true
  })

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Trading Admin</h2>
          <p className="text-muted-foreground">
            Monitor autonomous trading transactions and manage system controls
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Kill Switch Card */}
      <Card className={killSwitch.enabled ? 'border-green-500/50' : 'border-red-500/50'}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {killSwitch.enabled ? (
                <Shield className="h-6 w-6 text-green-500" />
              ) : (
                <ShieldOff className="h-6 w-6 text-red-500" />
              )}
              <div>
                <CardTitle className="text-lg">Global Trading Kill Switch</CardTitle>
                <CardDescription>
                  {killSwitch.enabled
                    ? 'Trading is ENABLED — agents can execute transactions'
                    : 'Trading is DISABLED — all autonomous trading is blocked'}
                </CardDescription>
              </div>
            </div>
            <Badge variant={killSwitch.enabled ? 'default' : 'destructive'} className="text-sm">
              {killSwitch.enabled ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Transactions</CardDescription>
            <CardTitle className="text-3xl">{stats.totalTransactions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Volume</CardDescription>
            <CardTitle className="text-3xl">{formatUsd(stats.totalVolumeUsd)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl text-yellow-500">
              <Clock className="h-6 w-6" />
              {stats.pendingCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl text-red-500">
              <AlertTriangle className="h-6 w-6" />
              {stats.failedCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Transactions</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tx hash, token..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <p>No transactions found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Trade</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>TX Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {timeAgo(tx.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {tx.tx_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{tx.chain_type}/{tx.chain_id}</TableCell>
                    <TableCell className="text-xs">
                      {tx.input_amount} {tx.input_token} → {tx.output_amount} {tx.output_token}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatUsd(tx.value_usd)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={tx.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {tx.tx_hash ? (
                        <a
                          href={`https://etherscan.io/tx/${tx.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {shortenHash(tx.tx_hash)}
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}