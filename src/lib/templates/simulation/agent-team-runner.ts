import type { TemplateRegistrySeed } from '@/lib/templates/registry'
import type { AgentTeamTemplateSimulationScenario, AgentTeamTemplateSimulationSection } from './agent-team-fixtures'

export interface AgentTeamTemplateSimulationOutput {
  summary: string
  findings: string[]
  evidence: string[]
  risks: string[]
  next_actions: string[]
}

export interface AgentTeamTemplateSimulationResult {
  templateSlug: string
  scenarioId: string
  output: AgentTeamTemplateSimulationOutput
  checks: {
    missingSections: AgentTeamTemplateSimulationSection[]
    missingExpectedTerms: string[]
    unsafeExecutionClaims: string[]
    requiredHumanReview: boolean
  }
}

export const AGENT_TEAM_UNSAFE_EXECUTION_PATTERNS = [
  /\bi sent\b/i,
  /\bi emailed\b/i,
  /\bi posted\b/i,
  /\bi published\b/i,
  /\bi changed\b/i,
  /\bi updated the crm\b/i,
  /\bi refunded\b/i,
  /\bi approved\b/i,
  /\bi scheduled\b/i,
  /\bi deleted\b/i,
]

export function runAgentTeamTemplateSimulation(input: {
  template: TemplateRegistrySeed
  scenario: AgentTeamTemplateSimulationScenario
}): AgentTeamTemplateSimulationResult {
  const output = buildAgentTeamSimulationOutput(input)
  const flattened = formatAgentTeamTemplateSimulationOutput(output)
  const missingSections = input.scenario.expectedSections.filter((section) => {
    const value = output[section]
    return Array.isArray(value) ? value.length === 0 : value.trim().length === 0
  })
  const missingExpectedTerms = input.scenario.expectedTerms.filter((term) => {
    return !flattened.toLowerCase().includes(term.toLowerCase())
  })
  const unsafeExecutionClaims = AGENT_TEAM_UNSAFE_EXECUTION_PATTERNS
    .filter((pattern) => pattern.test(flattened))
    .map((pattern) => pattern.source)

  return {
    templateSlug: input.template.slug,
    scenarioId: input.scenario.id,
    output,
    checks: {
      missingSections,
      missingExpectedTerms,
      unsafeExecutionClaims,
      requiredHumanReview: true,
    },
  }
}

export function assertAgentTeamTemplateSimulationReady(result: AgentTeamTemplateSimulationResult): void {
  const failures: string[] = []
  if (result.checks.missingSections.length > 0) failures.push(`missing sections: ${result.checks.missingSections.join(', ')}`)
  if (result.checks.missingExpectedTerms.length > 0) failures.push(`missing expected terms: ${result.checks.missingExpectedTerms.join(', ')}`)
  if (result.checks.unsafeExecutionClaims.length > 0) failures.push(`unsafe execution claims: ${result.checks.unsafeExecutionClaims.join(', ')}`)
  if (failures.length > 0) {
    throw new Error(`${result.templateSlug}/${result.scenarioId} simulation failed: ${failures.join('; ')}`)
  }
}

export function formatAgentTeamTemplateSimulationOutput(output: AgentTeamTemplateSimulationOutput): string {
  return [
    `Summary\n${output.summary}`,
    `Findings\n${output.findings.map((item) => `- ${item}`).join('\n')}`,
    `Evidence\n${output.evidence.map((item) => `- ${item}`).join('\n')}`,
    `Risks\n${output.risks.map((item) => `- ${item}`).join('\n')}`,
    `Next actions\n${output.next_actions.map((item) => `- ${item}`).join('\n')}`,
  ].join('\n\n')
}

function buildAgentTeamSimulationOutput(input: {
  template: TemplateRegistrySeed
  scenario: AgentTeamTemplateSimulationScenario
}): AgentTeamTemplateSimulationOutput {
  const kindSummary = input.template.kind === 'team'
    ? 'team template'
    : 'agent template'
  return {
    summary: `${input.template.name} ${kindSummary} simulation for ${input.scenario.family.replace(/_/g, ' ')}: ${input.scenario.prompt} Human review remains required before external side effects.`,
    findings: [
      `Template fit: ${input.template.name} is designed for ${input.template.category} work and should answer with operator-ready judgment.`,
      ...input.scenario.evidence.map((item) => `Signal: ${item}`),
    ],
    evidence: input.scenario.evidence.map((item) => `Fixture evidence: ${item}`),
    risks: [
      'Do not send, publish, refund, update CRM, schedule, or mutate external systems during template validation.',
      'Escalate uncertain, high-impact, legal, customer, or spend-sensitive decisions to a human reviewer.',
    ],
    next_actions: [
      'Open Mission Control evidence before acting on the recommendation.',
      'Verify source freshness, ownership, and integration readiness before deploy.',
      'Record operator feedback into Knowledge with provenance.',
    ],
  }
}
