import type { TemplateCatalogEntry } from '@contracts/template'

import { createBlankAgentDraft, buildDraftFromTemplate, projectBlueprintFromDraft } from '@/lib/ai/project-generation/draft'
import type { ProjectBuilderUIMessage } from '@/lib/ai/project-generation/chat'
import type { GeneratedBlueprintResult, GenerationDraft, MissingRequiredInput } from '@/lib/ai/project-generation/schemas'

export interface BuilderSessionSeed {
  result: GeneratedBlueprintResult
  messages: ProjectBuilderUIMessage[]
}

export function buildBlankAssistedSessionSeed(): BuilderSessionSeed {
  const draft = createBlankAgentDraft({
    prompt: 'Start fresh',
    projectName: '',
    systemPrompt: '',
  })
  return buildSeededAssistedSession({
    draft,
    userText: 'Start fresh',
    assistantText: 'I opened a fresh agent draft. Tell me what it should do, or edit the setup on the right before creating.',
    confidence: 0.65,
  })
}

export function buildTemplateAssistedSessionSeed(template: TemplateCatalogEntry): BuilderSessionSeed {
  const params = Object.fromEntries(template.params.map((param) => [param.key, param.default ?? '']))
  const draft = buildDraftFromTemplate(template, {
    prompt: template.preview_prompt ?? template.description ?? `Use ${template.name}`,
    params,
  })
  const missingRequiredInputs = template.params
    .filter((param) => param.required && !params[param.key]?.trim())
    .map((param) => ({
      key: param.key,
      label: param.label,
      reason: param.hint ?? param.placeholder ?? `${template.name} requires this value before deploy`,
    }))

  return buildSeededAssistedSession({
    draft,
    userText: `Use ${template.name}`,
    assistantText: buildTemplateSeedAssistantText(template, missingRequiredInputs),
    confidence: 0.9,
    missingRequiredInputs,
  })
}

function buildTemplateSeedAssistantText(
  template: TemplateCatalogEntry,
  missingRequiredInputs: MissingRequiredInput[],
): string {
  if (missingRequiredInputs.length === 0) {
    return `I loaded the ${template.name} template. Review or refine it before creating.`
  }

  const labels = joinLabels(missingRequiredInputs.map((input) => input.label))
  return `I loaded the ${template.name} template. To complete it, tell me ${labels}, or fill them in on the right.`
}

function buildSeededAssistedSession(input: {
  draft: GenerationDraft
  userText: string
  assistantText: string
  confidence: number
  missingRequiredInputs?: MissingRequiredInput[]
}): BuilderSessionSeed {
  const blueprint = projectBlueprintFromDraft(input.draft)
  const selectedTemplate = input.draft.template
  return {
    result: {
      mode: input.draft.mode,
      draft: input.draft,
      blueprint,
      reasoning_summary: input.assistantText,
      template_matches: [],
      ...(selectedTemplate ? { selected_template: selectedTemplate } : {}),
      warnings: [],
      missing_required_inputs: input.missingRequiredInputs ?? [],
      suggested_integrations: [],
      confidence: input.confidence,
    },
    messages: [
      buildSeedMessage('user', input.userText, `seed-user-${input.draft.mode}-${selectedTemplate?.slug ?? 'blank'}`),
      buildSeedMessage('assistant', input.assistantText, `seed-assistant-${input.draft.mode}-${selectedTemplate?.slug ?? 'blank'}`),
    ],
  }
}

function joinLabels(labels: string[]): string {
  if (labels.length === 0) return 'the required inputs'
  if (labels.length === 1) return labels[0]!
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`
}

function buildSeedMessage(
  role: 'user' | 'assistant',
  text: string,
  id: string,
): ProjectBuilderUIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
  } as ProjectBuilderUIMessage
}
