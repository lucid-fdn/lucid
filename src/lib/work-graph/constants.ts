import type { WorkBoardColumnCreate } from '@contracts/work-graph'

export const DEFAULT_WORK_BOARD_COLUMNS: WorkBoardColumnCreate[] = [
  { key: 'backlog', label: 'Backlog', status_filter: ['open'], position: 1000, is_done: false },
  { key: 'in_progress', label: 'In progress', status_filter: ['in_progress'], position: 2000, is_done: false },
  { key: 'waiting', label: 'Waiting', status_filter: ['waiting'], position: 3000, is_done: false },
  { key: 'done', label: 'Done', status_filter: ['done'], position: 4000, is_done: true },
]

export const WORK_GRAPH_CYCLE_RELATIONS = new Set([
  'blocks',
  'depends_on',
  'parent',
  'child',
])

export const WORK_GRAPH_ALLOWED_ARTIFACT_REF_TABLES = new Set([
  'agent_ops_runs',
  'agent_ops_artifacts',
  'agent_ops_findings',
  'knowledge_claims',
  'knowledge_pages',
  'browser_operator_sessions',
  'engine_home_snapshots',
  'work_item_external_refs',
  'mc_pending_approvals',
  'agent_runs',
])
