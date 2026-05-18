export interface PlatformGuarantee {
  id: string
  title: string
  summary: string
}

const CORE_GUARANTEES: PlatformGuarantee[] = [
  {
    id: 'auth',
    title: 'Auth and permissions',
    summary: 'Lucid handles session identity, route protection, and scoped access before work reaches the agent runtime.',
  },
  {
    id: 'recovery',
    title: 'Error recovery',
    summary: 'Runs surface failures as receipts, continuation handoffs, and inbox attention instead of disappearing into logs.',
  },
  {
    id: 'persistence',
    title: 'State and files',
    summary: 'Lucid preserves run receipts, file outputs, and operator-visible work state so execution stays inspectable.',
  },
  {
    id: 'runtime',
    title: 'Runtime governance',
    summary: 'Lucid tracks runtime posture, retry windows, heartbeat policy, and control-plane safety centrally.',
  },
]

export function getPlatformGuarantees(context: 'create-agent' | 'proof-loop' = 'proof-loop') {
  if (context === 'create-agent') {
    return CORE_GUARANTEES
  }

  return [
    CORE_GUARANTEES[1],
    CORE_GUARANTEES[2],
    CORE_GUARANTEES[3],
  ]
}
