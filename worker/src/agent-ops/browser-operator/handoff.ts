export const BROWSER_OPERATOR_HANDOFF_STATES = [
  'auth_required',
  'captcha_required',
  'mfa_required',
  'destructive_confirmation_required',
  'human_judgment_required',
] as const

export type BrowserOperatorHandoffState = (typeof BROWSER_OPERATOR_HANDOFF_STATES)[number]

export interface BrowserOperatorHandoff {
  state: BrowserOperatorHandoffState
  message: string
  reason: string
  resumable: boolean
}

const HANDOFF_PATTERNS: Array<{
  state: BrowserOperatorHandoffState
  pattern: RegExp
  reason: string
  message: string
}> = [
  {
    state: 'captcha_required',
    pattern: /\b(captcha|recaptcha|hcaptcha|verify you are human)\b/i,
    reason: 'captcha_detected',
    message: 'Browser Operator reached a CAPTCHA or bot check and needs a human handoff.',
  },
  {
    state: 'mfa_required',
    pattern: /\b(mfa|2fa|two[-\s]?factor|verification code|one-time code|authenticator app)\b/i,
    reason: 'mfa_detected',
    message: 'Browser Operator reached MFA and needs a human handoff.',
  },
  {
    state: 'auth_required',
    pattern: /\b(sign in|log in|login required|password|sso|single sign-on|continue with google)\b/i,
    reason: 'auth_detected',
    message: 'Browser Operator reached an authentication boundary and needs a human handoff.',
  },
  {
    state: 'destructive_confirmation_required',
    pattern: /\b(delete|remove|cancel subscription|transfer funds|submit payment|irreversible|permanently)\b/i,
    reason: 'destructive_confirmation_detected',
    message: 'Browser Operator reached a destructive or payment confirmation and needs a human handoff.',
  },
]

export function detectBrowserOperatorHandoff(input: {
  content: unknown
  requestedAction?: string | null
}): BrowserOperatorHandoff | null {
  const action = input.requestedAction?.trim().toLowerCase() ?? ''
  if (isDestructiveAction(action)) {
    return {
      state: 'destructive_confirmation_required',
      reason: 'destructive_action_requested',
      message: 'Browser Operator cannot perform destructive browser actions without a human handoff.',
      resumable: true,
    }
  }

  const text = stringifyForScan(input.content)
  for (const item of HANDOFF_PATTERNS) {
    if (!item.pattern.test(text)) continue
    return {
      state: item.state,
      reason: item.reason,
      message: item.message,
      resumable: true,
    }
  }

  return null
}

export function buildBrowserOperatorHandoffEvent(input: {
  handoff: BrowserOperatorHandoff
  sessionId?: string | null
  currentUrl?: string | null
}): Record<string, unknown> {
  return {
    event_type: 'handoff_required',
    severity: 'warn',
    layer: 'browser_action',
    browser_session_id: input.sessionId ?? null,
    current_url: input.currentUrl ?? null,
    handoff_state: input.handoff.state,
    details: {
      reason: input.handoff.reason,
      resumable: input.handoff.resumable,
      message: input.handoff.message,
    },
  }
}

export function shouldPauseForBrowserOperatorHandoff(value: BrowserOperatorHandoff | null): boolean {
  return Boolean(value)
}

function isDestructiveAction(action: string): boolean {
  return [
    'delete',
    'remove',
    'destroy',
    'submit_payment',
    'pay',
    'purchase',
    'transfer',
    'confirm',
    'approve',
    'send',
  ].includes(action)
}

function stringifyForScan(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
