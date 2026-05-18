import type { Locator } from 'playwright'

export type BrowserGatewayActionRisk = 'read_only' | 'low' | 'medium' | 'high'

const READ_ONLY_ACTIONS = new Set([
  'open',
  'navigate',
  'observe',
  'snapshot',
  'screenshot',
  'summarize',
  'inspect_console',
  'inspect_network',
  'wait',
  'wait_for_selector',
])

const LOW_RISK_ACTIONS = new Set([
  'click',
  'hover',
  'press',
  'type',
  'select',
  'check',
  'uncheck',
  'scroll',
  'search',
  'filter',
  'paginate',
])

const MEDIUM_RISK_ACTIONS = new Set([
  'stagehand',
  'browser_use',
  'extract',
  'fill_form',
  'add_to_cart',
  'draft_message',
  'upload_file',
  'download_file',
])

const SENSITIVE_FIELD_PATTERN =
  /password|passcode|otp|one[-\s]?time|totp|2fa|mfa|cvv|cvc|cc[-_\s]?(number|name|exp|csc)|card|credit|debit|iban|routing|account number|ssn|social security|secret|token|api[-_\s]?key/i

export function normalizeActionKind(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, '_')
}

export function classifyGatewayActionRisk(kind: string): BrowserGatewayActionRisk {
  if (READ_ONLY_ACTIONS.has(kind)) return 'read_only'
  if (MEDIUM_RISK_ACTIONS.has(kind)) return 'medium'
  if (LOW_RISK_ACTIONS.has(kind)) return 'low'
  return 'high'
}

export function requiredActionSelector(value: string | undefined, kind: string): string {
  if (value?.trim()) return value.trim()
  throw new Error(`Browser action ${kind} requires selector`)
}

export async function assertLocatorNotSensitive(
  locator: Locator,
  selector: string,
): Promise<void> {
  if (isSensitiveInputSelector(selector)) {
    throw new Error('Sensitive auth/payment fields require secure human takeover')
  }

  const sensitive = await locator.evaluate((element) => {
    const sensitiveFieldPattern =
      /password|passcode|otp|one[-\s]?time|totp|2fa|mfa|cvv|cvc|cc[-_\s]?(number|name|exp|csc)|card|credit|debit|iban|routing|account number|ssn|social security|secret|token|api[-_\s]?key/i
    const attributes = [
      'type',
      'name',
      'id',
      'placeholder',
      'aria-label',
      'autocomplete',
      'inputmode',
      'data-testid',
      'data-test',
    ]
      .map((attribute) => element.getAttribute(attribute) ?? '')
      .join(' ')
    const ownerDocument = (element as typeof element & {
      ownerDocument?: { querySelectorAll: (selector: string) => unknown[] }
    }).ownerDocument
    const labels = Array.from(ownerDocument?.querySelectorAll('label') ?? [])
      .filter((label) => {
        const labelElement = label as { getAttribute: (name: string) => string | null; textContent?: string | null }
        const htmlFor = labelElement.getAttribute('for')
        return htmlFor && element.id && htmlFor === element.id
      })
      .map((label) => (label as { textContent?: string | null }).textContent ?? '')
      .join(' ')
    const nearbyText = [
      element.parentElement?.textContent ?? '',
      element.closest('fieldset')?.textContent ?? '',
    ].join(' ')
    const haystack = `${attributes} ${labels} ${nearbyText}`.slice(0, 4000)
    return sensitiveFieldPattern.test(haystack)
  }).catch((error) => {
    if (error instanceof Error && /strict mode violation|Timeout|waiting for locator/i.test(error.message)) {
      throw error
    }
    return false
  })

  if (sensitive) {
    throw new Error('Sensitive auth/payment fields require secure human takeover')
  }
}

function isSensitiveInputSelector(selector: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(selector)
}
