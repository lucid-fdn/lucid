import 'server-only'

import { AgentOpsDagOrchestrationAdapter } from '@/lib/agent-ops/dag-orchestration-adapter'
import { supabase } from '@/lib/db/client'

export const supabaseAgentOpsDagOrchestrationAdapter = new AgentOpsDagOrchestrationAdapter({
  supabaseClient: supabase,
})
