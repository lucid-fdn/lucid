import type {
  WorkArtifactLink,
  WorkBoard,
  WorkBoardColumn,
  WorkBoardItem,
  WorkGoal,
  WorkGraphEvent,
  WorkGraphPlanningJob,
  WorkItemCheckout,
  WorkItemEngineFacet,
  WorkItemGoalLink,
  WorkItemRelation,
} from '@contracts/work-graph'
import type { HumanWorkItem } from '@/lib/db/human-work-items'

export interface WorkBoardItemWithWorkItem extends WorkBoardItem {
  workItem: HumanWorkItem | null
}

export interface WorkBoardReadModel extends WorkBoard {
  columns: Array<WorkBoardColumn & { items: WorkBoardItemWithWorkItem[] }>
}

export interface WorkGraphOverview {
  goals: WorkGoal[]
  boards: WorkBoard[]
  openCheckouts: WorkItemCheckout[]
  recentEvents: WorkGraphEvent[]
  planningJobs: WorkGraphPlanningJob[]
}

export interface WorkItemGraphContext {
  workItem: HumanWorkItem
  goals: WorkGoal[]
  goalLinks: WorkItemGoalLink[]
  outgoingRelations: WorkItemRelation[]
  incomingRelations: WorkItemRelation[]
  activeCheckout: WorkItemCheckout | null
  artifactLinks: WorkArtifactLink[]
  engineFacets: WorkItemEngineFacet[]
}

