'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Bot, RefreshCw, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { BrowserProcedureList } from './procedure-list'
import { BrowserProcedureDetailSheet } from './procedure-detail'
import { BrowserHostPlaybookPanel } from './host-playbook-panel'
import { BrowserLiveSessionViewer } from './live-session-viewer'
import { BrowserTrustShield } from './trust-shield'
import { BrowserAccountPolicyPanel } from './account-policy-panel'
import { BrowserAccountReadinessPanel } from './account-readiness-panel'
import { BrowserAlertCenter } from './alert-center'
import { BrowserCapacityPanel } from './browser-capacity-panel'
import { formatBrowserLabel } from './format'
import type {
  BrowserOperatorAccount,
  BrowserOperatorAccountHealthSnapshot,
  BrowserOperatorAlert,
  BrowserOperatorByoRuntime,
  BrowserOperatorCapacity,
  BrowserOperatorCheckoutAdapterManifest,
  BrowserOperatorConnectSession,
  BrowserOperatorOverview,
  BrowserOperatorPurchasePolicy,
  BrowserOperatorProfile,
  BrowserOperatorProcedure,
  BrowserOperatorSession,
  BrowserProcedureDetail,
  BrowserSessionAction,
  PlaybookTrustAction,
  ProcedureTrustAction,
} from './types'

interface BrowserOperatorConsoleProps {
  orgId: string
  workspaceSlug: string
}

const EMPTY_OVERVIEW: BrowserOperatorOverview = {
  browserOperator: undefined,
  browserSecurityEvents: [],
  browserSessionEvents: [],
}

