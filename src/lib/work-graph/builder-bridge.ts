import type {
  WorkGraphDecompositionProposal,
  WorkGraphHint,
} from '@contracts/work-graph'

export function workGraphHintFromProposal(
  proposal: WorkGraphDecompositionProposal,
): WorkGraphHint {
  return {
    default_goals: proposal.goals.map((goal) => ({
      title: goal.title,
      ...(goal.description ? { description: goal.description } : {}),
      priority: goal.priority ?? 'normal',
      ...(goal.target_date ? { target_date: goal.target_date } : {}),
    })),
    ...(proposal.board
      ? {
          default_board: {
            name: proposal.board.name,
            kind: proposal.board.kind ?? 'kanban',
            columns: proposal.board.columns ?? [],
          },
        }
      : {}),
    default_workflows: [],
    decomposition_style: 'balanced',
  }
}

