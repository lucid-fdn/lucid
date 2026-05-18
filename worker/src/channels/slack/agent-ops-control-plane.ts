import crypto from 'node:crypto'

export interface SlackAgentOpsControlPlaneBinding {
  assistant_id: string
  org_id?: string | null
  assistant_name?: string | null
}

export interface SlackAgentOpsControlPlaneLaunchInput {
  surfaceId: string
  externalUserId?: string | null
  rawCommandArg: string
  binding: SlackAgentOpsControlPlaneBinding
}

export interface SlackAgentOpsControlPlaneOptions {
  controlPlaneUrl?: string | null
  workerTriggerSecret?: string | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
  requestId?: string
  timestampMs?: number
}

interface AgentOpsControlPlaneResponse {
  ok?: boolean
  report?: string
  reportChunks?: string[]
  error?: string
}

export function buildSlackAgentOpsControlPlaneAuthHeaders(input: {
  body: string
  secret: string
  requestId?: string
  timestampMs?: number
}): Record<string, string> {
  const requestId = input.requestId ?? crypto.randomUUID()
  const timestamp = String(input.timestampMs ?? Date.now())
  const signature = crypto
    .createHmac('sha256', input.secret)
    .update(`${requestId}:${timestamp}:${input.body}`)
    .digest('hex')

  return {
    'x-lucid-request-id': requestId,
    'x-lucid-timestamp': timestamp,
    'x-lucid-signature': signature,
  }
}

export async function launchSlackAgentOpsFromControlPlane(
  input: SlackAgentOpsControlPlaneLaunchInput,
  options: SlackAgentOpsControlPlaneOptions = {},
): Promise<string> {
  const messages = await launchSlackAgentOpsMessagesFromControlPlane(input, options)
  return messages.join('\n')
}

export async function launchSlackAgentOpsMessagesFromControlPlane(
  input: SlackAgentOpsControlPlaneLaunchInput,
  options: SlackAgentOpsControlPlaneOptions = {},
): Promise<string[]> {
  const controlPlaneUrl = normalizeControlPlaneUrl(
    options.controlPlaneUrl ?? process.env.LUCID_CONTROL_PLANE_URL,
  )
  const workerTriggerSecret = options.workerTriggerSecret ?? process.env.WORKER_TRIGGER_SECRET
  if (!controlPlaneUrl || !workerTriggerSecret) {
    return [[
      'Slack Agent Ops launch is not configured on this worker yet.',
      'Set LUCID_CONTROL_PLANE_URL and WORKER_TRIGGER_SECRET so Slack can call the shared control-plane launcher.',
    ].join('\n')]
  }

  const body = JSON.stringify({
    channelType: 'slack',
    channelLabel: 'Slack',
    surfaceId: input.surfaceId,
    externalUserId: input.externalUserId ?? null,
    rawCommandArg: input.rawCommandArg,
    binding: input.binding,
  })
  const timeoutMs = options.timeoutMs ?? 10_000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${controlPlaneUrl}/api/internal/agent-ops/channel-launch`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...buildSlackAgentOpsControlPlaneAuthHeaders({
            body,
            secret: workerTriggerSecret,
            requestId: options.requestId,
            timestampMs: options.timestampMs,
          }),
        },
        body,
        signal: controller.signal,
      },
    )
    const payload = await readAgentOpsControlPlaneResponse(response)
    if (Array.isArray(payload.reportChunks) && payload.reportChunks.length > 0) {
      const chunks = payload.reportChunks.filter((chunk) => typeof chunk === 'string' && chunk.trim().length > 0)
      if (chunks.length > 0) return chunks
    }
    if (typeof payload.report === 'string' && payload.report.trim().length > 0) {
      return [payload.report]
    }
    if (!response.ok) {
      return [payload.error ?? 'Slack Agent Ops launch failed. Try again in a moment.']
    }
    return ['Slack Agent Ops run started.']
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return ['Slack Agent Ops launch timed out while contacting the control plane. Try again in a moment.']
    }
    return ['Slack Agent Ops launch failed while contacting the control plane. Try again in a moment.']
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeControlPlaneUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

async function readAgentOpsControlPlaneResponse(
  response: Response,
): Promise<AgentOpsControlPlaneResponse> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return { error: response.ok ? undefined : `Control plane returned ${response.status}` }
  }

  try {
    const payload = await response.json()
    return payload && typeof payload === 'object' ? payload as AgentOpsControlPlaneResponse : {}
  } catch {
    return { error: response.ok ? undefined : `Control plane returned ${response.status}` }
  }
}
