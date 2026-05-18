import 'server-only'

import type { AgentOpsTeamPolicyGate } from '@/lib/agent-ops/ports'
import {
  evaluateAgentOpsTeamPolicyGate,
  resolveAgentOpsTeamPolicy,
} from '@/lib/agent-ops/team-policy'
import { getAgentOpsProjectPolicy } from './agent-ops-product'
import { listAgentOpsRunsForOrg } from './agent-ops'

export const supabaseAgentOpsTeamPolicyGate: AgentOpsTeamPolicyGate = {
  async evaluateRunStart(input) {
    if (!input.projectId) {
      return evaluateAgentOpsTeamPolicyGate({
        policy: resolveAgentOpsTeamPolicy(null),
        workflow: input.workflow,
        scope: input.scope,
        completedRuns: [],
      })
    }

    const [policyRow, completedRuns] = await Promise.all([
      getAgentOpsProjectPolicy({
        orgId: input.orgId,
        projectId: input.projectId,
      }),
      listAgentOpsRunsForOrg(input.orgId, {
        projectId: input.projectId,
        status: 'completed',
        limit: 100,
      }),
    ])

    return evaluateAgentOpsTeamPolicyGate({
      policy: resolveAgentOpsTeamPolicy(policyRow?.metadata ?? null),
      workflow: input.workflow,
      scope: input.scope,
      completedRuns: completedRuns.map((run) => ({
        id: run.id,
        workflowId: run.workflowId,
        status: run.status,
        scope: run.scope,
        completedAt: run.completedAt ?? null,
        updatedAt: run.updatedAt,
        createdAt: run.createdAt,
      })),
    })
  },
}
