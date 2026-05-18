import 'server-only'

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai'

import {
  getCopilotConfig,
  buildFleetSnapshot,
  serializeFleetContext,
  buildCopilotSystemPrompt,
  createCopilotTools,
} from '@/lib/copilot'
import { getBYOKModel } from '@/lib/ai/byok-provider'
import { getLucidModel } from '@/lib/ai/providers'

import { runInternalTextAgent } from './internal-agent-service'
import { getInternalAgentProfile, resolveInternalAgentBackend } from './internal-agent-profiles'

function extractTextFromUIMessage(message: UIMessage): string {
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('')
      .trim()
  }

  return ''
}

function chunkForStream(text: string): string[] {
  const words = text.split(/(\s+)/).filter(Boolean)
  const chunks: string[] = []
  let buffer = ''

  for (const token of words) {
    buffer += token
    if (buffer.length >= 24 || /\n{2,}$/.test(buffer)) {
      chunks.push(buffer)
      buffer = ''
    }
  }

  if (buffer) {
    chunks.push(buffer)
  }

  return chunks.length > 0 ? chunks : [text]
}

export async function runMissionControlCopilotChat(input: {
  orgId: string
  rawMessages: UIMessage[]
  workspaceName?: string
  user: {
    id: string
    name: string | null
    handle: string | null
  }
}): Promise<Response> {
  const config = getCopilotConfig()
  const profile = getInternalAgentProfile('mission-control-copilot')
  const backend = resolveInternalAgentBackend(profile)
  const snapshot = await buildFleetSnapshot(input.orgId)
  const fleetContext = serializeFleetContext(snapshot)
  const userContext = input.workspaceName
    ? {
        userName: input.user.name || input.user.handle || null,
        userRole: null as string | null,
        workspaceName: input.workspaceName,
      }
    : undefined
  const systemPrompt = buildCopilotSystemPrompt(fleetContext, userContext)

  if (backend === 'worker-agent') {
    const latestUserMessage = [...input.rawMessages]
      .reverse()
      .find((message) => message.role === 'user')
    const prompt = latestUserMessage ? extractTextFromUIMessage(latestUserMessage) : ''
    const history = input.rawMessages
      .slice(0, latestUserMessage ? -1 : input.rawMessages.length)
      .map((message) => ({
        role: (message.role === 'assistant' || message.role === 'system'
          ? message.role
          : 'user') as 'user' | 'assistant' | 'system',
        content: extractTextFromUIMessage(message),
      }))
      .filter((message) => message.content.length > 0)

    const result = await runInternalTextAgent({
      profile: 'mission-control-copilot',
      orgId: input.orgId,
      userId: input.user.id,
      systemPrompt,
      prompt,
      messages: history,
      requestedModelId: config.modelId,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    })

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const id = crypto.randomUUID()
        writer.write({ type: 'text-start', id })
        for (const chunk of chunkForStream(result.text)) {
          writer.write({ type: 'text-delta', id, delta: chunk })
        }
        writer.write({ type: 'text-end', id })
      },
    })

    return createUIMessageStreamResponse({ stream })
  }

  const modelMessages = await convertToModelMessages(input.rawMessages)
  let resolvedModel
  try {
    const byokResult = await getBYOKModel(input.orgId, config.modelId)
    resolvedModel = byokResult.model
  } catch {
    resolvedModel = getLucidModel(config.modelId)
  }

  const tools = createCopilotTools(input.orgId)
  const result = streamText({
    model: resolvedModel,
    system: systemPrompt,
    messages: modelMessages,
    tools,
    toolChoice: 'auto',
    stopWhen: stepCountIs(config.maxSteps),
    temperature: config.temperature,
    maxOutputTokens: config.maxTokens,
  })

  return result.toUIMessageStreamResponse()
}
