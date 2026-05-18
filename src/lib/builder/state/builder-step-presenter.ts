import type { BuilderDecisionCard } from '@/lib/ai/project-generation/schemas'

const READY_MESSAGE = 'The setup is ready. You can create it now, or keep refining anything in the panel.'
const CONNECT_APPS_MESSAGE = 'Selected apps need setup before create. Connect missing apps or choose which existing account this agent should use.'

export function getBuilderReadyMessage(): string {
  return READY_MESSAGE
}

export function getBuilderConnectAppsMessage(): string {
  return CONNECT_APPS_MESSAGE
}

export function buildBuilderSkipTransitionMessage(
  skippedCard: BuilderDecisionCard,
  nextCard: BuilderDecisionCard | undefined,
): string {
  if (!nextCard) {
    return READY_MESSAGE
  }

  return [describeSkippedBuilderStep(skippedCard), describeNextBuilderStep(nextCard)]
    .filter(Boolean)
    .join(' ')
}

export function buildBuilderAppliedStepMessage(
  action: 'suggested-schedule',
  nextCard: BuilderDecisionCard | undefined,
): string {
  if (!nextCard) return READY_MESSAGE

  switch (action) {
    case 'suggested-schedule':
      return `I added the suggested schedule. ${describeNextBuilderStep(nextCard)}`
  }
}

export function describeSkippedBuilderStep(card: BuilderDecisionCard): string {
  if (card.kind === 'capability_multi_select') {
    return 'I left tools unchanged for now.'
  }

  if (card.kind === 'configuration_panel') {
    if (card.panel === 'channels') return 'I left channels unchanged for now.'
    if (card.panel === 'tasks') return 'I left scheduling off for now.'
  }

  if (card.kind === 'clarification_select') {
    return 'I kept the current setup without narrowing that choice yet.'
  }

  if (card.kind === 'runtime_mode') return 'I left the runtime unchanged for now.'
  if (card.kind === 'team_mode') return 'I left the structure unchanged for now.'
  if (card.kind === 'template_param') return `I left ${card.label.toLowerCase()} open for now.`

  return 'I kept the current setup as is.'
}

export function describeNextBuilderStep(card: BuilderDecisionCard | undefined): string {
  if (!card) return ''

  if (card.kind === 'capability_multi_select') {
    return 'Add any tools you want below, or skip them if you want to keep the setup lighter.'
  }

  if (card.kind === 'configuration_panel') {
    if (card.panel === 'channels') {
      return 'Choose where this agent should work next. You can set channels below, or skip this if you want to decide later.'
    }
    if (card.panel === 'tasks') {
      return 'I left scheduling off by default because not every assistant should run automatically. Add a schedule below if you want it to run on its own, or skip this too.'
    }
    return card.description ?? `Next, ${card.action_label.toLowerCase()}.`
  }

  if (card.kind === 'clarification_select') {
    return card.description
      ? `${card.description} Choose one option below.`
      : 'I need one quick choice before I push the setup further.'
  }

  if (card.kind === 'runtime_mode' || card.kind === 'team_mode') {
    return card.description ?? `Next, choose ${card.title.toLowerCase()}.`
  }

  if (card.kind === 'template_param') {
    return card.reason ? `${card.reason} Fill it in below when you are ready.` : `Next, set ${card.label.toLowerCase()}.`
  }

  return 'You can keep refining the setup from here.'
}
