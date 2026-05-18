import type { Node } from 'reactflow'
import { groupsKey, positionsKey } from './agents-canvas-model'

export interface CanvasGroup {
  id: string
  name: string
  color: string
  icon?: string
  memberIds: string[]
}

export function loadGroupsLocal(wsId: string): CanvasGroup[] {
  try {
    const raw = localStorage.getItem(groupsKey(wsId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveGroupsLocal(wsId: string, groups: CanvasGroup[]) {
  try { localStorage.setItem(groupsKey(wsId), JSON.stringify(groups)) } catch { /* quota */ }
}

export function loadPositionsLocal(wsId: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(positionsKey(wsId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function savePositionsLocal(wsId: string, data: Node[] | Record<string, { x: number; y: number }>) {
  const positions: Record<string, { x: number; y: number }> = Array.isArray(data)
    ? Object.fromEntries(data.map((n) => [n.id, n.position]))
    : data
  try { localStorage.setItem(positionsKey(wsId), JSON.stringify(positions)) } catch { /* quota */ }
}
