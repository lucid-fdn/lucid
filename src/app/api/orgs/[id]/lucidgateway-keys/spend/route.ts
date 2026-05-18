import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { canPerformAction } from '@/lib/access-control/server'
import { listOrgLucidGatewayKeys } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

function getLucidGatewayConfig() {
  const baseUrl = process.env.LUCIDGATEWAY_PROXY_URL
  const masterKey = process.env.LUCIDGATEWAY_MASTER_KEY
  if (!baseUrl || !masterKey) {
    throw new Error('LucidGateway configuration missing')
  }
  return { baseUrl, masterKey }
}

async function fetchKeySpend(baseUrl: string, masterKey: string, keyAlias: string) {
  // LiteLLM /key/info endpoint returns spend data per key
  const url = `${baseUrl.replace(/\/$/, '')}/key/info`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${masterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: keyAlias }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function _fetchGlobalSpend(baseUrl: string, masterKey: string) {
  // LiteLLM /global/spend/report endpoint
  const url = `${baseUrl.replace(/\/$/, '')}/global/spend/report`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${masterKey}` },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export interface KeySpendData {
  keyId: string
  keyAlias: string
  keyPreview: string
  totalSpend: number
  maxBudget: number | null
  budgetDuration: string | null
  rpmLimit: number | null
  tpmLimit: number | null
  models: string[]
  isActive: boolean
  createdAt: string
  // Per-model breakdown if available
  modelSpend: Array<{ model: string; spend: number; tokens: number }>
}

export async function GET(
  request: NextRequest,
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

    const keys = await listOrgLucidGatewayKeys(orgId)

    // Try to fetch spend data from LucidGateway proxy
    let keySpendMap: Record<string, { spend: number; modelSpend: Array<{ model: string; spend: number; tokens: number }> }> = {}

    try {
      const { baseUrl, masterKey } = getLucidGatewayConfig()

      // Fetch spend info for each key in parallel
      const spendResults = await Promise.allSettled(
        keys.map(async (key: { key_alias: string; lucidgateway_key_id: string | null }) => {
          const info = await fetchKeySpend(baseUrl, masterKey, key.key_alias)
          return { alias: key.key_alias, info }
        })
      )

      for (const result of spendResults) {
        if (result.status === 'fulfilled' && result.value.info) {
          const { alias, info } = result.value
          keySpendMap[alias] = {
            spend: info?.info?.spend ?? info?.spend ?? 0,
            modelSpend: (info?.info?.model_spend || []).map(
              (ms: { model: string; total_spend?: number; total_tokens?: number }) => ({
                model: ms.model,
                spend: ms.total_spend ?? 0,
                tokens: ms.total_tokens ?? 0,
              })
            ),
          }
        }
      }
    } catch {
      // Gateway not configured or unreachable — return keys with zero spend
    }

    const spendData: KeySpendData[] = keys.map(
      (key: {
        id: string
        key_alias: string
        key_preview: string
        max_budget: number | null
        budget_duration: string | null
        rpm_limit: number | null
        tpm_limit: number | null
        models: string[] | null
        is_active: boolean
        created_at: string
      }) => {
        const spend = keySpendMap[key.key_alias]
        return {
          keyId: key.id,
          keyAlias: key.key_alias,
          keyPreview: key.key_preview,
          totalSpend: spend?.spend ?? 0,
          maxBudget: key.max_budget,
          budgetDuration: key.budget_duration,
          rpmLimit: key.rpm_limit,
          tpmLimit: key.tpm_limit,
          models: key.models ?? [],
          isActive: key.is_active,
          createdAt: key.created_at,
          modelSpend: spend?.modelSpend ?? [],
        }
      }
    )

    // Compute aggregates
    const totalSpend = spendData.reduce((sum, k) => sum + k.totalSpend, 0)
    const totalBudget = spendData
      .filter((k) => k.maxBudget !== null)
      .reduce((sum, k) => sum + (k.maxBudget ?? 0), 0)
    const activeKeys = spendData.filter((k) => k.isActive).length

    // Aggregate model spend across all keys
    const modelTotals: Record<string, { spend: number; tokens: number }> = {}
    for (const key of spendData) {
      for (const ms of key.modelSpend) {
        if (!modelTotals[ms.model]) {
          modelTotals[ms.model] = { spend: 0, tokens: 0 }
        }
        modelTotals[ms.model].spend += ms.spend
        modelTotals[ms.model].tokens += ms.tokens
      }
    }

    const topModels = Object.entries(modelTotals)
      .map(([model, data]) => ({ model, ...data }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10)

    return NextResponse.json({
      keys: spendData,
      summary: {
        totalSpend,
        totalBudget,
        activeKeys,
        totalKeys: spendData.length,
        topModels,
      },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/lucidgateway-keys/spend', method: 'GET' },
      tags: { layer: 'api', route: 'org-lucidgateway-keys-spend' },
    })
    return NextResponse.json({ error: 'Failed to fetch spend data' }, { status: 500 })
  }
}