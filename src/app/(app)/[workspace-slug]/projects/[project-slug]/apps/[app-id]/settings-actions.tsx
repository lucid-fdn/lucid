'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PauseCircle, PlayCircle, Save } from 'lucide-react'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'

interface AppSettingsActionsProps {
  appId: string
  name: string
  slug: string
  status: string
  visibility: 'private' | 'unlisted' | 'public'
  frontendManifest: Record<string, unknown>
}

type ThemeSettings = {
  mode?: 'light' | 'dark' | 'system'
  primary_color?: string
  accent_color?: string
  font_family?: string
  radius?: 'none' | 'sm' | 'md'
}

type LimitSettings = {
  public_requests_per_day?: number
  chat_turns_per_session?: number
  max_upload_mb?: number
  monthly_cost_cents?: number
}

type ConsentSettings = {
  privacy_url?: string
  terms_url?: string
  transcript_retention_days?: number
}

function recordValue<T extends Record<string, unknown>>(value: unknown): T {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as T : {} as T
}

function numberValue(value: unknown): string {
  return typeof value === 'number' ? String(value) : ''
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function warmCsrf() {
  await fetch('/api/auth/csrf', { credentials: 'same-origin' }).catch(() => undefined)
  return getCSRFTokenFromCookie()
}

export function AppSettingsActions({
  appId,
  name,
  slug,
  status,
  visibility,
  frontendManifest,
}: AppSettingsActionsProps) {
  const router = useRouter()
  const theme = recordValue<ThemeSettings>(frontendManifest.theme)
  const limits = recordValue<LimitSettings>(frontendManifest.limits)
  const consent = recordValue<ConsentSettings>(frontendManifest.consent)

  const [form, setForm] = useState({
    name,
    slug,
    visibility,
    themeMode: theme.mode ?? 'system',
    primaryColor: theme.primary_color ?? '',
    accentColor: theme.accent_color ?? '',
    radius: theme.radius ?? 'sm',
    privacyUrl: consent.privacy_url ?? '',
    termsUrl: consent.terms_url ?? '',
    transcriptRetentionDays: numberValue(consent.transcript_retention_days),
    publicRequestsPerDay: numberValue(limits.public_requests_per_day),
    chatTurnsPerSession: numberValue(limits.chat_turns_per_session),
    maxUploadMb: numberValue(limits.max_upload_mb),
    monthlyCostCents: numberValue(limits.monthly_cost_cents),
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isLifecycleSubmitting, setIsLifecycleSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submitSettings() {
    if (isSaving) return
    setIsSaving(true)
    setError(null)
    setMessage(null)

    try {
      const csrf = await warmCsrf()
      const response = await fetch(`/api/app-services/${appId}/settings`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          visibility: form.visibility,
          theme: {
            mode: form.themeMode,
            primary_color: form.primaryColor || undefined,
            accent_color: form.accentColor || undefined,
            radius: form.radius,
          },
          consent: {
            privacy_url: form.privacyUrl || undefined,
            terms_url: form.termsUrl || undefined,
            transcript_retention_days: optionalNumber(form.transcriptRetentionDays),
          },
          limits: {
            public_requests_per_day: optionalNumber(form.publicRequestsPerDay),
            chat_turns_per_session: optionalNumber(form.chatTurnsPerSession),
            max_upload_mb: optionalNumber(form.maxUploadMb),
            monthly_cost_cents: optionalNumber(form.monthlyCostCents),
          },
        }),
      })

      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Settings update failed.')
      }

      setMessage('Settings saved.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settings update failed.')
    } finally {
      setIsSaving(false)
    }
  }

  async function submitLifecycle(action: 'pause' | 'resume') {
    if (isLifecycleSubmitting) return
    setIsLifecycleSubmitting(true)
    setError(null)
    setMessage(null)

    try {
      const csrf = await warmCsrf()
      const response = await fetch(`/api/app-services/${appId}/${action}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          note: action === 'pause'
            ? 'Paused from the app cockpit.'
            : 'Resumed from the app cockpit.',
        }),
      })

      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? `App ${action} failed.`)
      }

      setMessage(action === 'pause' ? 'App paused.' : 'App resumed.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : `App ${action} failed.`)
    } finally {
      setIsLifecycleSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Name</span>
          <input
            value={form.name}
            onChange={(event) => setField('name', event.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Slug</span>
          <input
            value={form.slug}
            onChange={(event) => setField('slug', event.target.value.toLowerCase())}
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Visibility</span>
          <select
            value={form.visibility}
            onChange={(event) => setField('visibility', event.target.value as typeof form.visibility)}
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Theme</span>
          <select
            value={form.themeMode}
            onChange={(event) => setField('themeMode', event.target.value as typeof form.themeMode)}
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Radius</span>
          <select
            value={form.radius}
            onChange={(event) => setField('radius', event.target.value as typeof form.radius)}
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="none">None</option>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Primary color</span>
          <input
            value={form.primaryColor}
            onChange={(event) => setField('primaryColor', event.target.value)}
            placeholder="#2563eb"
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Accent color</span>
          <input
            value={form.accentColor}
            onChange={(event) => setField('accentColor', event.target.value)}
            placeholder="#14b8a6"
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Privacy URL</span>
          <input
            value={form.privacyUrl}
            onChange={(event) => setField('privacyUrl', event.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Terms URL</span>
          <input
            value={form.termsUrl}
            onChange={(event) => setField('termsUrl', event.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Retention days</span>
          <input
            value={form.transcriptRetentionDays}
            onChange={(event) => setField('transcriptRetentionDays', event.target.value)}
            inputMode="numeric"
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Requests/day</span>
          <input
            value={form.publicRequestsPerDay}
            onChange={(event) => setField('publicRequestsPerDay', event.target.value)}
            inputMode="numeric"
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Chat turns</span>
          <input
            value={form.chatTurnsPerSession}
            onChange={(event) => setField('chatTurnsPerSession', event.target.value)}
            inputMode="numeric"
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Cost cents/mo</span>
          <input
            value={form.monthlyCostCents}
            onChange={(event) => setField('monthlyCostCents', event.target.value)}
            inputMode="numeric"
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submitSettings()}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save settings'}
        </button>
        {status === 'paused' ? (
          <button
            type="button"
            onClick={() => void submitLifecycle('resume')}
            disabled={isLifecycleSubmitting}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" />
            {isLifecycleSubmitting ? 'Resuming...' : 'Resume'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submitLifecycle('pause')}
            disabled={isLifecycleSubmitting}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PauseCircle className="h-4 w-4" />
            {isLifecycleSubmitting ? 'Pausing...' : 'Pause'}
          </button>
        )}
      </div>
    </div>
  )
}
