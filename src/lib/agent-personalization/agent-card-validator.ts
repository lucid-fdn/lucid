import type { AgentCard, LucidCardValidationIssue, LucidCardValidationReport } from '@contracts/lucid-card'
import { getAgentCardPromptChars } from './agent-card-renderer'

export function validateAgentCard(card: AgentCard): LucidCardValidationReport {
  const issues: LucidCardValidationIssue[] = []
  const promptChars = getAgentCardPromptChars(card)

  if (!card.profile.name.trim()) {
    issues.push({ severity: 'blocking', code: 'profile.name.required', path: 'profile.name', message: 'Agent Card profile name is required.' })
  }
  if (promptChars > 32_000) {
    issues.push({ severity: 'blocking', code: 'prompt.too_large', path: 'prompt', message: 'Agent Card prompt sections exceed the 32k character safety budget.' })
  } else if (promptChars > 24_000) {
    issues.push({ severity: 'warning', code: 'prompt.near_budget', path: 'prompt', message: 'Agent Card prompt sections are approaching the runtime prompt budget.' })
  }
  if (card.guardrails.never.length === 0) {
    issues.push({ severity: 'warning', code: 'guardrails.never.empty', path: 'guardrails.never', message: 'Add at least one negative guardrail for safer runtime behavior.' })
  }
  if (card.examples.message_examples.length === 0) {
    issues.push({ severity: 'info', code: 'examples.empty', path: 'examples.message_examples', message: 'Conversation examples improve voice consistency.' })
  }

  return {
    status: issues.some((issue) => issue.severity === 'blocking') ? 'fail' : issues.some((issue) => issue.severity === 'warning') ? 'warning' : 'pass',
    issues,
    metrics: {
      prompt_chars: promptChars,
      examples: card.examples.message_examples.length,
      knowledge_refs: card.knowledge.source_refs.length,
    },
  }
}
