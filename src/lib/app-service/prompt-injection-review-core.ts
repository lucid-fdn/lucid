import type { AppServiceSpec } from '@contracts/app-service'

export type AppServicePromptInjectionFindingSeverity = 'warning' | 'error'

export interface AppServicePromptInjectionFinding {
  severity: AppServicePromptInjectionFindingSeverity
  code: string
  path: string
  message: string
}

export interface AppServicePromptInjectionReview {
  passed: boolean
  findings: AppServicePromptInjectionFinding[]
}

const PROMPT_INJECTION_PATTERNS: Array<{
  code: string
  severity: AppServicePromptInjectionFindingSeverity
  pattern: RegExp
  message: string
}> = [
  {
    code: 'ignore_system_instructions',
    severity: 'error',
    pattern: /\bignor\w*\s+(all\s+)?(previous|prior|system|developer)\s+instructions?\b/i,
    message: 'Tool and integration requests must not ask agents to ignore higher-priority instructions.',
  },
  {
    code: 'bypass_controls',
    severity: 'error',
    pattern: /\bbypass\s+(auth|authorization|permissions?|rls|billing|guardrails?|rate\s*limits?)\b/i,
    message: 'Tool and integration requests must not bypass authorization, billing, guardrails, or rate limits.',
  },
  {
    code: 'secret_exfiltration',
    severity: 'error',
    pattern: /\b(exfiltrat\w*|leak\w*|dump\w*|steal\w*|reveal\w*)\b.{0,80}\b(secret|tokens?|keys?|credential|private\s+memory|system\s+prompt)\b/i,
    message: 'Tool and integration requests must not exfiltrate secrets, tokens, prompts, or private memory.',
  },
  {
    code: 'forbidden_secret_reference',
    severity: 'error',
    pattern: /\b(service[_ -]?role|provider[_ -]?key|oauth[_ -]?token|refresh[_ -]?token|private[_ -]?key)\b/i,
    message: 'Tool and integration requests must not request provider keys, OAuth tokens, or private keys.',
  },
  {
    code: 'internal_route_reference',
    severity: 'error',
    pattern: /\/api\/(internal|app-services|app-runtime\/v1\/operator|mission-control|oauth|provider-keys|billing|orgs|organizations|runtimes)\b/i,
    message: 'Generated app requests must not target Lucid internal, operator, OAuth, provider-key, billing, or org routes.',
  },
  {
    code: 'raw_database_access',
    severity: 'error',
    pattern: /\b(raw\s+sql|select\s+\*\s+from|drop\s+table|update\s+auth\.|service_role)\b/i,
    message: 'Tool and integration requests must not request raw database or service-role access.',
  },
]

function pushStringFinding(
  findings: AppServicePromptInjectionFinding[],
  path: string,
  value: string | undefined,
): void {
  if (!value) return

  for (const rule of PROMPT_INJECTION_PATTERNS) {
    if (!rule.pattern.test(value)) continue
    findings.push({
      severity: rule.severity,
      code: rule.code,
      path,
      message: rule.message,
    })
  }
}

function reviewStringArray(
  findings: AppServicePromptInjectionFinding[],
  path: string,
  values: string[],
): void {
  values.forEach((value, index) => pushStringFinding(findings, `${path}[${index}]`, value))
}

export function reviewPlannerPromptForPromptInjection(prompt: string): AppServicePromptInjectionReview {
  const findings: AppServicePromptInjectionFinding[] = []
  pushStringFinding(findings, 'prompt', prompt)
  return {
    passed: findings.every((finding) => finding.severity !== 'error'),
    findings,
  }
}

export function reviewAppServiceSpecForPromptInjection(spec: AppServiceSpec): AppServicePromptInjectionReview {
  const findings: AppServicePromptInjectionFinding[] = []

  spec.integrations.forEach((integration, index) => {
    const path = `integrations[${index}]`
    pushStringFinding(findings, `${path}.provider`, integration.provider)
    pushStringFinding(findings, `${path}.label`, integration.label)
    pushStringFinding(findings, `${path}.purpose`, integration.purpose)
    reviewStringArray(findings, `${path}.scopes`, integration.scopes)
    reviewStringArray(findings, `${path}.tools`, integration.tools)
  })

  spec.workflows.forEach((workflow, index) => {
    const path = `workflows[${index}]`
    pushStringFinding(findings, `${path}.key`, workflow.key)
    pushStringFinding(findings, `${path}.name`, workflow.name)
    pushStringFinding(findings, `${path}.description`, workflow.description)
    pushStringFinding(findings, `${path}.public_action_key`, workflow.public_action_key)
  })

  spec.secrets.forEach((secret, index) => {
    const path = `secrets[${index}]`
    pushStringFinding(findings, `${path}.key`, secret.key)
    pushStringFinding(findings, `${path}.label`, secret.label)
    pushStringFinding(findings, `${path}.description`, secret.description)
  })

  spec.agents.forEach((agent, index) => {
    const path = `agents[${index}]`
    pushStringFinding(findings, `${path}.key`, agent.key)
    pushStringFinding(findings, `${path}.role`, agent.role)
    pushStringFinding(findings, `${path}.template.system_prompt`, agent.template?.system_prompt)
  })

  return {
    passed: findings.every((finding) => finding.severity !== 'error'),
    findings,
  }
}

export function assertAppServicePromptInjectionReviewPassed(review: AppServicePromptInjectionReview): void {
  if (review.passed) return
  const first = review.findings.find((finding) => finding.severity === 'error') ?? review.findings[0]
  throw new Error(first
    ? `Prompt injection review failed at ${first.path}: ${first.message}`
    : 'Prompt injection review failed.')
}
