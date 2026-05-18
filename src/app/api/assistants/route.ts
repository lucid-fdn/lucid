import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  createAssistant,
  ensureDefaultEnvironmentForProject,
  getDefaultEnvironmentForProject,
  getProjectByIdForWorkspace,
  getWorkspace,
  isUserOrgMember,
} from '@/lib/db'
import { getRuntimeById } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'
import { z } from 'zod'
import { ensureAssistantPassport } from '@/lib/ai/passports'
import { agentEngineSchema } from '@/lib/mission-control/schemas'
import {
  getEngineDefinition,
  isEngineAvailable,
} from '@/lib/engines/registry'
import type { AgentEngine } from '@/lib/engines/types'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  system_prompt: z.string().max(10000).optional(),
  lucid_model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(128000).optional(),
  memory_enabled: z.boolean().optional(),
  orgId: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  runtimeId: z.string().uuid().optional(),
  engine: agentEngineSchema.optional(),
})

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const validated = createSchema.parse(body)
    const engine = validated.engine as AgentEngine | undefined

    if (engine && !isEngineAvailable(engine)) {
      const definition = getEngineDefinition(engine)
      return NextResponse.json(
        { error: `${definition.label} is not available yet` },
        { status: 400 },
      )
    }

    if (!validated.orgId) {
      return NextResponse.json(
        { error: 'orgId is required' },
        { status: 400 },
      )
    }

    const isMember = await isUserOrgMember(userId, validated.orgId)
    if (!isMember) {
      return NextResponse.json(
        { error: 'You do not have access to this organization' },
        { status: 403 },
      )
    }

    const requestedProjectId = validated.project_id ?? validated.projectId
    const workspace = await getWorkspace(userId, validated.orgId)
    const project = requestedProjectId
      ? await getProjectByIdForWorkspace(validated.orgId, requestedProjectId)
      : workspace?.project
    const env = project?.id
      ? requestedProjectId
        ? await ensureDefaultEnvironmentForProject(project.id, userId)
        : await getDefaultEnvironmentForProject(project.id)
      : null

    if (!project?.id || !env?.id) {
      return NextResponse.json(
        { error: 'Workspace does not have a project yet' },
        { status: 400 },
      )
    }

    if (engine === 'hermes' && validated.runtimeId) {
      const runtime = await getRuntimeById(validated.runtimeId, validated.orgId)
      if (!runtime) {
        return NextResponse.json(
          { error: 'Dedicated runtime not found' },
          { status: 404 },
        )
      }

      if (runtime.engine !== 'hermes') {
        return NextResponse.json(
          { error: 'Hermes assistants require a Hermes runtime' },
          { status: 400 },
        )
      }
    }

    const assistant = await createAssistant({
      orgId: validated.orgId,
      projectId: project.id,
      envId: env.id,
      name: validated.name,
      systemPrompt: validated.system_prompt,
      lucidModel: validated.lucid_model,
      temperature: validated.temperature,
      maxTokens: validated.max_tokens,
      memoryEnabled: validated.memory_enabled,
      runtimeId: validated.runtimeId,
      engine,
    })

    // Provision L2 passport (non-blocking)
    ensureAssistantPassport({
      assistantId: assistant.id,
      existingPassportId: null,
      name: validated.name,
    }).catch(() => {})

    return NextResponse.json(assistant, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants', method: 'POST' },
      tags: { layer: 'api', route: 'assistants' },
    })
    return NextResponse.json(
      { error: 'Failed to create assistant' },
      { status: 500 },
    )
  }
})
