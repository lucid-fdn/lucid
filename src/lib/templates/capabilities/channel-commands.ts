import type { LucidPackManifest } from '@contracts/lucid-pack'
import { WEB3_CAPABILITY_TEMPLATES } from './catalog'
import { assertWeb3SimulationReady, runWeb3TemplateSimulation } from './simulation'
import { getWeb3SimulationScenario } from './simulation/web3-fixtures'

export interface CapabilityTemplateChannelCommand {
  command: string
  prompt: string | null
  templateKey: string
  templateName: string
  workflowId: string | null
}

interface CapabilityTemplateCommandDefinition {
  command: string
  template: LucidPackManifest
  workflowId: string | null
}

function readChannelCommandResources(template: LucidPackManifest): CapabilityTemplateCommandDefinition[] {
  return template.resources
    .filter((resource) => resource.kind === 'channel_command')
    .map((resource) => ({
      command: typeof resource.spec.command === 'string' ? resource.spec.command.trim().toLowerCase() : '',
      workflowId: typeof resource.spec.workflow_id === 'string' ? resource.spec.workflow_id : null,
      template,
    }))
    .filter((resource) => resource.command.length > 0)
}

const FIRST_PARTY_CAPABILITY_COMMANDS = WEB3_CAPABILITY_TEMPLATES
  .flatMap(readChannelCommandResources)

const FIRST_PARTY_CAPABILITY_COMMAND_BY_NAME = new Map(
  FIRST_PARTY_CAPABILITY_COMMANDS.map((definition) => [definition.command, definition]),
)

export function listCapabilityTemplateChannelCommands(): CapabilityTemplateChannelCommand[] {
  return FIRST_PARTY_CAPABILITY_COMMANDS.map((definition) => ({
    command: definition.command,
    prompt: null,
    templateKey: definition.template.key,
    templateName: definition.template.name,
    workflowId: definition.workflowId,
  }))
}

export function resolveCapabilityTemplateChannelCommand(
  rawText: string,
): CapabilityTemplateChannelCommand | null {
  const trimmed = rawText.trim()
  if (!trimmed) return null

  const [rawCommand, ...promptParts] = trimmed.split(/\s+/).filter(Boolean)
  const command = rawCommand?.toLowerCase()
  if (!command) return null

  const definition = FIRST_PARTY_CAPABILITY_COMMAND_BY_NAME.get(command)
  if (!definition) return null

  const prompt = promptParts.join(' ').trim()
  return {
    command: definition.command,
    prompt: prompt.length > 0 ? prompt : null,
    templateKey: definition.template.key,
    templateName: definition.template.name,
    workflowId: definition.workflowId,
  }
}

export function isCapabilityTemplateChannelCommand(rawText: string | undefined): boolean {
  return Boolean(rawText && resolveCapabilityTemplateChannelCommand(rawText))
}

export function buildCapabilityTemplateChannelReport(input: {
  command: CapabilityTemplateChannelCommand
  channelLabel: string
}): string {
  const template = WEB3_CAPABILITY_TEMPLATES.find((item) => item.key === input.command.templateKey)
  if (!template) {
    return `${input.channelLabel} template command could not run because the template is no longer registered.`
  }

  const scenario = getWeb3SimulationScenario(template.key)
  const result = runWeb3TemplateSimulation({ manifest: template, scenario })
  assertWeb3SimulationReady(result)

  const prompt = input.command.prompt ?? scenario.prompt
  const lines = [
    `${input.channelLabel} Web3 template readiness check`,
    `Template: ${template.name}`,
    `Command: ${input.command.command}`,
    input.command.workflowId ? `Workflow: ${input.command.workflowId}` : null,
    `Prompt: ${prompt}`,
    'Data mode: deterministic readiness fixture, not live market data.',
    '',
    'Summary',
    result.output.summary,
    '',
    'Findings',
    ...result.output.findings.map((finding) => `- ${finding}`),
    '',
    'Evidence',
    ...result.output.evidence.map((evidence) => `- ${evidence}`),
    '',
    'Risks',
    ...result.output.risks.map((risk) => `- ${risk}`),
    '',
    'Next actions',
    ...result.output.next_actions.map((action) => `- ${action}`),
    '',
    'Safety',
    'Readiness-only output. This is not live market data; live execution requires connected providers, policy gates, and Mission Control approval.',
  ].filter((line): line is string => line !== null)

  return lines.join('\n')
}
