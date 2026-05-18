import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ErrorService } from '@/lib/errors/error-service'
import { AuthenticationError } from '@/lib/errors/types'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

/**
 * GET /api/trading/policy?assistantId=xxx
 * Get trading policy for an assistant
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const { searchParams } = new URL(request.url)
    const assistantId = searchParams.get('assistantId')

    if (!assistantId) {
      return NextResponse.json(
        { error: 'assistantId is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check user has access to this assistant's org
    const { data: assistant, error: assistantError } = await supabase
      .from('ai_assistants')
      .select('id, org_id')
      .eq('id', assistantId)
      .single()

    if (assistantError || !assistant) {
      return NextResponse.json(
        { error: 'Assistant not found' },
        { status: 404 }
      )
    }

    // Verify org membership
    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', assistant.org_id)
      .eq('user_id', userId)
      .single()

    if (memberError || !member) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Get trading policy
    const { data: policy, error: policyError } = await supabase
      .from('trading_policies')
      .select('id, assistant_id, enabled, max_trade_value_usd, daily_limit_usd, allowed_chains, allowed_tokens, max_slippage_bps, require_confirmation_above_usd, blocked_protocols, onchain_capabilities, quorum_threshold_usd, transfer_mode, created_at, updated_at')
      .eq('assistant_id', assistantId)
      .single()

    if (policyError && policyError.code !== 'PGRST116') {
      throw policyError
    }

    // Return policy or default
    const defaultPolicy = {
      assistant_id: assistantId,
      enabled: false,
      max_trade_value_usd: 100,
      daily_limit_usd: 500,
      allowed_chains: [],
      allowed_tokens: {},
      max_slippage_bps: 100,
      require_confirmation_above_usd: null,
      blocked_protocols: [],
    }

    return NextResponse.json({
      policy: policy || defaultPolicy,
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/trading/policy', method: 'GET' },
      tags: { layer: 'api', route: 'trading-policy' }
    })
    return NextResponse.json(
      { error: 'Failed to get trading policy' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/trading/policy
 * Update trading policy for an assistant
 */
export const PUT = withCSRF(async (req: NextRequest) => {
  try {
    const userId = await requireUserId()
    const body = await req.json()
    const { assistantId, ...policyData } = body

    if (!assistantId) {
      return NextResponse.json(
        { error: 'assistantId is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Check user has admin access to this assistant's org
    const { data: assistant, error: assistantError } = await supabase
      .from('ai_assistants')
      .select('id, org_id')
      .eq('id', assistantId)
      .single()

    if (assistantError || !assistant) {
      return NextResponse.json(
        { error: 'Assistant not found' },
        { status: 404 }
      )
    }

    // Verify org membership with admin/owner role
    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', assistant.org_id)
      .eq('user_id', userId)
      .single()

    if (memberError || !member) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    if (!['owner', 'admin'].includes(member.role)) {
      return NextResponse.json(
        { error: 'Admin access required to update trading policy' },
        { status: 403 }
      )
    }

    // Validate policy data
    const validFields = [
      'enabled',
      'max_trade_value_usd',
      'daily_limit_usd',
      'allowed_chains',
      'allowed_tokens',
      'max_slippage_bps',
      'require_confirmation_above_usd',
      'blocked_protocols',
    ]

    const updateData: Record<string, unknown> = {
      assistant_id: assistantId,
      updated_at: new Date().toISOString(),
    }

    for (const field of validFields) {
      if (field in policyData) {
        updateData[field] = policyData[field]
      }
    }

    // Upsert trading policy
    const { data: policy, error: policyError } = await supabase
      .from('trading_policies')
      .upsert(updateData, {
        onConflict: 'assistant_id',
      })
      .select('id, assistant_id, enabled, max_trade_value_usd, daily_limit_usd, allowed_chains, allowed_tokens, max_slippage_bps, require_confirmation_above_usd, blocked_protocols, onchain_capabilities, quorum_threshold_usd, transfer_mode, created_at, updated_at')
      .single()

    if (policyError) {
      throw policyError
    }

    return NextResponse.json({
      success: true,
      policy,
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/trading/policy', method: 'PUT' },
      tags: { layer: 'api', route: 'trading-policy' }
    })
    return NextResponse.json(
      { error: 'Failed to update trading policy' },
      { status: 500 }
    )
  }
})
