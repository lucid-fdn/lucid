/**
 * Permissionless SDK Launch Endpoint
 *
 * POST /api/launchpad/sdk/launch
 *
 * Allows developers to programmatically launch AI agents on Lucid Launch
 * without a UI. Auto-provisions org + assistant if not provided.
 *
 * Auth: API key via X-API-Key header (validated against gateway_tenants).
 * No session/CSRF required — designed for server-to-server calls.
 */

import { NextRequest, NextResponse } from 'next/server'
import { CreateLaunchedAgentInput } from '@contracts/launchpad'
import { FEATURES } from '@/lib/features'
import { ErrorService } from '@/lib/errors/error-service'

// ---------------------------------------------------------------------------
// API Key Validation
// ---------------------------------------------------------------------------

async function validateApiKey(apiKey: string): Promise<{ userId: string; orgId: string } | null> {
  const { supabase } = await import('@/lib/db/client')

  // Look up tenant by API key — supports both gateway keys and org-level keys
  const { data: tenant } = await supabase
    .from('gateway_tenants')
    .select('id, owner_id, org_id')
    .eq('api_key', apiKey)
    .eq('status', 'active')
    .limit(1)
    .single()

  if (!tenant) return null

  return {
    userId: tenant.owner_id,
    orgId: tenant.org_id,
  }
}

// ---------------------------------------------------------------------------
// SDK Launch Input (extends CreateLaunchedAgentInput with SDK-specific fields)
// ---------------------------------------------------------------------------

import { z } from 'zod'

export const dynamic = 'force-dynamic'

const SDKLaunchInput = CreateLaunchedAgentInput.extend({
  /** System prompt for the auto-created assistant */
  system_prompt: z.string().max(10000).optional(),
  /** Whether to immediately activate (mint token + create pool). Default: true */
  activate: z.boolean().optional().default(true),
})

// ---------------------------------------------------------------------------
// POST Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!FEATURES.launchpad) {
    return NextResponse.json({ error: 'Launchpad not enabled' }, { status: 404 })
  }

  // Validate API key
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing X-API-Key header' },
      { status: 401 }
    )
  }

  const auth = await validateApiKey(apiKey)
  if (!auth) {
    return NextResponse.json(
      { error: 'Invalid or inactive API key' },
      { status: 401 }
    )
  }

  try {
    const body = await req.json()
    const parsed = SDKLaunchInput.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const input = parsed.data

    // Use the org from API key if not explicitly provided
    const launchInput = {
      ...input,
      org_id: input.org_id ?? auth.orgId,
      creator_id: auth.userId,
    }

    // Launch agent (creates DB record, auto-provisions assistant if needed)
    const { launchAgent } = await import('@/lib/launchpad')
    const result = await launchAgent(launchInput)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Optionally activate (mint + pool + trading)
    let activation: { tokenMint?: string; stakePoolId?: string } = {}
    if (input.activate !== false && result.agent) {
      try {
        const { activateAgent } = await import('@/lib/launchpad')
        const activationResult = await activateAgent(result.agent.id)
        if (!activationResult.error) {
          activation = {
            tokenMint: activationResult.tokenMint,
            stakePoolId: activationResult.stakePoolId,
          }
        }
      } catch {
        // Activation failed — agent stays in draft, caller can retry
      }
    }

    // Re-fetch to get updated status
    const { getLaunchedAgentById } = await import('@/lib/db/launchpad')
    const updatedAgent = result.agent
      ? await getLaunchedAgentById(result.agent.id)
      : result.agent

    return NextResponse.json(
      {
        agent: updatedAgent ?? result.agent,
        activation,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/launchpad/sdk/launch', method: 'POST' },
      tags: { layer: 'api', route: 'sdk-launch' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
