'use client'

import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import type { TemplateLibraryItem } from './library'
import type { TemplateProductEventType } from '@/lib/db/template-product-events'

interface TrackTemplateProductEventInput {
  orgId: string
  projectId?: string | null
  item?: Pick<TemplateLibraryItem, 'id' | 'slug' | 'name' | 'type' | 'backingKind'> | null
  templateId?: string | null
  templateSlug?: string
  templateName?: string | null
  templateType?: 'agent' | 'team' | 'capability'
  backingKind?: 'lucid_pack' | null
  eventType: TemplateProductEventType
  source?: 'templates' | 'template_detail' | 'installed_capability' | 'channel' | 'mission_control' | 'api'
  installId?: string | null
  runId?: string | null
  metadata?: Record<string, unknown>
}

export async function trackTemplateProductEvent(input: TrackTemplateProductEventInput): Promise<void> {
  const templateSlug = input.templateSlug ?? input.item?.slug
  const templateType = input.templateType ?? input.item?.type
  if (!templateSlug || !templateType) return

  try {
    let csrfToken = getCSRFTokenFromCookie()
    if (!csrfToken) {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' }).catch(() => undefined)
      csrfToken = getCSRFTokenFromCookie()
    }

    const response = await fetch('/api/templates/analytics', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({
        org_id: input.orgId,
        project_id: input.projectId ?? null,
        template_id: input.templateId ?? input.item?.id ?? null,
        template_slug: templateSlug,
        template_name: input.templateName ?? input.item?.name ?? null,
        template_type: templateType,
        backing_kind: input.backingKind ?? input.item?.backingKind ?? null,
        event_type: input.eventType,
        source: input.source ?? 'templates',
        install_id: input.installId ?? null,
        run_id: input.runId ?? null,
        metadata: input.metadata ?? {},
      }),
    })

    if (!response.ok && process.env.NODE_ENV === 'development') {
      console.warn('[templates:analytics] failed', response.status)
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[templates:analytics] failed', error)
    }
  }
}
