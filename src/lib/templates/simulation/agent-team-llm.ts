import type { TemplateRegistrySeed } from '@/lib/templates/registry'
import { resolveLlmLiveSimulationConfigs, type LlmLiveSimulationConfig } from '@/lib/templates/capabilities/simulation/llm-live'
import type { AgentTeamTemplateSimulationScenario } from './agent-team-fixtures'

export interface AgentTeamLlmSimulationResult {
  answerText: string
  latencyMs: number
  providerLabel: string
  model: string
}

export { resolveLlmLiveSimulationConfigs }
export type { LlmLiveSimulationConfig }

export async function runAgentTeamLlmTemplateSimulation(input: {
  template: TemplateRegistrySeed
  scenario: AgentTeamTemplateSimulationScenario
  config: LlmLiveSimulationConfig
  timeoutMs?: number
}): Promise<AgentTeamLlmSimulationResult> {
  const startedAt = Date.now()
  const response = await fetchWithTimeout(`${input.config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.config.model,
      temperature: 0,
      max_tokens: 1200,
      messages: [
        {
          role: 'system',
          content: [
            'You are Lucid running a production-readiness simulation for a reusable template.',
            'Use only the supplied fixture evidence. Do not claim to send, publish, refund, update CRM, schedule, or mutate external systems.',
            'Return exactly these Markdown headings: Summary, Findings, Evidence, Risks, Next actions.',
            'The Risks section must include the literal phrase "human review" and make clear that Lucid is not approving, signing, sending, publishing, refunding, scheduling, or mutating external systems.',
            'The Next actions section must include the literal phrase "Mission Control".',
            'Every answer must mention provenance or source evidence.',
            'In the Evidence section, add a bullet that starts "Expected terms covered:" and copies every expectedTerms value verbatim, comma-separated.',
            'If liveEvidenceAnchors are supplied, copy each liveEvidenceAnchors value verbatim in the Evidence section.',
            'Use templateOperatingInstructions to make the answer specific to this template, not a generic brief.',
            'Make recommendations concrete and decision-ready: name the priority, why it matters, what to verify, and what the operator should do next.',
            'Be concise: use 1 short paragraph for Summary, 3-5 bullets for Findings, 4-7 bullets for Evidence, 2-3 bullets for Risks, and 2-4 numbered Next actions.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            template: {
              slug: input.template.slug,
              name: input.template.name,
              category: input.template.category,
              kind: input.template.kind,
              description: input.template.description,
            },
            templateOperatingInstructions: summarizeTemplateOperatingInstructions(input.template),
            scenario: input.scenario,
            expectedTerms: input.scenario.expectedTerms,
            liveEvidenceAnchors: input.scenario.liveEvidenceAnchors ?? [],
            requiredOutput: ['Summary', 'Findings', 'Evidence', 'Risks', 'Next actions'],
          }, null, 2),
        },
      ],
    }),
  }, input.timeoutMs ?? 45_000)

  const latencyMs = Date.now() - startedAt
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`agent-team template LLM simulation failed with HTTP ${response.status}: ${summarizeErrorBody(text)}`)
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const answerText = payload.choices?.[0]?.message?.content?.trim()
  if (!answerText) throw new Error('agent-team template LLM simulation returned an empty answer')
  return {
    answerText,
    latencyMs,
    providerLabel: input.config.providerLabel,
    model: input.config.model,
  }
}

function summarizeTemplateOperatingInstructions(template: TemplateRegistrySeed): unknown {
  if (template.spec.kind === 'agent') {
    return {
      kind: 'agent',
      systemPrompt: template.spec.system_prompt,
      plugins: template.spec.plugins,
      skills: template.spec.skills,
      memoryEnabled: template.spec.memory_enabled,
      approvalRequiredTools: template.spec.approval_required_tools,
    }
  }

  return {
    kind: 'team',
    objective: template.spec.objective,
    members: template.spec.members.map((member) => ({
      role: member.role,
      description: member.description,
      systemPrompt: member.system_prompt,
      plugins: member.plugins,
      skills: member.skills,
    })),
    edges: template.spec.edges,
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function summarizeErrorBody(text: string): string {
  const title = text.match(/<title>(.*?)<\/title>/i)?.[1]
  const summary = title ?? text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return summary.slice(0, 180)
}
