/**
 * Crew Contracts — Multi-Agent Orchestration
 *
 * Pure TypeScript + Zod schemas shared between:
 * - src/ (Next.js app on Vercel)
 * - worker/ (Event processor on Railway/Fly)
 *
 * NO framework dependencies allowed here.
 */

import { z } from 'zod'

// ─── Enums ────────────────────────────────────────────────────────────

export type CrewMemberType = 'assistant'
// v2: | 'runtime' | 'external_agent' | 'human' | 'router'

export type CrewStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type CrewRunStatus = 'starting' | 'running' | 'completed' | 'failed' | 'cancelled'
export type CrewRunMemberStatus = 'pending' | 'starting' | 'running' | 'completed' | 'failed' | 'skipped'
export type EdgeDirection = 'unidirectional' | 'bidirectional'
export type CrewTriggerType = 'manual' | 'scheduled' | 'agent' | 'api'

// ─── Domain Models ────────────────────────────────────────────────────

export interface Crew {
  id: string
  org_id: string
  project_id: string
  name: string
  description: string | null
  objective: string
  lead_member_id: string | null
  status: CrewStatus
  max_concurrent_runs: number
  cost_limit_per_run_usd: number | null
  cost_limit_daily_usd: number | null
  topology_enforced: boolean
  canvas_position: { x: number; y: number } | null
  canvas_size: { width: number; height: number } | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CrewMember {
  id: string
  crew_id: string
  member_type: CrewMemberType
  member_ref_id: string
  assistant_id: string | null
  role: string
  role_description: string | null
  is_coordinator: boolean
  join_order: number
  position_in_crew: { x: number; y: number } | null
  created_at: string
  // Joined from ai_assistants (topology RPC)
  assistant_name?: string
  assistant_model?: string
  assistant_is_active?: boolean
}

export interface CrewEdge {
  id: string
  crew_id: string
  source_member_id: string
  target_member_id: string
  direction: EdgeDirection
  label: string | null
  created_at: string
}

export interface CrewRun {
  id: string
  crew_id: string
  org_id: string
  trigger_type: CrewTriggerType
  triggered_by: string | null
  status: CrewRunStatus
  started_at: string
  completed_at: string | null
  outcome_summary: string | null
  error_message: string | null
  total_cost_usd: number
  created_at: string
}

export interface CrewRunMember {
  id: string
  crew_run_id: string
  crew_member_id: string
  assistant_id: string
  status: CrewRunMemberStatus
  started_at: string | null
  completed_at: string | null
  outcome_summary: string | null
  error_message: string | null
  cost_usd: number
}

export interface CrewTopology {
  crew: Crew
  members: CrewMember[]
  edges: CrewEdge[]
}

// Team is the product-facing name for Crew. Keep these aliases in this file so
// storage/API compatibility stays anchored to the existing Crew contract.
export type Team = Crew
export type TeamMember = CrewMember
export type TeamEdge = CrewEdge
export type TeamRun = CrewRun
export type TeamRunMember = CrewRunMember
export type TeamTopology = CrewTopology
export type TeamMemberType = CrewMemberType
export type TeamStatus = CrewStatus
export type TeamRunStatus = CrewRunStatus
export type TeamRunMemberStatus = CrewRunMemberStatus
export type TeamTriggerType = CrewTriggerType

// ─── Zod Schemas (API validation) ─────────────────────────────────────

export const CreateCrewSchema = z.object({
  project_id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  objective: z.string().min(1).max(2000),
  max_concurrent_runs: z.number().int().min(1).max(10).optional(),
  cost_limit_per_run_usd: z.number().positive().optional(),
  cost_limit_daily_usd: z.number().positive().optional(),
  topology_enforced: z.boolean().optional(),
  canvas_position: z.object({ x: z.number(), y: z.number() }).optional(),
  canvas_size: z.object({ width: z.number(), height: z.number() }).optional(),
  // Inline member creation (convenience for wizard)
  members: z.array(z.object({
    assistant_id: z.string().uuid(),
    role: z.string().min(1).max(100),
    role_description: z.string().max(500).optional(),
    is_coordinator: z.boolean().optional(),
  })).min(1).optional(),
  // Inline edge creation
  edges: z.array(z.object({
    source_member_index: z.number().int().min(0),
    target_member_index: z.number().int().min(0),
    direction: z.enum(['unidirectional', 'bidirectional']).optional(),
    label: z.string().max(100).optional(),
  })).optional(),
})

export type CreateCrewInput = z.infer<typeof CreateCrewSchema>

export const UpdateCrewSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  objective: z.string().min(1).max(2000).optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'archived']).optional(),
  max_concurrent_runs: z.number().int().min(1).max(10).optional(),
  cost_limit_per_run_usd: z.number().positive().nullable().optional(),
  cost_limit_daily_usd: z.number().positive().nullable().optional(),
  topology_enforced: z.boolean().optional(),
  canvas_position: z.object({ x: z.number(), y: z.number() }).nullable().optional(),
  canvas_size: z.object({ width: z.number(), height: z.number() }).nullable().optional(),
  lead_member_id: z.string().uuid().nullable().optional(),
})

export type UpdateCrewInput = z.infer<typeof UpdateCrewSchema>

export const AddCrewMemberSchema = z.object({
  assistant_id: z.string().uuid(),
  role: z.string().min(1).max(100),
  role_description: z.string().max(500).optional(),
  is_coordinator: z.boolean().optional(),
  position_in_crew: z.object({ x: z.number(), y: z.number() }).optional(),
})

export type AddCrewMemberInput = z.infer<typeof AddCrewMemberSchema>

export const UpdateCrewMemberSchema = z.object({
  role: z.string().min(1).max(100).optional(),
  role_description: z.string().max(500).nullable().optional(),
  is_coordinator: z.boolean().optional(),
  position_in_crew: z.object({ x: z.number(), y: z.number() }).nullable().optional(),
})

export type UpdateCrewMemberInput = z.infer<typeof UpdateCrewMemberSchema>

export const AddCrewEdgeSchema = z.object({
  source_member_id: z.string().uuid(),
  target_member_id: z.string().uuid(),
  direction: z.enum(['unidirectional', 'bidirectional']).optional(),
  label: z.string().max(100).optional(),
})

export type AddCrewEdgeInput = z.infer<typeof AddCrewEdgeSchema>

export const ReplaceCrewEdgesSchema = z.object({
  edges: z.array(z.object({
    source_member_id: z.string().uuid(),
    target_member_id: z.string().uuid(),
    direction: z.enum(['unidirectional', 'bidirectional']).optional(),
    label: z.string().max(100).optional(),
  })),
})

export type ReplaceCrewEdgesInput = z.infer<typeof ReplaceCrewEdgesSchema>

export const CreateTeamSchema = CreateCrewSchema
export type CreateTeamInput = CreateCrewInput

export const UpdateTeamSchema = UpdateCrewSchema
export type UpdateTeamInput = UpdateCrewInput

export const AddTeamMemberSchema = AddCrewMemberSchema
export const TeamMemberSchema = AddCrewMemberSchema
export type AddTeamMemberInput = AddCrewMemberInput
export type TeamMemberInput = AddCrewMemberInput

export const UpdateTeamMemberSchema = UpdateCrewMemberSchema
export type UpdateTeamMemberInput = UpdateCrewMemberInput

export const AddTeamEdgeSchema = AddCrewEdgeSchema
export type AddTeamEdgeInput = AddCrewEdgeInput

export const ReplaceTeamEdgesSchema = ReplaceCrewEdgesSchema
export type ReplaceTeamEdgesInput = ReplaceCrewEdgesInput
