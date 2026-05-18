import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getAssistant,
  updateAssistant,
  deleteAssistant,
  isUserOrgMember,
} from '@/lib/db'
import { prepareAssistantDeletion } from '@/lib/db/assistant-lifecycle'
import { ErrorService } from '@/lib/errors/error-service'
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log'
import { withCSRF } from '@/lib/auth/csrf'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  system_prompt: z.string().max(10000).optional(),
  soul_content: z.string().max(10000).nullable().optional(),
  lucid_model: z.string().optional(),
  engine: z.string().optional(),
  runtime_flavor: z.enum(['shared', 'c1_managed', 'c2a_autonomous']).nullable().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(128000).optional(),
  memory_enabled: z.boolean().optional(),
  memory_window_size: z.number().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
  policy_config: z.record(z.string(), z.unknown()).nullable().optional(),
  telegram_voice_mode: z.enum(['off', 'auto', 'always']).optional(),
  telegram_voice_id: z.string().max(100).nullable().optional(),
  telegram_voice_instructions: z.string().max(1000).nullable().optional(),
})

export const PATCH = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = (await (ctx as { params: Promise<{ id: string }> }).params)
    const body = await req.json()
    const validated = updateSchema.parse(body)

    // Verify assistant exists and user has org access
    const existing = await getAssistant(id)
    if (!existing) {
      return NextResponse.json(
        { error: 'Assistant not found' },
        { status: 404 },
      )
    }

    if (existing.org_id) {
      const isMember = await isUserOrgMember(userId, existing.org_id)
      if (!isMember) {
        return NextResponse.json(
          { error: 'You do not have access to this assistant' },
          { status: 403 },
        )
      }
    }

    const updated = await updateAssistant(
      id,
      {
        name: validated.name,
        description: validated.description,
        system_prompt: validated.system_prompt,
        soul_content: validated.soul_content,
        lucid_model: validated.lucid_model,
        engine: validated.engine,
        runtime_flavor: validated.runtime_flavor,
        temperature: validated.temperature,
        max_tokens: validated.max_tokens,
        memory_enabled: validated.memory_enabled,
        memory_window_size: validated.memory_window_size,
        is_active: validated.is_active,
        policy_config: validated.policy_config,
        telegram_voice_mode: validated.telegram_voice_mode,
        telegram_voice_id: validated.telegram_voice_id,
        telegram_voice_instructions: validated.telegram_voice_instructions,
      },
      // TOCTOU guard: scope the UPDATE by the org we just verified
      // membership on, so a concurrent org reassignment can't turn this
      // into a cross-tenant write.
      existing.org_id ?? undefined,
    )

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistants' },
    })
    return NextResponse.json(
      { error: 'Failed to update assistant' },
      { status: 500 }
    )
  }
})

export const DELETE = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = (await (ctx as { params: Promise<{ id: string }> }).params)

    // Verify assistant exists and user has org access
    const existing = await getAssistant(id)
    if (!existing) {
      return NextResponse.json(
        { error: 'Assistant not found' },
        { status: 404 },
      )
    }

    if (existing.org_id) {
      const isMember = await isUserOrgMember(userId, existing.org_id)
      if (!isMember) {
        return NextResponse.json(
          { error: 'You do not have access to this assistant' },
          { status: 403 },
        )
      }
    }

    // Pre-delete: clean up infrastructure that can't CASCADE (runtimes, approvals)
    await prepareAssistantDeletion({
      assistantId: id,
      orgId: existing.org_id,
      runtimeId: existing.runtime_id,
    })

    // Hard delete — CASCADE handles all child rows
    await deleteAssistant(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    const errCode = (error as { code?: string })?.code
    const { id } = (await (ctx as { params: Promise<{ id: string }> }).params)
    console.error('[api:assistants:delete] failed', {
      assistantId: maskIdentifier(id),
      code: errCode ?? null,
      error: summarizeError(error),
    })
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        endpoint: '/api/assistants/[id]',
        method: 'DELETE',
        assistantId: maskIdentifier(id),
        code: errCode ?? null,
      },
      tags: { layer: 'api', route: 'assistants' },
    })
    return NextResponse.json(
      { error: 'Failed to delete assistant', code: errCode },
      { status: 500 }
    )
  }
})
