import type { LucidPackManifest } from '@contracts/lucid-pack'
import type { TemplateCapability } from '@contracts/template-composition'
import { buildCapabilityTemplateInstallPreview } from '@/lib/templates/composition'
import { normalizeCapabilityTemplateComposition } from '@/lib/templates/composition/normalize'
import type { Web3SimulationScenario, Web3SimulationSection } from './web3-fixtures'

export interface Web3SimulationOutput {
  summary: string
  findings: string[]
  evidence: string[]
  risks: string[]
  next_actions: string[]
}

export interface Web3SimulationResult {
  templateKey: string
  scenarioId: string
  output: Web3SimulationOutput
  checks: {
    missingCapabilities: string[]
    missingSections: Web3SimulationSection[]
    missingExpectedTerms: string[]
    unsafeExecutionClaims: string[]
    approvalRequired: boolean
    approvalPolicyPresent: boolean
    routineDisabledByDefault: boolean
    requiredSetupCapabilities: string[]
    optionalSetupCapabilities: string[]
  }
}

export const UNSAFE_EXECUTION_PATTERNS = [
  /\bi executed\b/i,
  /\bi placed\b/i,
  /\bi submitted\b/i,
  /\bi swapped\b/i,
  /\bi transferred\b/i,
  /\bi bought\b/i,
  /\border completed\b/i,
  /\btrade executed\b/i,
  /\bswap executed\b/i,
  /\btransfer executed\b/i,
]

export function runWeb3TemplateSimulation(input: {
  manifest: LucidPackManifest
  scenario: Web3SimulationScenario
}): Web3SimulationResult {
  const composition = normalizeCapabilityTemplateComposition(input.manifest)
  const providedCapabilityKeys = new Set(composition.provides.map((capability) => capability.key))
  const missingCapabilities = input.scenario.requiredCapabilities
    .filter((capability) => !providedCapabilityKeys.has(capability))

  const approvalRequired = composition.provides.some((capability) => {
    return capability.kind === 'web3_trade' || capability.risk === 'medium' || capability.risk === 'high'
  })
  const approvalPolicyPresent = input.manifest.resources.some((resource) => {
    return resource.kind === 'policy'
      && (
        resource.spec.policy_type === 'approval'
        || resource.spec.approval_required === true
        || resource.spec.high_risk_approval === true
      )
  })
  const routineDisabledByDefault = input.manifest.resources
    .filter((resource) => resource.kind === 'routine')
    .every((resource) => resource.spec.disabled_by_default === true)

  const preview = buildCapabilityTemplateInstallPreview({
    packId: `simulation:${input.manifest.key}`,
    manifest: input.manifest,
    existingResources: [],
  })

  const output = buildSimulationOutput({
    manifest: input.manifest,
    scenario: input.scenario,
    capabilities: composition.provides,
    approvalRequired,
    approvalPolicyPresent,
  })
  const flattenedOutput = Object.values(output).flat().join('\n')
  const missingSections = input.scenario.expectedSections.filter((section) => {
    const value = output[section]
    return Array.isArray(value) ? value.length === 0 : value.trim().length === 0
  })
  const missingExpectedTerms = input.scenario.expectedTerms.filter((term) => {
    return !flattenedOutput.toLowerCase().includes(term.toLowerCase())
  })
  const unsafeExecutionClaims = UNSAFE_EXECUTION_PATTERNS
    .filter((pattern) => pattern.test(flattenedOutput))
    .map((pattern) => pattern.source)

  return {
    templateKey: input.manifest.key,
    scenarioId: input.scenario.id,
    output,
    checks: {
      missingCapabilities,
      missingSections,
      missingExpectedTerms,
      unsafeExecutionClaims,
      approvalRequired,
      approvalPolicyPresent,
      routineDisabledByDefault,
      requiredSetupCapabilities: preview.requiredSetup
        .filter((setup) => setup.required)
        .map((setup) => setup.capability),
      optionalSetupCapabilities: preview.requiredSetup
        .filter((setup) => !setup.required)
        .map((setup) => setup.capability),
    },
  }
}

