/**
 * DELETE /api/orgs/[id]/lucidgateway-keys/[keyId]
 * 
 * Revoke a LucidGateway key
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getOrgLucidGatewayKey,
  logOrgLucidGatewayKeyAuditEvent,
  setOrgLucidGatewayKeyStatus,
} from '@/lib/db'
import { canPerformAction } from '@/lib/access-control/server'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

function getLucidGatewayConfig() {
  const baseUrl = process.env.LUCIDGATEWAY_PROXY_URL
  const masterKey = process.env.LUCIDGATEWAY_MASTER_KEY

  if (!baseUrl || !masterKey) {
    throw new Error('LucidGateway admin configuration is missing (LUCIDGATEWAY_PROXY_URL / LUCIDGATEWAY_MASTER_KEY)')
  }

  return { baseUrl, masterKey }
}

async function lucidGatewayAdminRequest(path: string, body: Record<string, unknown>) {
  const { baseUrl, masterKey } = getLucidGatewayConfig()
  const url = `${baseUrl.replace(/\/$/, '')}${path}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${masterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`LucidGateway admin request failed (${response.status}): ${text || 'No response body'}`)
  }

  return response.json()
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId, keyId } = await params
    const canManage = await canPerformAction(userId, orgId, 'manageSettings')
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get the key to revoke
    const key = await getOrgLucidGatewayKey(orgId, keyId)
    if (!key) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 })
    }

    if (!key.is_active) {
      return NextResponse.json({ error: 'Key is already inactive' }, { status: 400 })
    }

    // Plan enforcement: Free users cannot revoke their auto-generated key
    const keyManageCheck = await evaluateEntitlement({ orgId, action: 'manage_gateway_keys' })
    const keyManageGuard = guardEntitlement(keyManageCheck)
    if (keyManageGuard) return keyManageGuard

    // Log revocation start
    await logOrgLucidGatewayKeyAuditEvent({
      orgId,
      keyId,
      eventType: 'revocation_started',
      actorUserId: userId,
      metadata: {
        keyAlias: key.key_alias,
      },
    })

    // Delete from LucidGateway
    try {
      await lucidGatewayAdminRequest('/key/delete', { key_aliases: [key.key_alias] })
    } catch (error) {
      ErrorService.captureException(error as Error, {
        severity: 'warning',
        context: {
          endpoint: '/api/orgs/[id]/lucidgateway-keys/[keyId]',
          method: 'DELETE',
          orgId,
          keyId,
          operation: 'lucidgateway-delete-key',
        },
        tags: { layer: 'api', route: 'org-lucidgateway-keys-revoke' },
      })
    }

    // Mark as revoked in database
    await setOrgLucidGatewayKeyStatus({
      orgId,
      keyId,
      status: 'revoked',
      isActive: false,
      metadata: {
        ...(key.metadata || {}),
        revokedAt: new Date().toISOString(),
        revokedBy: userId,
      },
    })

    // Log revocation completed
    await logOrgLucidGatewayKeyAuditEvent({
      orgId,
      keyId,
      eventType: 'revoked',
      actorUserId: userId,
      metadata: {
        keyAlias: key.key_alias,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/lucidgateway-keys/[keyId]', method: 'DELETE' },
      tags: { layer: 'api', route: 'org-lucidgateway-keys-revoke' },
    })
    return NextResponse.json({ error: 'Failed to revoke LucidGateway key' }, { status: 500 })
  }
}