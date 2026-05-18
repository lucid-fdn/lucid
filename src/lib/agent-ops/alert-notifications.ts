import 'server-only'

import type { AgentOpsPerformanceAlert } from './operating-loop'
import { getOrganizationById } from '@/lib/db/organizations'
import { ErrorService } from '@/lib/errors/error-service'
import { NotificationService } from '@/lib/notifications/service'

export async function notifyAgentOpsPerformanceAlert(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  alert: AgentOpsPerformanceAlert
}): Promise<void> {
  try {
    const organization = await getOrganizationById(input.orgId)
    const link = organization?.slug
      ? buildAgentOpsOverviewHref({
          workspaceSlug: organization.slug,
          projectId: input.projectId,
          assistantId: input.assistantId,
        })
      : undefined

    await NotificationService.sendToOrgMembers({
      orgId: input.orgId,
      type: 'AGENT_OPS_PERFORMANCE_ALERT',
      title: input.alert.title,
      message: input.alert.body,
      link,
      relatedOrgId: input.orgId,
      metadata: {
        ...input.alert.metadata,
        fingerprint: input.alert.fingerprint,
        project_id: input.projectId ?? null,
      },
    }, {
      inApp: true,
      email: false,
      push: false,
      sms: false,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'warning',
      context: {
        orgId: input.orgId,
        projectId: input.projectId ?? undefined,
        operation: 'notifyAgentOpsPerformanceAlert',
      },
      tags: { layer: 'agent-ops', feature: 'performance-alerts' },
    })
  }
}

function buildAgentOpsOverviewHref(input: {
  workspaceSlug: string
  projectId?: string | null
  assistantId?: string | null
}): string {
  const params = new URLSearchParams()
  if (input.projectId) params.set('project_id', input.projectId)
  if (input.assistantId) params.set('assistant_id', input.assistantId)
  const query = params.toString()
  return `/${input.workspaceSlug}/mission-control/agent-ops${query ? `?${query}` : ''}`
}
