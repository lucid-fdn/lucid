import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import type { UIMessage } from 'ai'
import { z } from 'zod'

import { runMissionControlCopilotChat } from '@/lib/ai/services/copilot-service'
import { getServerAuth } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const copilotChatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
  orgId: z.string().min(1),
  workspaceName: z.string().min(1).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const auth = await getServerAuth()
    if (!auth.isAuthenticated || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsedBody = copilotChatRequestSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsedBody.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { messages: rawMessages, orgId, workspaceName } = parsedBody.data

    return runMissionControlCopilotChat({
      orgId,
      rawMessages: rawMessages as UIMessage[],
      workspaceName,
      user: {
        id: auth.userId,
        name: auth.user?.name || null,
        handle: auth.user?.handle || null,
      },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/copilot/chat' },
      tags: { layer: 'api', route: 'mission-control-copilot' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