export function formatWeb3SimulationOutput(output: Web3SimulationOutput): string {
  return [
    `Summary\n${output.summary}`,
    `Findings\n${output.findings.map((item) => `- ${item}`).join('\n')}`,
    `Evidence\n${output.evidence.map((item) => `- ${item}`).join('\n')}`,
    `Risks\n${output.risks.map((item) => `- ${item}`).join('\n')}`,
    `Next actions\n${output.next_actions.map((item) => `- ${item}`).join('\n')}`,
  ].join('\n\n')
}

export function assertWeb3SimulationReady(result: Web3SimulationResult): void {
  const failures: string[] = []
  if (result.checks.missingCapabilities.length > 0) {
    failures.push(`missing capabilities: ${result.checks.missingCapabilities.join(', ')}`)
  }
  if (result.checks.missingSections.length > 0) {
    failures.push(`missing sections: ${result.checks.missingSections.join(', ')}`)
  }
  if (result.checks.missingExpectedTerms.length > 0) {
    failures.push(`missing expected terms: ${result.checks.missingExpectedTerms.join(', ')}`)
  }
  if (result.checks.unsafeExecutionClaims.length > 0) {
    failures.push(`unsafe execution claims: ${result.checks.unsafeExecutionClaims.join(', ')}`)
  }
  if (result.checks.approvalRequired && !result.checks.approvalPolicyPresent) {
    failures.push('approval policy missing for trade or automation capability')
  }
  if (!result.checks.routineDisabledByDefault) {
    failures.push('routines must be disabled by default')
  }
  if (failures.length > 0) {
    throw new Error(`${result.templateKey}/${result.scenarioId} simulation failed: ${failures.join('; ')}`)
  }
}

function buildSimulationOutput(input: {
  manifest: LucidPackManifest
  scenario: Web3SimulationScenario
  capabilities: TemplateCapability[]
  approvalRequired: boolean
  approvalPolicyPresent: boolean
}): Web3SimulationOutput {
  const strongestSignal = input.scenario.signals.find((signal) => signal.severity === 'critical')
    ?? input.scenario.signals.find((signal) => signal.severity === 'warning')
    ?? input.scenario.signals[0]
  const capabilityNames = input.capabilities.map((capability) => capability.name).join(', ')
  const riskMode = input.approvalRequired
    ? `Review mode: approval required before automation; ${input.approvalPolicyPresent ? 'policy is present' : 'policy is missing'}.`
    : 'Read-only mode: no execution capability is installed.'

  return {
    summary: `${input.manifest.name} simulation produced an evidence-backed ${input.scenario.title.toLowerCase()} for: ${input.scenario.prompt} ${riskMode}`,
    findings: input.scenario.signals.map((signal) => {
      return `${signal.severity.toUpperCase()}: ${signal.label} - ${signal.value}. Capability context: ${capabilityNames}.`
    }),
    evidence: input.scenario.evidence.map((item) => {
      return `${item.kind} from ${item.source}: ${item.value}`
    }),
    risks: [
      `${strongestSignal?.severity.toUpperCase() ?? 'INFO'} risk context: ${strongestSignal?.value ?? 'No major signal found.'}`,
      input.approvalRequired
        ? 'Automation or execution must stay gated; do not execute, submit, swap, transfer, or place orders without explicit approval.'
        : 'This template is read-only; recommendations must remain research and monitoring actions.',
    ],
    next_actions: [
      input.approvalRequired
        ? 'Request operator review and complete policy, wallet eligibility, and risk checks before enabling automation or execution.'
        : 'Refresh read-only data providers and notify configured channels if the signal persists.',
      'Open Mission Control evidence before acting on this brief.',
      'Record any operator feedback into project knowledge with provenance.',
    ],
  }
}
