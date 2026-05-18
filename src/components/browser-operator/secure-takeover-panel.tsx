'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { formatBrowserDate, formatBrowserLabel } from './format'
import type { BrowserOperatorConnectSession } from './types'

export function BrowserSecureTakeoverPanel({
  orgId,
  session,
}: {
  orgId: string
  session: BrowserOperatorConnectSession
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(session.status)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const complete = async (verified: boolean) => {
    setBusy(true)
    try {
      const csrf = await getCSRFTokenFromCookie()
      const response = await fetch(`/api/browser-operator/connect-sessions/${session.id}/complete`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          verified,
          metadata: { source: 'mission_control_secure_takeover' },
        }),
      })
      const payload = await response.json().catch(() => null) as { connect_session?: { status?: string }; error?: { message?: string } } | null
      if (!response.ok) throw new Error(payload?.error?.message ?? `Connect session failed (${response.status})`)
      setStatus(payload?.connect_session?.status ?? (verified ? 'connected' : 'failed'))
      toast.success(verified ? 'Merchant account connected' : 'Connect session marked failed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not complete secure takeover')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-base font-semibold">Secure merchant takeover</h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Open the provider takeover session, log in to the merchant once, then mark the session connected. Lucid stores only provider profile/context references here; raw passwords and payment secrets must stay out of agent context and logs.
            </p>
          </div>
          <Badge variant={status === 'connected' ? 'outline' : status === 'failed' ? 'destructive' : 'secondary'}>
            {formatBrowserLabel(status)}
          </Badge>
        </div>

        <div className="mt-5 rounded-lg border bg-muted/20 p-4">
          {session.takeover_url ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Provider takeover is ready</p>
                <p className="text-xs text-muted-foreground">
                  Expires {session.expires_at ? formatBrowserDate(session.expires_at) : 'soon'} · provider {formatBrowserLabel(session.provider)}
                </p>
              </div>
              <Button asChild>
                <a href={session.takeover_url} target="_blank" rel="noreferrer">
                  Open secure session
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This provider did not return a takeover URL. Configure Browserbase/Steel live-view settings or use a Lucid-managed takeover URL.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button disabled={!hydrated || busy || status === 'connected'} onClick={() => { void complete(true) }}>
            <ShieldCheck className="h-4 w-4" />
            Mark connected
          </Button>
          <Button variant="outline" disabled={!hydrated || busy || status === 'failed'} onClick={() => { void complete(false) }}>
            Mark failed
          </Button>
        </div>
      </section>

      <aside className="rounded-xl border bg-card p-5 text-sm">
        <h3 className="font-semibold">Session evidence</h3>
        <dl className="mt-3 space-y-2 text-xs">
          <EvidenceLine label="Session" value={session.id} />
          <EvidenceLine label="Provider" value={formatBrowserLabel(session.provider)} />
          <EvidenceLine label="Provider session" value={session.provider_session_ref ?? 'none'} />
          <EvidenceLine label="Profile" value={session.provider_profile_ref ?? 'none'} />
          <EvidenceLine label="Context" value={session.provider_context_ref ?? 'none'} />
          <EvidenceLine label="Live view" value={session.live_view_url ? 'available' : 'none'} />
        </dl>
        <div className="mt-5 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
          <h4 className="font-medium text-foreground">Safe handoff rules</h4>
          <p className="mt-2">Use takeover for login, MFA, CAPTCHA, delivery setup, and payment confirmation. Agents resume only after you mark the account connected, and checkout remains governed by policy and Trust Shield.</p>
        </div>
      </aside>
    </div>
  )
}

function EvidenceLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-foreground">{value}</dd>
    </div>
  )
}
