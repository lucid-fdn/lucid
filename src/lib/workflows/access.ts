import type { SupabaseClient } from '@supabase/supabase-js'

import { canPerformAction } from '@/lib/access-control/server'

export const WORKFLOW_ACCESS_SELECT = 'id, user_id, organization_id'

export type WorkflowAccessRow = {
  id: string
  user_id: string | null
  organization_id: string | null
}

export type WorkflowAccessResult = {
  allowed: boolean
  status: 403 | 404
  error: string
  workflow?: WorkflowAccessRow
}

async function isWorkflowOrgMember(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) return false
  return Boolean(data)
}

export async function checkWorkflowAccess(
  supabase: SupabaseClient,
  workflowId: string,
  userId: string,
  requireEdit = false,
): Promise<WorkflowAccessResult> {
  const { data: workflow, error } = await supabase
    .from('workflows')
    .select(WORKFLOW_ACCESS_SELECT)
    .eq('id', workflowId)
    .single<WorkflowAccessRow>()

  if (error || !workflow) {
    return { allowed: false, status: 404, error: 'Workflow not found' }
  }

  if (workflow.user_id === userId) {
    return { allowed: true, status: 403, error: '', workflow }
  }

  if (workflow.organization_id) {
    if (!await isWorkflowOrgMember(supabase, userId, workflow.organization_id)) {
      return { allowed: false, status: 403, error: 'Forbidden: No access to this workflow' }
    }

    const permission = requireEdit ? 'editProjects' : 'viewSettings'
    if (await canPerformAction(userId, workflow.organization_id, permission)) {
      return { allowed: true, status: 403, error: '', workflow }
    }
  }

  return { allowed: false, status: 403, error: 'Forbidden: No access to this workflow' }
}
