import type { BuilderDecisionCard } from '@/lib/ai/project-generation/schemas'

export function getVisibleBuilderDecisionCards(cards: BuilderDecisionCard[]): BuilderDecisionCard[] {
  const first = cards[0]
  return first ? [first] : []
}
