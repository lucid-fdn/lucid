import 'server-only'

import { syncManagedRuntimeOnHeartbeat } from '@/lib/runtimes/controller'
export {
  planManagedRuntimeSync,
  resolveDesiredRuntimeImageRef,
  shouldAutoRedeployRuntime,
} from '@/lib/runtimes/controller'

export async function maybeTriggerRuntimeAutoRedeploy(
  runtimeId: string,
  orgId: string,
): Promise<boolean> {
  const outcome = await syncManagedRuntimeOnHeartbeat(runtimeId, orgId)
  return outcome.executed && outcome.plan.kind === 'redeploy'
}
