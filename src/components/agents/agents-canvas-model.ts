import type { Agent } from '@/types/agent'

export function getAgentStatus(agent: Agent): 'active' | 'paused' | 'idle' {
  if (!agent.is_active) return 'paused'
  if (agent.mc_status === 'paused') return 'paused'
  return 'idle'
}

export function positionsKey(workspaceId: string) {
  return `lucid:canvas-positions:${workspaceId}`
}

export function groupsKey(workspaceId: string) {
  return `lucid:canvas-groups:${workspaceId}`
}

export const GROUP_COLORS = [
  '#8b5cf6',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#06b6d4',
  '#f97316',
] as const

export const GROUP_COLOR_LABELS: Record<string, string> = {
  '#8b5cf6': 'Violet',
  '#3b82f6': 'Blue',
  '#10b981': 'Emerald',
  '#f59e0b': 'Amber',
  '#ef4444': 'Red',
  '#ec4899': 'Pink',
  '#06b6d4': 'Cyan',
  '#f97316': 'Orange',
}

