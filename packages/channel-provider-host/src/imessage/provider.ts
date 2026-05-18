import { sendMessageIMessage, probeIMessage } from '@lucid/openclaw-runtime'

export interface HostedIMessageProviderConfig {
  controlPlaneUrl: string
  internalServiceSecret: string
  surfaceId: string
  surfaceToken: string
  nodeKey: string
  timeoutMs?: number
  label?: string
  version?: string
  cliPath?: string
  dbPath?: string
  service?: string
  region?: string
  accountId?: string
}

export interface HostedIMessageInboundMessage {
  messageId: string
  chatId: string
  senderId: string
  senderName?: string | null
  text?: string | null
  timestamp?: string | number | null
  service?: string | null
  replyToId?: string | null
  attachments?: Array<{
    kind?: string
    url?: string
    mimeType?: string
    fileName?: string
  }> | null
}

interface ProviderDispatchPayload {
  id: string
  assistant_outbound_event_id: string
  payload?: {
    target?: string
    text?: string
    replyToId?: string | null
  }
}

const DEFAULT_CONTROL_PLANE_TIMEOUT_MS = 15_000

function createHeaders(secret: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Service-Secret': secret,
  }
}

export class HostedIMessageProviderClient {
  constructor(private readonly config: HostedIMessageProviderConfig) {}

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.config.controlPlaneUrl.replace(/\/$/, '')}${path}`
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_CONTROL_PLANE_TIMEOUT_MS
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: createHeaders(this.config.internalServiceSecret),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const message = error instanceof Error && error.name === 'TimeoutError'
        ? `Provider request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : 'Provider request failed'
      throw new Error(message)
    }
    const payload = (await response.json().catch(() => null)) as T | { error?: string } | null
    if (!response.ok) {
      throw new Error(
        payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : `Provider request failed: ${response.status}`,
      )
    }
    return payload as T
  }

  async heartbeat(params?: {
    status?: string
    capabilities?: Record<string, unknown>
    lastError?: string | null
  }) {
    return this.post<{
      ok: boolean
      nodeId: string
      surfaceId: string
      status: string
    }>('/api/internal/imessage/provider-heartbeat', {
      surfaceId: this.config.surfaceId,
      surfaceToken: this.config.surfaceToken,
      nodeKey: this.config.nodeKey,
      label: this.config.label,
      version: this.config.version,
      status: params?.status,
      capabilities: params?.capabilities,
      lastError: params?.lastError ?? null,
    })
  }

  async ingest(message: HostedIMessageInboundMessage) {
    return this.post<{
      ok: boolean
      action?: 'reply' | 'route' | 'noop'
      text?: string | null
    }>('/api/internal/imessage/hosted', {
      surfaceId: this.config.surfaceId,
      surfaceToken: this.config.surfaceToken,
      message,
    })
  }

  async claimDispatch() {
    return this.post<{
      ok: boolean
      nodeId: string
      dispatch: ProviderDispatchPayload | null
    }>('/api/internal/imessage/provider-dispatch', {
      action: 'claim',
      surfaceId: this.config.surfaceId,
      surfaceToken: this.config.surfaceToken,
      nodeKey: this.config.nodeKey,
      label: this.config.label,
      version: this.config.version,
    })
  }

  async ackSuccess(dispatchId: string, externalMessageId?: string | null) {
    return this.post<{ ok: boolean }>('/api/internal/imessage/provider-dispatch', {
      action: 'ack_success',
      surfaceId: this.config.surfaceId,
      surfaceToken: this.config.surfaceToken,
      dispatchId,
      externalMessageId: externalMessageId ?? null,
    })
  }

  async ackFailure(dispatchId: string, error: string, retryable = true) {
    return this.post<{ ok: boolean }>('/api/internal/imessage/provider-dispatch', {
      action: 'ack_failure',
      surfaceId: this.config.surfaceId,
      surfaceToken: this.config.surfaceToken,
      dispatchId,
      retryable,
      error,
    })
  }

  async runProbe() {
    return probeIMessage({
      ...(this.config.cliPath ? { cliPath: this.config.cliPath } : {}),
      ...(this.config.dbPath ? { dbPath: this.config.dbPath } : {}),
      ...(this.config.accountId ? { accountId: this.config.accountId } : {}),
    })
  }

  async sendText(target: string, text: string, replyToId?: string | null) {
    return sendMessageIMessage(target, text, {
      ...(this.config.cliPath ? { cliPath: this.config.cliPath } : {}),
      ...(this.config.dbPath ? { dbPath: this.config.dbPath } : {}),
      ...(this.config.service ? { service: this.config.service } : {}),
      ...(this.config.region ? { region: this.config.region } : {}),
      ...(this.config.accountId ? { accountId: this.config.accountId } : {}),
      ...(replyToId ? { replyToId } : {}),
    })
  }

  async flushNextDispatch(): Promise<boolean> {
    const claim = await this.claimDispatch()
    if (!claim.dispatch?.id || !claim.dispatch.payload?.target || !claim.dispatch.payload?.text) {
      return false
    }

    try {
      const delivered = await this.sendText(
        claim.dispatch.payload.target,
        claim.dispatch.payload.text,
        claim.dispatch.payload.replyToId ?? null,
      )
      await this.ackSuccess(claim.dispatch.id, delivered.messageId ?? null)
      return true
    } catch (error) {
      await this.ackFailure(
        claim.dispatch.id,
        error instanceof Error ? error.message : 'Failed to deliver hosted iMessage dispatch',
      )
      throw error
    }
  }
}