export function BrowserOperatorConsole({ orgId, workspaceSlug }: BrowserOperatorConsoleProps) {
  const [overview, setOverview] = useState<BrowserOperatorOverview>(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('sessions')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [selectedProcedure, setSelectedProcedure] = useState<BrowserOperatorProcedure | null>(null)
  const [procedureDetail, setProcedureDetail] = useState<BrowserProcedureDetail | null>(null)
  const [procedureDetailLoading, setProcedureDetailLoading] = useState(false)
  const [accounts, setAccounts] = useState<BrowserOperatorAccount[]>([])
  const [connectSessions, setConnectSessions] = useState<BrowserOperatorConnectSession[]>([])
  const [policies, setPolicies] = useState<BrowserOperatorPurchasePolicy[]>([])
  const [checkoutAdapters, setCheckoutAdapters] = useState<BrowserOperatorCheckoutAdapterManifest[]>([])
  const [profiles, setProfiles] = useState<BrowserOperatorProfile[]>([])
  const [byoRuntimes, setByoRuntimes] = useState<BrowserOperatorByoRuntime[]>([])
  const [capacity, setCapacity] = useState<BrowserOperatorCapacity | null>(null)
  const [alerts, setAlerts] = useState<BrowserOperatorAlert[]>([])
  const [accountHealth, setAccountHealth] = useState<BrowserOperatorAccountHealthSnapshot[]>([])

  const loadOverview = useCallback(async () => {
    setLoading(true)
    try {
      const [overviewPayload, accountsPayload, connectSessionsPayload, policiesPayload, checkoutAdaptersPayload, profilesPayload, byoPayload, capacityPayload, alertsPayload, accountHealthPayload] = await Promise.all([
        readJson<BrowserOperatorOverview>(await fetch(`/api/agent-ops/overview?org_id=${encodeURIComponent(orgId)}`, {
          cache: 'no-store',
        })).catch(() => EMPTY_OVERVIEW),
        readJson<{ accounts: BrowserOperatorAccount[] }>(await fetch(`/api/browser-operator/accounts?orgId=${encodeURIComponent(orgId)}`, {
          cache: 'no-store',
        })).catch(() => ({ accounts: [] })),
        readJson<{ connect_sessions: BrowserOperatorConnectSession[] }>(await fetch(`/api/browser-operator/connect-sessions?orgId=${encodeURIComponent(orgId)}&limit=50`, {
          cache: 'no-store',
        })).catch(() => ({ connect_sessions: [] })),
        readJson<{ policies: BrowserOperatorPurchasePolicy[] }>(await fetch(`/api/browser-operator/purchase-policies?orgId=${encodeURIComponent(orgId)}`, {
          cache: 'no-store',
        })).catch(() => ({ policies: [] })),
        readJson<{ checkout_adapters: BrowserOperatorCheckoutAdapterManifest[] }>(await fetch(`/api/browser-operator/checkout-adapters?orgId=${encodeURIComponent(orgId)}`, {
          cache: 'no-store',
        })).catch(() => ({ checkout_adapters: [] })),
        readJson<{ profiles: BrowserOperatorProfile[] }>(await fetch(`/api/browser-operator/profiles?orgId=${encodeURIComponent(orgId)}&limit=50`, {
          cache: 'no-store',
        })).catch(() => ({ profiles: [] })),
        readJson<{ byo_runtimes: BrowserOperatorByoRuntime[] }>(await fetch(`/api/browser-operator/byo-runtimes?orgId=${encodeURIComponent(orgId)}&limit=50`, {
          cache: 'no-store',
        })).catch(() => ({ byo_runtimes: [] })),
        readJson<{ capacity: BrowserOperatorCapacity }>(await fetch(`/api/browser-operator/capacity?orgId=${encodeURIComponent(orgId)}`, {
          cache: 'no-store',
        })).catch(() => ({ capacity: null as unknown as BrowserOperatorCapacity })),
        readJson<{ alerts: BrowserOperatorAlert[] }>(await fetch(`/api/browser-operator/alerts?orgId=${encodeURIComponent(orgId)}&status=open,acknowledged&limit=50`, {
          cache: 'no-store',
        })).catch(() => ({ alerts: [] })),
        readJson<{ account_health: BrowserOperatorAccountHealthSnapshot[] }>(await fetch(`/api/browser-operator/account-health?orgId=${encodeURIComponent(orgId)}&limit=100`, {
          cache: 'no-store',
        })).catch(() => ({ account_health: [] })),
      ])
      setOverview(overviewPayload)
      setAccounts(accountsPayload.accounts)
      setConnectSessions(connectSessionsPayload.connect_sessions)
      setPolicies(policiesPayload.policies)
      setCheckoutAdapters(checkoutAdaptersPayload.checkout_adapters)
      setProfiles(profilesPayload.profiles)
      setByoRuntimes(byoPayload.byo_runtimes)
      setCapacity(capacityPayload.capacity ?? null)
      setAlerts(alertsPayload.alerts)
      setAccountHealth(accountHealthPayload.account_health)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load Browser Operator')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const consoleData = overview.browserOperator ?? null
  const summary = consoleData?.summary
  const warnings = consoleData?.warnings ?? []
  const openAlertCount = alerts.filter((alert) => alert.status === 'open' || alert.status === 'acknowledged').length
  const criticalAlertCount = alerts.filter((alert) => alert.severity === 'critical' && (alert.status === 'open' || alert.status === 'acknowledged')).length

  const openProcedure = useCallback(async (procedure: BrowserOperatorProcedure) => {
    setSelectedProcedure(procedure)
    setProcedureDetailLoading(true)
    try {
      const response = await fetch(`/api/agent-ops/browser-procedures/${procedure.id}?org_id=${encodeURIComponent(orgId)}`, {
        cache: 'no-store',
      })
      setProcedureDetail(await readJson<BrowserProcedureDetail>(response))
    } catch (error) {
      setProcedureDetail(null)
      toast.error(error instanceof Error ? error.message : 'Could not load procedure detail')
    } finally {
      setProcedureDetailLoading(false)
    }
  }, [orgId])

  const updateProcedureTrust = useCallback(async (procedureId: string, action: ProcedureTrustAction) => {
    setBusyAction(`browser-procedure:${action}:${procedureId}`)
    try {
      const csrf = await ensureCsrfToken()
      await readJson<unknown>(await fetch(`/api/agent-ops/browser-procedures/${procedureId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          action,
          metadata: { source: 'mission_control_browser_operator_page' },
        }),
      }))
      toast.success(`Procedure ${formatBrowserLabel(action)} recorded`)
      await loadOverview()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update procedure')
    } finally {
      setBusyAction(null)
    }
  }, [loadOverview, orgId])

  const updatePlaybookTrust = useCallback(async (playbookId: string, action: PlaybookTrustAction) => {
    setBusyAction(`browser-playbook:${action}:${playbookId}`)
    try {
      const csrf = await ensureCsrfToken()
      await readJson<unknown>(await fetch(`/api/agent-ops/browser-host-playbooks/${playbookId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          action,
          metadata: { source: 'mission_control_browser_operator_page' },
        }),
      }))
      toast.success(`Host playbook ${formatBrowserLabel(action)} recorded`)
      await loadOverview()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update host playbook')
    } finally {
      setBusyAction(null)
    }
  }, [loadOverview, orgId])

  const updateSessionHandoff = useCallback(async (session: BrowserOperatorSession, action: BrowserSessionAction) => {
    setBusyAction(`browser-handoff:${action}:${session.sessionKey}`)
    try {
      const csrf = await ensureCsrfToken()
      await readJson<unknown>(await fetch(`/api/agent-ops/browser-sessions/${encodeURIComponent(session.sessionKey)}/handoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          run_id: session.runId,
          browser_session_id: session.browserSessionId ?? null,
          action,
          handoff_state: session.handoffState ?? null,
          current_url: session.currentUrl ?? null,
          actor_agent_label: 'Mission Control operator',
        }),
      }))
      toast.success(action === 'resolve' ? 'Browser handoff resolved' : 'Browser resume requested')
      await loadOverview()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update browser handoff')
    } finally {
      setBusyAction(null)
    }
  }, [loadOverview, orgId])

  const healthVariant = consoleData?.health === 'blocked'
    ? 'destructive'
    : consoleData?.health === 'needs_review'
      ? 'secondary'
      : 'outline'

  const showEmpty = !loading && !consoleData

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-muted/20 px-6 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <BrowserMetric label="Health" value={formatBrowserLabel(consoleData?.health ?? 'loading')} badgeVariant={healthVariant} />
            <BrowserMetric
              label="Alerts"
              value={String(openAlertCount)}
              detail={criticalAlertCount ? `${criticalAlertCount} critical` : 'active inbox'}
              badgeVariant={criticalAlertCount ? 'destructive' : openAlertCount ? 'secondary' : undefined}
            />
            <BrowserMetric label="Procedures" value={`${summary?.activeProcedureCount ?? 0}/${summary?.procedureCount ?? 0}`} detail="active / total" />
            <BrowserMetric label="Handoffs" value={String(summary?.handoffSessionCount ?? 0)} detail={`${summary?.resumableSessionCount ?? 0} resumable`} />
            <BrowserMetric label="Trust events" value={String(summary?.blockingTrustEventCount ?? 0)} detail={`${summary?.warningTrustEventCount ?? 0} warnings`} />
            <BrowserMetric label="Playbooks" value={`${summary?.activePlaybookCount ?? 0}/${summary?.playbookCount ?? 0}`} detail="active / total" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { void loadOverview() }} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        </div>
        {warnings.length > 0 ? (
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {warnings.map((warning) => (
              <div key={warning} className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {showEmpty ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-lg border bg-card p-6 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">Browser Operator is quiet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Promote browser QA evidence from Agent Ops runs to populate procedures, playbooks, handoffs, and Trust Shield events.
            </p>
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 flex-1">
          <div className="border-b px-6 py-3">
            <TabsList>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
              <TabsTrigger value="alerts">Alerts</TabsTrigger>
              <TabsTrigger value="accounts">Accounts</TabsTrigger>
              <TabsTrigger value="capacity">Capacity</TabsTrigger>
              <TabsTrigger value="procedures">Procedures</TabsTrigger>
              <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
              <TabsTrigger value="trust">Trust Shield</TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <TabsContent value="sessions" className="mt-0">
              <BrowserLiveSessionViewer
                sessions={consoleData?.sessions ?? []}
                events={overview.browserSessionEvents ?? []}
                busyAction={busyAction}
                onHandoffAction={updateSessionHandoff}
              />
            </TabsContent>
            <TabsContent value="alerts" className="mt-0">
              <BrowserAlertCenter
                orgId={orgId}
                alerts={alerts}
                loading={loading}
                onChanged={loadOverview}
              />
            </TabsContent>
            <TabsContent value="accounts" className="mt-0">
              <div className="space-y-4">
                <BrowserAccountReadinessPanel
                  orgId={orgId}
                  accounts={accounts}
                  profiles={profiles}
                  connectSessions={connectSessions}
                  alerts={alerts}
                  healthSnapshots={accountHealth}
                  workspaceSlug={workspaceSlug}
                  loading={loading}
                  onChanged={loadOverview}
                />
                <BrowserAccountPolicyPanel
                  orgId={orgId}
                  accounts={accounts}
                  connectSessions={connectSessions}
                  policies={policies}
                  checkoutAdapters={checkoutAdapters}
                  workspaceSlug={workspaceSlug}
                  loading={loading}
                  onChanged={loadOverview}
                />
              </div>
            </TabsContent>
            <TabsContent value="capacity" className="mt-0">
              <BrowserCapacityPanel
                orgId={orgId}
                capacity={capacity}
                profiles={profiles}
                byoRuntimes={byoRuntimes}
                loading={loading}
                onChanged={loadOverview}
              />
            </TabsContent>
            <TabsContent value="procedures" className="mt-0">
              <BrowserProcedureList
                procedures={consoleData?.procedures ?? []}
                busyAction={busyAction}
                onOpen={openProcedure}
                onTrustAction={updateProcedureTrust}
              />
            </TabsContent>
            <TabsContent value="playbooks" className="mt-0">
              <BrowserHostPlaybookPanel
                playbooks={consoleData?.playbooks ?? []}
                busyAction={busyAction}
                onTrustAction={updatePlaybookTrust}
              />
            </TabsContent>
            <TabsContent value="trust" className="mt-0">
              <BrowserTrustShield
                consoleData={consoleData}
                events={overview.browserSecurityEvents ?? []}
              />
            </TabsContent>
          </div>
        </Tabs>
      )}

      <div className="border-t px-6 py-2 text-xs text-muted-foreground">
        Scope: <span className="font-mono">{workspaceSlug}</span> · source: Agent Ops browser procedures, session events, shares, and Trust Shield tables.
      </div>

      <BrowserProcedureDetailSheet
        open={Boolean(selectedProcedure)}
        loading={procedureDetailLoading}
        detail={procedureDetail}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProcedure(null)
            setProcedureDetail(null)
          }
        }}
      />
    </div>
  )
}

function BrowserMetric({
  label,
  value,
  detail,
  badgeVariant,
}: {
  label: string
  value: string
  detail?: string
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline'
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      {badgeVariant ? (
        <Badge variant={badgeVariant} className="mt-2">{value}</Badge>
      ) : (
        <p className="mt-1 text-xl font-semibold">{value}</p>
      )}
      {detail ? <p className="text-[11px] text-muted-foreground">{detail}</p> : null}
    </div>
  )
}

async function ensureCsrfToken() {
  let token = getCSRFTokenFromCookie()
  if (!token) {
    await fetch('/api/auth/csrf').catch(() => {})
    token = getCSRFTokenFromCookie()
  }
  return token
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body
      ? String(body.error)
      : 'Request failed'
    throw new Error(message)
  }
  return body as T
}
