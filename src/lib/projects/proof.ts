import type { ProjectAttentionData } from '@/lib/projects/attention'
import type { RuntimePackagingSummary } from '@/lib/engines/presentation'

export type ProjectProofStage =
  | 'create-agent'
  | 'create-work'
  | 'review-inbox'
  | 'review-runs'
  | 'harden-runtime'

export interface ProjectProofLoop {
  stage: ProjectProofStage
  title: string
  summary: string
  receiptLabel: string
  nextActionTitle: string
  nextActionDescription: string
}

export function deriveProjectProofLoop(params: {
  assistantCount: number
  recentEventCount: number
  attention: Pick<ProjectAttentionData['summary'], 'approvals' | 'failedRuns' | 'openWorkItems' | 'readyWorkItems'>
  runtimePackaging: Pick<RuntimePackagingSummary, 'uniqueModeCount' | 'primaryTitle' | 'guidance'>
}): ProjectProofLoop {
  const { assistantCount, recentEventCount, attention, runtimePackaging } = params

  if (assistantCount === 0) {
    return {
      stage: 'create-agent',
      title: 'Create the first operator',
      summary: 'No agent exists yet, so this project has no actor capable of producing a receipt.',
      receiptLabel: 'No proof yet',
      nextActionTitle: 'Create your first agent',
      nextActionDescription: 'Start with one standalone agent before you add teams or runtime complexity.',
    }
  }

  if (attention.openWorkItems === 0) {
    return {
      stage: 'create-work',
      title: 'Create the first unit of work',
      summary: 'Agents exist, but nothing concrete is being operated inside the project yet.',
      receiptLabel: recentEventCount > 0 ? `${recentEventCount} recent event${recentEventCount === 1 ? '' : 's'}` : 'No work receipts yet',
      nextActionTitle: 'Create one work item',
      nextActionDescription: 'Turn intent into a project work item so Lucid can produce an operator-visible receipt.',
    }
  }

  if (attention.failedRuns > 0 || attention.approvals > 0 || attention.readyWorkItems > 0) {
    return {
      stage: 'review-inbox',
      title: 'Resolve the operator loop',
      summary: 'The project is producing real execution state. The right next move is to resolve approvals, failures, and ready work.',
      receiptLabel: recentEventCount > 0 ? `${recentEventCount} recent receipt${recentEventCount === 1 ? '' : 's'}` : 'Work exists, but receipts are still thin',
      nextActionTitle: 'Open Inbox',
      nextActionDescription: 'Use Inbox as the proof surface for what happened, what failed, and what needs a decision next.',
    }
  }

  if (recentEventCount > 0) {
    return {
      stage: 'review-runs',
      title: 'Inspect the receipts',
      summary: 'The basic project loop is working. Now validate the quality of the receipts before scaling scope.',
      receiptLabel: `${recentEventCount} recent receipt${recentEventCount === 1 ? '' : 's'}`,
      nextActionTitle: 'Review runs',
      nextActionDescription: 'Make sure the run narrative is legible enough that another operator could understand what happened.',
    }
  }

  return {
    stage: 'harden-runtime',
    title: 'Harden the runtime posture',
    summary: 'The basic loop exists. The next product move is to decide whether the current runtime path is good enough for the traffic you expect.',
    receiptLabel: runtimePackaging.primaryTitle ?? 'Runtime posture pending',
    nextActionTitle: 'Review runtime posture',
    nextActionDescription: runtimePackaging.guidance,
  }
}
