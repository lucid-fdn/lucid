import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import {
  createOrgLucidGatewayKey,
  getOrgLucidGatewayKey,
  listOrgLucidGatewayKeys,
  listOrgLucidGatewayKeyAuditEvents,
  logOrgLucidGatewayKeyAuditEvent,
  setOrgLucidGatewayKeyStatus,
} from '@/lib/db'
import { canPerformAction, getWorkspacePlan } from '@/lib/access-control/server'
import { getResolvedPlanLimits } from '@/lib/access-control/server'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const createKeySchema = z.object({
  keyAlias: z.string().min(3).max(120),
  rpmLimit: z.number().int().positive().optional(),
  tpmLimit: z.number().int().positive().optional(),
  maxBudget: z.number().positive().optional(),
  budgetDuration: z.string().min(1).max(32).optional(),
  models: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  rotateFromKeyId: z.string().uuid().optional(),
})

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

async function validateGeneratedVirtualKey(params: {
  gatewayBaseUrl: string
  virtualKey: string
  model?: string
}) {
  const url = `${params.gatewayBaseUrl.replace(/\/$/, '')}/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.virtualKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      temperature: 0,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`LucidGateway key validation failed (${response.status}): ${text || 'No response body'}`)
  }
}

// Free tier model whitelist (cost-efficient, capable subset)
const FREE_TIER_MODELS = [
  'gpt-4o-mini',
  'gpt-3.5-turbo',
  'claude-3-5-haiku-latest',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'llama-3.1-8b',
  'llama-3.1-70b',
  'mistral-small-latest',
  'mistral-nemo',
  'command-r',
  'groq/llama-3.1-8b-instant',
  'groq/mixtral-8x7b-32768',
  'together/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  'text-embedding-3-small',
  'text-embedding-ada-002',
  'deepseek-chat',
  'qwen-turbo',
  'yi-lightning',
  'phi-3-mini-128k-instruct',
]

function toPreview(key: string) {
  if (key.length <= 12) return key
  return `${key.slice(0, 6)}...${key.slice(-4)}`
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params
    const canView = await canPerformAction(userId, orgId, 'viewSettings')
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Include plan info so client can render appropriate UI
    const plan = await getWorkspacePlan(orgId)
    const limits = await getResolvedPlanLimits(orgId)

    const keys = await listOrgLucidGatewayKeys(orgId)

    return NextResponse.json({
      keys,
      plan,
      limits: {
        maxGatewayKeys: limits.maxGatewayKeys,
        gatewayKeyCustomLimits: limits.gatewayKeyCustomLimits,
        gatewayKeyRotation: limits.gatewayKeyRotation,
        gatewayKeyAudit: limits.gatewayKeyAudit,
        gatewayKeyTemplates: limits.gatewayKeyTemplates,
        gatewayKeyBudgets: limits.gatewayKeyBudgets,
        gatewayMaxModels: limits.gatewayMaxModels,
      },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/lucidgateway-keys', method: 'GET' },
      tags: { layer: 'api', route: 'org-lucidgateway-keys' },
    })
    return NextResponse.json({ error: 'Failed to list LucidGateway keys' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let userIdForAudit: string | null = null
  let orgIdForAudit: string | null = null

  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userIdForAudit = userId

    const { id: orgId } = await params
    orgIdForAudit = orgId
    const canManage = await canPerformAction(userId, orgId, 'manageSettings')
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validated = createKeySchema.parse(body)

    // ── Plan limit enforcement ─────────────────────────────────────────
    const customLimitsCheck = await evaluateEntitlement({ orgId, action: 'manage_gateway_keys' })
    const customLimitsGuard = guardEntitlement(customLimitsCheck)
    if (customLimitsGuard) return customLimitsGuard

    // Check active key count against plan limit
    const existingKeys = await listOrgLucidGatewayKeys(orgId)
    const activeKeyCount = existingKeys.filter((k: { is_active: boolean }) => k.is_active).length
    const keyLimitCheck = await evaluateEntitlement({ orgId, action: 'create_gateway_key', currentUsage: activeKeyCount })
    const keyLimitGuard = guardEntitlement(keyLimitCheck)
    if (keyLimitGuard) return keyLimitGuard

    // Check for idempotency key to prevent duplicate creation on network retry
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (idempotencyKey) {
      // Search audit events for existing successful creation/rotation with this idempotency key
      const existingEvents = await listOrgLucidGatewayKeyAuditEvents({ orgId })
      
      const matchingEvent = existingEvents.find(
        (event: { event_type: string; metadata: unknown; key_id?: string | null }) =>
          (event.event_type === 'created' || event.event_type === 'rotation_completed') &&
          event.metadata &&
          typeof event.metadata === 'object' &&
          'idempotencyKey' in event.metadata &&
          (event.metadata as Record<string, unknown>).idempotencyKey === idempotencyKey
      )

      if (matchingEvent && matchingEvent.key_id) {
        // Return existing key (idempotent response)
        const existingKey = await getOrgLucidGatewayKey(orgId, matchingEvent.key_id)
        if (existingKey) {
          return NextResponse.json(
            {
              key: existingKey,
              virtualKey: null, // Cannot reveal virtual key again for security
              idempotent: true,
            },
            { status: 200 }
          )
        }
      }
    }

    let rotatedFromKeyId: string | null = null
    let keyToRotate: Awaited<ReturnType<typeof getOrgLucidGatewayKey>> | null = null
    if (validated.rotateFromKeyId) {
      keyToRotate = await getOrgLucidGatewayKey(orgId, validated.rotateFromKeyId)
      if (!keyToRotate || !keyToRotate.is_active) {
        return NextResponse.json({ error: 'Key to rotate was not found or already inactive' }, { status: 404 })
      }

      rotatedFromKeyId = keyToRotate.id
      await logOrgLucidGatewayKeyAuditEvent({
        orgId,
        keyId: keyToRotate.id,
        eventType: 'rotation_started',
        actorUserId: userId,
        metadata: {
          rotateFromKeyId: keyToRotate.id,
          rotateFromAlias: keyToRotate.key_alias,
          rotateToAlias: validated.keyAlias,
        },
      })
    }

    const generated = await lucidGatewayAdminRequest('/key/generate', {
      key_alias: validated.keyAlias,
      rpm_limit: validated.rpmLimit,
      tpm_limit: validated.tpmLimit,
      max_budget: validated.maxBudget,
      budget_duration: validated.budgetDuration,
      models: validated.models,
      metadata: {
        ...(validated.metadata || {}),
        org_id: orgId,
        created_by: userId,
      },
    })

    const virtualKey = generated?.key
    if (!virtualKey || typeof virtualKey !== 'string') {
      throw new Error('LucidGateway did not return a virtual key')
    }

    const { baseUrl } = getLucidGatewayConfig()
    try {
      await validateGeneratedVirtualKey({
        gatewayBaseUrl: baseUrl,
        virtualKey,
        model: validated.models?.[0],
      })
    } catch (validationError) {
      try {
        await lucidGatewayAdminRequest('/key/delete', { key_aliases: [validated.keyAlias] })
      } catch (cleanupError) {
        ErrorService.captureException(cleanupError as Error, {
          severity: 'warning',
          context: {
            endpoint: '/api/orgs/[id]/lucidgateway-keys',
            method: 'POST',
            orgId,
            keyAlias: validated.keyAlias,
            operation: 'lucidgateway-cleanup-failed-validation',
          },
          tags: { layer: 'api', route: 'org-lucidgateway-keys' },
        })
      }

      await logOrgLucidGatewayKeyAuditEvent({
        orgId,
        keyId: rotatedFromKeyId,
        eventType: 'rotation_failed',
        actorUserId: userId,
        metadata: {
          rotateFromKeyId: rotatedFromKeyId,
          rotateToAlias: validated.keyAlias,
          reason: validationError instanceof Error ? validationError.message : 'unknown_validation_error',
        },
      })

      throw validationError
    }

    const created = await createOrgLucidGatewayKey({
      orgId,
      keyAlias: validated.keyAlias,
      keyPreview: toPreview(virtualKey),
      lucidgatewayKeyId: generated?.key_id || generated?.token_id || null,
      rawVirtualKey: virtualKey,
      rpmLimit: validated.rpmLimit,
      tpmLimit: validated.tpmLimit,
      maxBudget: validated.maxBudget,
      budgetDuration: validated.budgetDuration,
      models: validated.models || [],
      metadata: {
        ...(validated.metadata || {}),
        lucidgatewayResponseMeta: {
          expires: generated?.expires,
        },
      },
      createdBy: userId,
      rotatedFromKeyId,
    })

    if (keyToRotate) {
      try {
        await lucidGatewayAdminRequest('/key/delete', { key_aliases: [keyToRotate.key_alias] })
      } catch (error) {
        ErrorService.captureException(error as Error, {
          severity: 'warning',
          context: {
            endpoint: '/api/orgs/[id]/lucidgateway-keys',
            method: 'POST',
            orgId,
            rotateFromKeyId: keyToRotate.id,
            operation: 'lucidgateway-delete-old-alias',
          },
          tags: { layer: 'api', route: 'org-lucidgateway-keys' },
        })
      }

      await setOrgLucidGatewayKeyStatus({
        orgId,
        keyId: keyToRotate.id,
        status: 'rotated',
        isActive: false,
        metadata: {
          ...(keyToRotate.metadata || {}),
          rotatedAt: new Date().toISOString(),
          rotatedBy: userId,
          rotatedToKeyId: created.id,
          rotatedToAlias: created.key_alias,
        },
      })

      await logOrgLucidGatewayKeyAuditEvent({
        orgId,
        keyId: keyToRotate.id,
        eventType: 'rotated',
        actorUserId: userId,
        metadata: {
          rotateToKeyId: created.id,
          rotateToAlias: created.key_alias,
        },
      })

      await logOrgLucidGatewayKeyAuditEvent({
        orgId,
        keyId: created.id,
        eventType: 'rotation_completed',
        actorUserId: userId,
        metadata: {
          rotatedFromKeyId: keyToRotate.id,
          rotatedFromAlias: keyToRotate.key_alias,
        },
      })
    } else {
      await logOrgLucidGatewayKeyAuditEvent({
        orgId,
        keyId: created.id,
        eventType: 'created',
        actorUserId: userId,
        metadata: {
          keyAlias: created.key_alias,
          modelCount: created.models?.length || 0,
          idempotencyKey,
        },
      })
    }

    return NextResponse.json(
      {
        key: created,
        virtualKey,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    if (orgIdForAudit && userIdForAudit) {
      await logOrgLucidGatewayKeyAuditEvent({
        orgId: orgIdForAudit,
        eventType: 'error',
        actorUserId: userIdForAudit,
        metadata: {
          endpoint: '/api/orgs/[id]/lucidgateway-keys',
          method: 'POST',
          error: error instanceof Error ? error.message : 'unknown_error',
        },
      })
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/lucidgateway-keys', method: 'POST' },
      tags: { layer: 'api', route: 'org-lucidgateway-keys' },
    })
    return NextResponse.json({ error: 'Failed to create LucidGateway key' }, { status: 500 })
  }
}
