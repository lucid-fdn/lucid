'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Inbox, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { formatBrowserDate, formatBrowserLabel, shortId } from './format'
import type { BrowserOperatorAlert } from './types'

interface BrowserAlertCenterProps {
  alerts: BrowserOperatorAlert[]
  orgId: string
  loading?: boolean
  onChanged?: () => Promise<void> | void
}

export function BrowserAlertCenter({
  alerts,
  orgId,
  loading,
  onChanged,
}: BrowserAlertCenterProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const visibleAlerts = alerts.filter((alert) => alert.status === 'open' || alert.status === 'acknowledged')

  const updateStatus = async (alert: BrowserOperatorAlert, status: BrowserOperatorAlert['status']) => {
    setBusy(`${status}:${alert.id}`)
    try {
      const csrf = await getCSRFTokenFromCookie()
      const response = await fetch(`/api/browser-operator/alerts/${alert.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          patch: {
            status,
            metadata: {
              ...(alert.metadata ?? {}),
              operator_action: status,
            },
          },
        }),
      })
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
      if (!response.ok) throw new Error(payload?.error?.message ?? `Could not update alert (${response.status})`)
      toast.success(status === 'resolved' ? 'Alert resolved' : `Alert ${formatBrowserLabel(status)}`)
      await onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update Browser Operator alert')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Operator alerts</h2>
          <p className="text-xs text-muted-foreground">
            Actionable account, provider, handoff, receipt, and policy issues. Alerts dedupe by merchant/run so one problem does not spam the team.
          </p>
        </div>
        <Badge variant={visibleAlerts.some((alert) => alert.severity === 'critical') ? 'destructive' : 'outline'}>
          {visibleAlerts.length} active
        </Badge>
      </div>
      <div className="divide-y">
        {loading ? (
          <EmptyAlert label="Loading Browser Operator alerts..." />
        ) : visibleAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-medium">No action needed</h3>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Connected accounts, secure takeover sessions, and assisted handoffs will appear here when Lucid needs a human.
            </p>
          </div>
        ) : visibleAlerts.map((alert) => (
          <div key={alert.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{alert.title}</span>
                <Badge variant={severityVariant(alert.severity)}>
                  {formatBrowserLabel(alert.severity)}
                </Badge>
                <Badge variant="secondary">{formatBrowserLabel(alert.alert_type)}</Badge>
              </div>
              {alert.message ? (
                <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Alert {shortId(alert.id)}</span>
                {alert.browser_account_id ? <span>Account {shortId(alert.browser_account_id)}</span> : null}
                {alert.purchase_run_id ? <span>Purchase {shortId(alert.purchase_run_id)}</span> : null}
                <span>{formatBrowserDate(alert.updated_at)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {(alert.primary_cta?.href || alert.href) ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={alert.primary_cta?.href ?? alert.href ?? '#'} target={isAbsoluteUrl(alert.primary_cta?.href ?? alert.href) ? '_blank' : undefined} rel="noreferrer">
                    {alert.primary_cta?.label ?? 'Open'}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
              {alert.status === 'open' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={Boolean(busy)}
                  onClick={() => { void updateStatus(alert, 'acknowledged') }}
                >
                  Acknowledge
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                disabled={Boolean(busy)}
                onClick={() => { void updateStatus(alert, 'resolved') }}
              >
                <CheckCircle2 className="h-4 w-4" />
                Resolve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={Boolean(busy)}
                onClick={() => { void updateStatus(alert, 'dismissed') }}
              >
                <XCircle className="h-4 w-4" />
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function EmptyAlert({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{label}</div>
}

function severityVariant(severity: BrowserOperatorAlert['severity']): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (severity) {
    case 'critical':
      return 'destructive'
    case 'warning':
      return 'secondary'
    case 'needs_attention':
      return 'default'
    case 'info':
    default:
      return 'outline'
  }
}

function isAbsoluteUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value))
}
