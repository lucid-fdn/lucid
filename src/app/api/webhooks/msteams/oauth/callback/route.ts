import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { encryptChannelSecrets } from '@/lib/channels/secrets'
import { getAssistant } from '@/lib/db'
import { getOrganizationById } from '@/lib/db/organizations'
import { getProjectByIdForWorkspace } from '@/lib/db/projects'
import { ErrorService } from '@/lib/errors/error-service'
import { buildProjectAgentDetailPath } from '@/lib/projects/urls'
import { verifyTeamsOAuthState } from '@/lib/msteams/oauth-state'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'node:crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getBaseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
}

async function buildReturnUrl(
  baseUrl: string,
  orgSlug: string | null,
  assistantId: string,
  orgId: string,
  toast: { type: 'success' | 'error'; message: string },
): Promise<string> {
  const params = new URLSearchParams({
    toast: toast.type,
    toast_msg: toast.message,
  })
  if (!orgSlug) {
    return `${baseUrl}/dashboard?${params.toString()}`
  }

  const assistant = await getAssistant(assistantId)
  if (!assistant || assistant.org_id !== orgId || !assistant.project_id) {
    return `${baseUrl}/${orgSlug}/projects?${params.toString()}`
  }

  const project = await getProjectByIdForWorkspace(orgId, assistant.project_id)
  if (!project) {
    return `${baseUrl}/${orgSlug}/projects?${params.toString()}`
  }

  return `${baseUrl}${buildProjectAgentDetailPath(orgSlug, project.slug, assistantId)}?${params.toString()}`
}

export async function GET(request: NextRequest) {
  try {
    const baseUrl = getBaseUrl(request)
    const state = request.nextUrl.searchParams.get('state')
    if (!state) {
      return NextResponse.json({ error: 'Missing state' }, { status: 400 })
    }

    const payload = verifyTeamsOAuthState(state)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired state' }, { status: 400 })
    }

    const sessionUserId = await getUserId()
    if (!sessionUserId || sessionUserId !== payload.userId) {
      return NextResponse.json(
        { error: 'Please log in as the user who started the install.' },
        { status: 401 },
      )
    }

    const org = await getOrganizationById(payload.orgId)
    const installError = request.nextUrl.searchParams.get('error')
    if (installError) {
      return NextResponse.redirect(
        await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
          type: 'error',
          message: `Microsoft Teams install failed: ${installError}`,
        }),
      )
    }

    const appId = process.env.MSTEAMS_HOSTED_APP_ID || process.env.TEAMS_APP_ID
    const appPassword = process.env.MSTEAMS_HOSTED_APP_PASSWORD
    const tenantId =
      request.nextUrl.searchParams.get('tenant_id')
      || request.nextUrl.searchParams.get('tenantId')
      || process.env.MSTEAMS_HOSTED_TENANT_ID
      || 'common'
    const tenantName =
      request.nextUrl.searchParams.get('tenant_name')
      || request.nextUrl.searchParams.get('tenantName')
      || null
    const encryptionKey = process.env.ENCRYPTION_KEY

    if (!appId || !appPassword || !encryptionKey) {
      return NextResponse.redirect(
        await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
          type: 'error',
          message: 'Microsoft Teams hosted install is not fully configured on this deployment.',
        }),
      )
    }

    const supabase = createServiceClient()
    const encryptedSecrets = encryptChannelSecrets(
      {
        app_id: appId,
        app_password: appPassword,
        tenant_id: tenantId,
      },
      encryptionKey,
    )

    const { data: secretsRow, error: secretsError } = await supabase
      .from('encrypted_secrets')
      .insert({ encrypted_data: encryptedSecrets })
      .select('id')
      .single()

    if (secretsError || !secretsRow) {
      throw secretsError || new Error('Failed to persist Teams hosted secrets')
    }

    const pendingConfig = {
      hosted: true,
      pending_bind: true,
      msteams_tenant_id: tenantId,
      msteams_tenant_name: tenantName,
      installed_via: 'oauth',
    }

    const { data: existing } = await supabase
      .from('assistant_channels')
      .select('id')
      .eq('assistant_id', payload.assistantId)
      .eq('channel_type', 'msteams')
      .eq('connection_mode', 'hosted')
      .maybeSingle()

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('assistant_channels')
        .update({
          encrypted_secrets_id: secretsRow.id,
          channel_config: pendingConfig,
          external_channel_id: null,
          is_active: false,
          is_primary: false,
        })
        .eq('id', existing.id)
      if (updateError) {
        throw updateError
      }
    } else {
      const { error: insertError } = await supabase
        .from('assistant_channels')
        .insert({
          assistant_id: payload.assistantId,
          channel_type: 'msteams',
          secret_token_hash: crypto.randomUUID(),
          encrypted_secrets_id: secretsRow.id,
          external_channel_id: null,
          webhook_url: null,
          is_active: false,
          channel_config: pendingConfig,
          connection_mode: 'hosted',
          inbound_routing_config: {},
          is_primary: false,
        })
      if (insertError) {
        throw insertError
      }
    }

    return NextResponse.redirect(
      await buildReturnUrl(baseUrl, org?.slug ?? null, payload.assistantId, payload.orgId, {
        type: 'success',
        message: 'Microsoft Teams installed. Open the Teams conversation where this agent should be active and run "bind".',
      }),
    )
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/webhooks/msteams/oauth/callback', method: 'GET' },
      tags: { layer: 'api', route: 'msteams-hosted-callback' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
