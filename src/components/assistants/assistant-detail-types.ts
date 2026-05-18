import type { UnifiedSkillItem } from '@contracts/unified-skill'
import type { NativeMutationCandidateRecord } from '@/lib/db/mission-control'
import type { RuntimeFeatureAccess } from '@/lib/access-control/types'
import type { ScheduledTask } from '@/lib/mission-control/types'
import type { Agent as Assistant } from '@/types/agent'
import type { Passport } from 'raijin-labs-lucid-ai/models'

export interface AssistantMemory {
  id: string
  fact_text: string
  category: string
  confidence: number
  access_count: number
  last_accessed_at: string | null
  source_user_message: string | null
  source_assistant_response: string | null
  created_at: string
}

export interface ModelGroup {
  provider: string
  models: Array<{
    id: string
    modelId?: string
    passportId?: string
    name: string
    provider: string
    category: string
    description?: string
  }>
}

export interface AssistantAvatarAsset {
  id: string
  url: string
  provider: string
  model: string
  width: number
  height: number
  mimeType: string
  metadata: Record<string, unknown>
  promptVersion?: string
  stylePreset?: string
  angle?: string
  crop?: string
  expression?: string
  background?: string
  lighting?: string
}

export interface AssistantDetailClientProps {
  assistant: Assistant
  workspaceSlug: string
  workspaceId: string
  projectSlug?: string
  backHref?: string
  initialModels?: ModelGroup[]
  isInternal?: boolean
  initialTradingPolicy?: Record<string, unknown> | null
  initialMemories?: AssistantMemory[]
  initialMemoriesTotal?: number
  initialPassport?: Passport | null
  initialTasks?: ScheduledTask[]
  initialSkills?: UnifiedSkillItem[]
  initialNativeMutationCandidates?: NativeMutationCandidateRecord[]
  initialEngineHomeState?: unknown
  initialAvatar?: AssistantAvatarAsset | null
  runtimeFeatureAccess?: RuntimeFeatureAccess | null
  agentOpsLaunchHref?: string
  channelOpsLaunchHref?: string
}
