import 'server-only'

import crypto from 'node:crypto'

import type {
  NativeActionDispatchInput,
  NativeActionDispatchResponse,
  NativeApproval,
  NativeApprovalDetailResponse,
  NativeApprovalDecisionInput,
  NativeApprovalDecisionResponse,
  NativeApprovalExplainResponse,
  NativeInboxResponse,
  NativeRun,
  NativeRunControlInput,
  NativeRunControlResponse,
  NativeRunDetailResponse,
  NativeRunTimelineEvent,
  NativeSessionHandoffInput,
  NativeSessionHandoffResponse,
  NativeSessionRefreshInput,
  NativeSessionRefreshResponse,
  NativeSessionRevokeInput,
  NativeShareInput,
  NativeShareResponse,
  NativeVoiceCommandInput,
  NativeVoiceCommandResponse,
} from '@lucid/app-client'

type NativeUserState = {
  approvals: NativeApproval[]
  runs: NativeRun[]
  receipts: Array<NativeActionDispatchResponse & { createdAt: string; userId: string }>
}

const stateByUserId = new Map<string, NativeUserState>()
const refreshTokens = new Map<string, { userId: string; deviceId: string; revoked: boolean }>()

function nowIso(): string {
  return new Date().toISOString()
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function getState(userId: string): NativeUserState {
  const existing = stateByUserId.get(userId)
  if (existing) return existing

  const createdAt = nowIso()
  const seeded: NativeUserState = {
    approvals: [
      {
        id: 'approval_checkout_policy',
        title: 'Approve checkout Browser QA mutation',
        summary: 'Browser QA found a checkout regression and wants to open a bug run with captured evidence.',
        agentName: 'Browser QA',
        risk: 'confirmation-required',
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        createdAt,
        deepLink: 'lucid://workspace/default/approvals/approval_checkout_policy',
      },
    ],
    runs: [
      {
        id: 'run_checkout_qa',
        title: 'Checkout QA sweep',
        agentName: 'Browser QA',
        status: 'running',
        progress: 72,
        needsApproval: true,
        updatedAt: createdAt,
        deepLink: 'lucid://workspace/default/runs/run_checkout_qa',
      },
      {
        id: 'run_inbox_triage',
        title: 'Inbox triage',
        agentName: 'Ops Copilot',
        status: 'paused',
        progress: 34,
        needsApproval: false,
        updatedAt: createdAt,
        deepLink: 'lucid://workspace/default/runs/run_inbox_triage',
      },
    ],
    receipts: [],
  }
  stateByUserId.set(userId, seeded)
  return seeded
}

export function createNativeSessionHandoff(
  input: NativeSessionHandoffInput,
  origin: string,
  userId: string | null,
): NativeSessionHandoffResponse {
  const handoffId = id('handoff')
  const authorizeUrl = new URL('/login', origin)
  authorizeUrl.searchParams.set('native_handoff', handoffId)
  authorizeUrl.searchParams.set('provider', input.provider ?? 'privy')
  authorizeUrl.searchParams.set('app_kind', input.appKind)
  authorizeUrl.searchParams.set('platform', input.platform)
  authorizeUrl.searchParams.set('install_id', input.installId)
  if (input.returnUrl) authorizeUrl.searchParams.set('return_url', input.returnUrl)

  return {
    handoffId,
    provider: input.provider ?? 'privy',
    status: userId ? 'completed' : 'pending',
    authorizeUrl: authorizeUrl.toString(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  }
}

export function refreshNativeSession(userId: string, input: NativeSessionRefreshInput): NativeSessionRefreshResponse {
  const existing = refreshTokens.get(input.refreshToken)
  if (existing && (existing.revoked || existing.userId !== userId || existing.deviceId !== input.deviceId)) {
    throw new Error('Invalid native refresh token.')
  }

  const refreshToken = id('native_refresh')
  refreshTokens.set(refreshToken, {
    userId,
    deviceId: input.deviceId,
    revoked: false,
  })

  return {
    accessToken: id('native_access'),
    refreshToken,
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    deviceId: input.deviceId,
  }
}

export function revokeNativeSession(userId: string, input: NativeSessionRevokeInput): void {
  if (input.refreshToken) {
    const session = refreshTokens.get(input.refreshToken)
    if (session?.userId === userId) session.revoked = true
  }
}

export function listNativeInbox(userId: string): NativeInboxResponse {
  const state = getState(userId)
  return {
    approvals: state.approvals.filter((approval) => approval.status === 'pending'),
    runs: state.runs.filter((run) => run.needsApproval || run.status === 'blocked'),
  }
}

export function listNativeRuns(userId: string): { runs: NativeRun[] } {
  return { runs: getState(userId).runs }
}

export function getNativeApprovalDetail(userId: string, approvalId: string): NativeApprovalDetailResponse {
  const approval = getState(userId).approvals.find((item) => item.id === approvalId)
  if (!approval) throw new Error('Native approval not found.')

  const recommendedDecision = approval.risk === 'privileged' ? 'review' : 'approve'
  return {
    approval,
    explanation: `${approval.agentName ?? 'An agent'} is requesting permission because: ${approval.summary}`,
    recommendedDecision,
    policyChecks: [
      {
        label: 'User confirmation',
        status: approval.status === 'pending' ? 'warn' : 'pass',
        detail: approval.status === 'pending' ? 'Waiting for your explicit approval or denial.' : `Decision recorded as ${approval.status}.`,
      },
      {
        label: 'Risk tier',
        status: approval.risk === 'privileged' ? 'warn' : 'pass',
        detail:
          approval.risk === 'privileged'
            ? 'This action can affect sensitive data, spend, or runtime state.'
            : 'This action is limited to the current run and requires confirmation.',
      },
      {
        label: 'Expiry window',
        status: approval.expiresAt && new Date(approval.expiresAt).getTime() < Date.now() ? 'fail' : 'pass',
        detail: approval.expiresAt ? `Approval expires at ${approval.expiresAt}.` : 'No expiry is attached to this approval.',
      },
    ],
  }
}

export function getNativeRunDetail(userId: string, runId: string): NativeRunDetailResponse {
  const state = getState(userId)
  const run = state.runs.find((item) => item.id === runId)
  if (!run) throw new Error('Native run not found.')

  const timeline: NativeRunTimelineEvent[] = [
    {
      id: `${run.id}:created`,
      at: run.updatedAt,
      title: 'Run registered',
      body: `${run.agentName ?? 'Agent'} added this run to the native control plane.`,
      actor: run.agentName,
      level: 'info',
    },
    {
      id: `${run.id}:status`,
      at: run.updatedAt,
      title: `Status: ${run.status}`,
      body:
        typeof run.progress === 'number'
          ? `Current progress is ${run.progress}%.`
          : 'The agent has not reported progress yet.',
      actor: run.agentName,
      level: levelForRunStatus(run.status),
    },
  ]

  if (run.needsApproval) {
    timeline.push({
      id: `${run.id}:approval`,
      at: run.updatedAt,
      title: 'Needs approval',
      body: 'This run is waiting on a human decision before it can continue.',
      actor: 'Approval Wallet',
      level: 'warning',
    })
  }

  for (const receipt of state.receipts.filter((item) => item.actionId.includes(run.id))) {
    timeline.push({
      id: receipt.receiptId ?? `${run.id}:${receipt.createdAt}`,
      at: receipt.createdAt,
      title: `Native action ${receipt.status}`,
      body: receipt.message,
      actor: 'Native app',
      level: receipt.status === 'rejected' ? 'error' : receipt.status === 'completed' ? 'success' : 'info',
    })
  }

  return {
    run,
    timeline: timeline.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()),
  }
}

export function explainNativeApproval(userId: string, approvalId: string): NativeApprovalExplainResponse {
  const detail = getNativeApprovalDetail(userId, approvalId)

  return {
    approvalId,
    explanation: detail.explanation,
    risk: detail.approval.risk,
    recommendedDecision: detail.recommendedDecision,
  }
}

export function decideNativeApproval(
  userId: string,
  approvalId: string,
  input: NativeApprovalDecisionInput,
): NativeApprovalDecisionResponse {
  const state = getState(userId)
  const approval = state.approvals.find((item) => item.id === approvalId)
  if (!approval) throw new Error('Native approval not found.')

  approval.status = input.decision === 'approve' ? 'approved' : 'denied'
  const receipt = recordNativeActionReceipt(userId, {
    featureId: 'approvalWallet',
    actionId: `${input.decision}:${approvalId}`,
    deviceId: input.deviceId,
    idempotencyKey: `${approvalId}:${input.decision}`,
    payload: { reason: input.reason ?? null },
    confirmation: input.confirmation,
  })

  return { approval, receipt }
}

export function controlNativeRun(userId: string, runId: string, input: NativeRunControlInput): NativeRunControlResponse {
  const state = getState(userId)
  const run = state.runs.find((item) => item.id === runId)
  if (!run) throw new Error('Native run not found.')

  if (input.action === 'pause') run.status = 'paused'
  if (input.action === 'resume') run.status = 'running'
  if (input.action === 'cancel') run.status = 'cancelled'
  if (input.action === 'escalate') {
    run.status = 'blocked'
    run.needsApproval = true
  }
  run.updatedAt = nowIso()

  const receipt = recordNativeActionReceipt(userId, {
    featureId: 'liveRunControl',
    actionId: `${input.action}:${runId}`,
    deviceId: input.deviceId,
    idempotencyKey: `${runId}:${input.action}:${input.reason ?? ''}`,
    payload: { reason: input.reason ?? null },
    confirmation: input.confirmation,
  })

  return { run, receipt }
}

export function createNativeVoiceCommand(userId: string, input: NativeVoiceCommandInput): NativeVoiceCommandResponse {
  const transcript = input.transcript?.trim() || 'Audio command received.'
  const lower = transcript.toLowerCase()
  const risky = /approve|deny|pause|resume|cancel|escalate|delete|spend|buy|send/.test(lower)

  return {
    commandId: id('voice_command'),
    interpretedCommand: transcript,
    responseText: risky
      ? 'I understood the command. Review the interpreted action before I execute it.'
      : 'I understood the command and added it to Lucid.',
    requiresConfirmation: risky,
    confirmation: risky
      ? {
          actionId: lower.includes('pause') ? 'pause-runs' : 'native-agent-command',
          risk: lower.includes('delete') || lower.includes('spend') || lower.includes('buy') ? 'privileged' : 'confirmation-required',
          prompt: transcript,
        }
      : undefined,
  }
}

export function shareToLucid(userId: string, input: NativeShareInput): NativeShareResponse {
  const itemId = id('share')
  const state = getState(userId)
  const title = titleForShare(input.intent, input.kind)

  if (input.intent === 'bug-report' || input.intent === 'browser-qa' || input.intent === 'investigate') {
    state.runs.unshift({
      id: itemId,
      title,
      agentName: input.intent === 'browser-qa' ? 'Browser QA' : 'Ops Copilot',
      status: 'queued',
      progress: 0,
      needsApproval: false,
      updatedAt: nowIso(),
      deepLink: `lucid://workspace/default/runs/${itemId}`,
    })
  }

  recordNativeActionReceipt(userId, {
    featureId: 'commandCapture',
    actionId: `share:${input.intent}`,
    deviceId: input.deviceId,
    idempotencyKey: `${input.intent}:${crypto.createHash('sha256').update(input.content).digest('hex')}`,
    payload: {
      kind: input.kind,
      fileName: input.fileName ?? null,
      mimeType: input.mimeType ?? null,
    },
  })

  return {
    itemId,
    status: 'queued',
    title,
    deepLink: `lucid://workspace/default/runs/${itemId}`,
  }
}

export function recordNativeActionReceipt(
  userId: string,
  input: NativeActionDispatchInput,
): NativeActionDispatchResponse {
  const receipt: NativeActionDispatchResponse = {
    actionId: input.actionId,
    status: input.confirmation || input.featureId === 'commandCapture' ? 'queued' : 'requires-confirmation',
    receiptId: id('native_receipt'),
    message: input.confirmation
      ? 'Native action accepted with confirmation receipt.'
      : 'Native action recorded and awaiting confirmation if required.',
  }
  getState(userId).receipts.push({ ...receipt, userId, createdAt: nowIso() })
  return receipt
}

function titleForShare(intent: NativeShareInput['intent'], kind: NativeShareInput['kind']): string {
  if (intent === 'browser-qa') return `Run Browser QA from shared ${kind}`
  if (intent === 'bug-report') return `Create bug report from shared ${kind}`
  if (intent === 'investigate') return `Investigate shared ${kind}`
  return `Remember shared ${kind}`
}

function levelForRunStatus(status: NativeRun['status']): NativeRunTimelineEvent['level'] {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'error'
  if (status === 'blocked' || status === 'paused') return 'warning'
  return 'info'
}
