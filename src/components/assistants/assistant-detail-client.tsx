'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAutoSave } from '@/hooks/use-auto-save'
import { useRecentAgents } from '@/hooks/use-recent-agents'
import { useRouter } from 'next/navigation'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { HOSTED_CHANNEL_TYPES } from '@/lib/channels/types'
import {
  Trash2,
  Loader2,
  Settings2,
  MessageSquare,
  Brain,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Zap,
  Search,
  Wallet,
  Sparkles,
  Cpu,
  Calendar,
  Activity,
  Shield,
  Fingerprint,
  RefreshCw,
  Users,
  ImageIcon,
  FileJson,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { FormField } from '@/components/forms/form-field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { PanelLayout, PanelStateCard, PanelEmptyState, PanelDetailBlock } from '@/components/panels/panel-layout'
import { AssistantChannelsPanel } from '@/components/assistant/assistant-channels-panel'
import { AssistantCommandCenter } from '@/components/assistant/assistant-command-center'
import { DiscordSharePanel } from '@/components/assistant/discord-share-panel'
import { SlackSharePanel } from '@/components/assistant/slack-share-panel'
import { TeamsSharePanel } from '@/components/assistant/msteams-share-panel'
import type { ConfigSection } from '@/components/assistant/config-panel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { Agent as Assistant, AgentChannel as AssistantChannel } from '@/types/agent'
import { ModelSelector } from '@/components/ai-chat/model-selector'
import { cn } from '@/lib/utils'
import { LogoIcon } from '@/components/ui/logo-icon'
import { CHANNEL_METADATA, CONNECTABLE_CHANNEL_TYPES, isUserVisibleChannelType, type ChannelType } from '@/lib/channels/types'
import { toast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'
import AgentWalletTab from '@/components/assistants/agent-wallet-tab'
import { SaveAsTemplateDialog } from '@/components/templates/save-as-template-dialog'
import { UnifiedSkillManager } from '@/components/skills/unified-skill-manager'
import { IntegrationProvider } from '@/contexts/integration-context'
import { useAssistantActivity } from '@/hooks/use-assistant-activity'
import { AgentRuntimePanel } from '@/components/mission-control/agents/agent-runtime-panel'
import type { RuntimeFeatureAccess } from '@/lib/access-control/types'
import {
  getLatestAvatarPartialUrl,
  waitForAgentAvatarJob,
  type SerializedAgentAvatarJob,
} from '@/lib/ai/agent-avatar/client-job-stream'
import { AgentTasksPanel } from '@/components/mission-control/agents/agent-tasks-panel'
import { AgentHealthPanel } from '@/components/mission-control/agents/agent-health-panel'
import { AgentGuardrailsPanel } from '@/components/mission-control/agents/agent-guardrails-panel'
import { useHealthScore } from '@/hooks/use-health-score'
import { AgentVerificationPanel } from '@/components/assistants/agent-verification-panel'
import { AgentTeamPanel } from '@/components/assistants/agent-team-panel'
import { AgentOperatingContextPanel } from '@/components/assistants/agent-operating-context-panel'
import { AgentCardPanel } from '@/components/assistants/agent-card-panel'
import { useRuntimes } from '@/hooks/use-runtimes'
import { buildProjectAgentsPath } from '@/lib/projects/urls'
import type { Passport } from 'raijin-labs-lucid-ai/models'
import { useOAuthFlowActive } from '@/lib/oauth/flow-state'
import { notificationCopy } from '@/lib/notifications/copy'
import { useProjectGeneration } from '@/hooks/use-project-generation'
import { projectDraftFromAssistant } from '@/lib/ai/project-generation/projection'
import { GenerationPromptPanel } from '@/components/ai/project-generation/generation-prompt-panel'
import { GenerationSuggestionCard } from '@/components/ai/project-generation/generation-suggestion-card'
import { GenerationModeSummary } from '@/components/ai/project-generation/generation-mode-summary'
import {
  DEFAULT_ASSISTANT_LIVE_SURFACES,
  type AssistantLiveSurfaces,
} from '@/components/assistant/live-surfaces'
import {
  TELEGRAM_VOICE_OPTIONS,
  TELEGRAM_VOICE_STYLE_PRESETS,
  buildTrustGatePolicyConfig,
  getTrustGateInferenceMode,
  type TelegramVoiceStylePreset,
  type TrustGateInferenceMode,
} from './assistant-detail-model'

type AssistantAvatarAsset = {
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
  genderPresentation?: string
  pose?: string
}

type AssistantAvatarJob = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  data?: AssistantAvatarAsset | null
  errorCode?: string | null
  errorMessage?: string | null
  progressStage?: string | null
  progressPercent?: number | null
  partialAssets?: Array<{ index: number; url: string; storagePath?: string; createdAt: string }> | null
}

function normalizeAvatarProgress(value: number | null | undefined): number {
  return Math.max(5, Math.min(100, typeof value === 'number' ? value : 8))
}

function formatAvatarGenerationStatus(job: SerializedAgentAvatarJob): string {
  const percent = typeof job.progressPercent === 'number' ? ` ${job.progressPercent}%` : ''
  if (job.status === 'queued') return 'Queued'
  if (job.progressStage === 'preview') return `Preview ready${percent}`
  if (job.progressStage === 'completed') return 'Finalizing 100%'
  if (job.progressStage === 'starting') return `Starting${percent}`
  return `Rendering${percent}`
}

const AVATAR_STYLE_OPTIONS = [
  { value: 'lucid-studio', label: 'Lucid studio' },
  { value: 'professional-portrait', label: 'Professional' },
  { value: 'soft-3d', label: 'Soft 3D' },
  { value: 'editorial-illustration', label: 'Editorial' },
  { value: 'anime-editorial', label: 'Anime' },
  { value: 'cinematic-real', label: 'Cinematic' },
  { value: 'minimal-mascot', label: 'Mascot' },
] as const

const AVATAR_EXPRESSION_OPTIONS = [
  { value: 'neutral-friendly', label: 'Friendly' },
  { value: 'confident', label: 'Confident' },
  { value: 'warm', label: 'Warm' },
  { value: 'focused', label: 'Focused' },
] as const

const AVATAR_BACKGROUND_OPTIONS = [
  { value: 'clean-light', label: 'Clean light' },
  { value: 'clean-dark', label: 'Clean dark' },
  { value: 'subtle-depth', label: 'Subtle depth' },
  { value: 'transparent-safe', label: 'Transparent' },
] as const

const AVATAR_ANGLE_OPTIONS = [
  { value: 'front-three-quarter', label: '3/4 front' },
  { value: 'front', label: 'Front' },
] as const

const AVATAR_GENDER_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'masculine', label: 'Male' },
  { value: 'feminine', label: 'Woman' },
] as const

const AVATAR_POSE_OPTIONS = [
  { value: 'standard-portrait', label: 'Standard' },
  { value: 'confident-shoulder-turn', label: 'Shoulder turn' },
  { value: 'thoughtful-listener', label: 'Thoughtful' },
  { value: 'calm-operator', label: 'Operator' },
] as const

// ============================================================================
// TYPES
// ============================================================================

interface AssistantMemory {
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

interface ModelGroup {
  provider: string
  models: Array<{ id: string; modelId?: string; passportId?: string; name: string; provider: string; category: string; description?: string }>
}

interface AssistantDetailClientProps {
  assistant: Assistant
  workspaceSlug: string
  workspaceId: string
  projectSlug?: string
  backHref?: string
  /** Server-prefetched model groups — avoids client-side waterfall */
  initialModels?: ModelGroup[]
  /** Whether this workspace is an internal org (bypasses plan gates) */
  isInternal?: boolean
  /** Server-prefetched trading policy (avoids client-side loader) */
  initialTradingPolicy?: Record<string, unknown> | null
  /** Server-prefetched memories */
  initialMemories?: AssistantMemory[]
  /** Server-prefetched memory count */
  initialMemoriesTotal?: number
  /** Server-prefetched passport (null if not provisioned) */
  initialPassport?: Passport | null
  /** Server-prefetched scheduled tasks — avoids client-side fetch delay */
  initialTasks?: import('@/lib/mission-control/types').ScheduledTask[]
  /** Server-prefetched unified skills — avoids client-side loader */
  initialSkills?: import('@contracts/unified-skill').UnifiedSkillItem[]
  /** Server-prefetched native mutation candidates — recent proposed native writes */
  initialNativeMutationCandidates?: import('@/lib/db/mission-control').NativeMutationCandidateRecord[]
  /** Server-prefetched engine memory state. Accepted while the UI surface is gated. */
  initialEngineHomeState?: unknown
  /** Server-prefetched current generated avatar asset. */
  initialAvatar?: AssistantAvatarAsset | null
  /** Workspace runtime/engine feature access derived from centralized plan limits */
  runtimeFeatureAccess?: RuntimeFeatureAccess | null
  /** Contextual Agent Ops launch URL for this agent surface */
  agentOpsLaunchHref?: string
  /** Contextual Agent Ops launch URL for this agent's channel surface */
  channelOpsLaunchHref?: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AssistantDetailClient({
  assistant: initialAssistant,
  workspaceSlug,
  workspaceId,
  projectSlug,
  backHref,
  initialModels,
  isInternal,
  initialTradingPolicy,
  initialMemories,
  initialMemoriesTotal,
  initialPassport,
  initialTasks,
  initialSkills,
  initialNativeMutationCandidates,
  initialEngineHomeState: _initialEngineHomeState,
  initialAvatar,
  runtimeFeatureAccess,
  agentOpsLaunchHref,
  channelOpsLaunchHref,
}: AssistantDetailClientProps) {
  const router = useRouter()
  const [assistant, setAssistant] = useState(initialAssistant)
  const [isDeleting, setIsDeleting] = useState(false)
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false)
  const [description, setDescription] = useState(assistant.description ?? '')
  const [guidedEditPrompt, setGuidedEditPrompt] = useState('')
  const [isApplyingGuidedEdit, setIsApplyingGuidedEdit] = useState(false)

  // Settings form — auto-saved on change
  const [name, setName] = useState(assistant.name)
  const [systemPrompt, setSystemPrompt] = useState(
    assistant.system_prompt || '',
  )
  const [lucidModel, setLucidModel] = useState(
    assistant.lucid_model || 'lucid-auto',
  )
  const [trustGateInferenceMode, setTrustGateInferenceMode] = useState<TrustGateInferenceMode>(
    getTrustGateInferenceMode(assistant.policy_config),
  )
  const [memoryEnabled, setMemoryEnabled] = useState(
    assistant.memory_enabled ?? true,
  )
  const [isActive, setIsActive] = useState(assistant.is_active ?? true)
  const [telegramVoiceMode, setTelegramVoiceMode] = useState<'off' | 'auto' | 'always'>(
    assistant.telegram_voice_mode ?? 'off',
  )
  const [telegramVoiceId, setTelegramVoiceId] = useState(
    assistant.telegram_voice_id ?? '',
  )
  const [telegramVoiceInstructions, setTelegramVoiceInstructions] = useState(
    assistant.telegram_voice_instructions ?? '',
  )
  const [isPreviewingTelegramVoice, setIsPreviewingTelegramVoice] = useState(false)
  const [telegramVoicePreviewError, setTelegramVoicePreviewError] = useState<string | null>(null)
  const telegramVoiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const telegramVoicePreviewUrlRef = useRef<string | null>(null)
  const oauthFlowActive = useOAuthFlowActive()
  const [liveSurfaces, setLiveSurfaces] = useState<AssistantLiveSurfaces>(DEFAULT_ASSISTANT_LIVE_SURFACES)
  const [currentAvatar, setCurrentAvatar] = useState<AssistantAvatarAsset | null>(initialAvatar ?? null)
  const [avatarStylePreset, setAvatarStylePreset] = useState(initialAvatar?.stylePreset ?? 'lucid-studio')
  const [avatarExpression, setAvatarExpression] = useState(initialAvatar?.expression ?? 'neutral-friendly')
  const [avatarBackground, setAvatarBackground] = useState(initialAvatar?.background ?? 'clean-light')
  const [avatarAngle, setAvatarAngle] = useState(initialAvatar?.angle ?? 'front-three-quarter')
  const [avatarGenderPresentation, setAvatarGenderPresentation] = useState(
    initialAvatar?.genderPresentation ?? (initialAvatar?.metadata?.genderPresentation as string | undefined) ?? 'auto',
  )
  const [avatarPose, setAvatarPose] = useState(
    initialAvatar?.pose ?? (initialAvatar?.metadata?.pose as string | undefined) ?? 'standard-portrait',
  )
  const [avatarLockIdentity, setAvatarLockIdentity] = useState(Boolean(initialAvatar?.url))
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false)
  const [isAcceptingAvatar, setIsAcceptingAvatar] = useState(false)
  const [avatarGenerationError, setAvatarGenerationError] = useState<string | null>(null)
  const [avatarGenerationStatus, setAvatarGenerationStatus] = useState<string | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [avatarGenerationPercent, setAvatarGenerationPercent] = useState(0)

  // Track recent agent visit
  const { visit: visitAgent } = useRecentAgents()
  const fallbackAgentsHref = useMemo(
    () => projectSlug
      ? buildProjectAgentsPath(workspaceSlug, projectSlug)
      : `/${workspaceSlug}/projects`,
    [projectSlug, workspaceSlug],
  )
  useEffect(() => {
    if (!projectSlug) return
    visitAgent({
      id: assistant.id,
      name: assistant.name,
      slug: workspaceSlug,
      projectSlug,
    })
  }, [assistant.id, assistant.name, projectSlug, workspaceSlug, visitAgent])

  // Auto-save settings
  const settingsData = useMemo(() => ({
    name,
    description: description.trim() || null,
    system_prompt: systemPrompt,
    lucid_model: lucidModel,
    policy_config: buildTrustGatePolicyConfig(assistant.policy_config, trustGateInferenceMode),
    memory_enabled: memoryEnabled,
    is_active: isActive,
    telegram_voice_mode: telegramVoiceMode,
    telegram_voice_id: telegramVoiceId.trim() || null,
    telegram_voice_instructions: telegramVoiceInstructions.trim() || null,
  }), [name, description, systemPrompt, lucidModel, assistant.policy_config, trustGateInferenceMode, memoryEnabled, isActive, telegramVoiceMode, telegramVoiceId, telegramVoiceInstructions])

  const settingsHasChanged = useCallback((data: typeof settingsData) => {
    return (
      data.name !== assistant.name ||
      (data.description || null) !== (assistant.description ?? null) ||
      data.system_prompt !== (assistant.system_prompt || '') ||
      data.lucid_model !== (assistant.lucid_model || 'lucid-auto') ||
      getTrustGateInferenceMode(data.policy_config) !== getTrustGateInferenceMode(assistant.policy_config) ||
      data.memory_enabled !== (assistant.memory_enabled ?? true) ||
      data.is_active !== (assistant.is_active ?? true) ||
      data.telegram_voice_mode !== (assistant.telegram_voice_mode ?? 'off') ||
      (data.telegram_voice_id || null) !== (assistant.telegram_voice_id ?? null) ||
      (data.telegram_voice_instructions || null) !== (assistant.telegram_voice_instructions ?? null)
    )
  }, [assistant])

  const saveSettings = useCallback(async (data: typeof settingsData) => {
    // Ensure CSRF token exists before saving
    let csrfToken = getCSRFTokenFromCookie()
    if (!csrfToken) {
      await fetch('/api/auth/csrf').catch(() => {})
      csrfToken = getCSRFTokenFromCookie()
    }
    const res = await fetch(`/api/assistants/${assistant.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'x-csrf-token': csrfToken }),
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to save')
    const updated = await res.json()
    setAssistant(updated)
    setDescription(updated.description ?? '')
    setTrustGateInferenceMode(getTrustGateInferenceMode(updated.policy_config))
  }, [assistant.id])

  const { status: autoSaveStatus, save: saveNow } = useAutoSave({
    data: settingsData,
    onSave: saveSettings,
    hasChanged: settingsHasChanged,
    delay: 1500,
  })

  // Live activity feed — polls MC feed API filtered to this assistant
  const { events: activityEvents, isLoading: feedLoading, connected: feedConnected } = useAssistantActivity({
    orgId: initialAssistant.org_id,
    assistantId: initialAssistant.id,
    enabled: true,
    live: liveSurfaces.activity && !oauthFlowActive,
  })

  // Health score for MC Health panel
  const { data: healthData } = useHealthScore(initialAssistant.id, workspaceId, {
    enabled: true,
    live: liveSurfaces.health && !oauthFlowActive,
  })

  // Runtimes for deployment assignment
  const { runtimes } = useRuntimes(initialAssistant.org_id, {
    enabled: true,
    live: liveSurfaces.runtimes && !oauthFlowActive,
  })

  // Skills state — lifted so OAuth connect/disconnect updates sibling
  // components (BuildSummaryRows avatar stack, skillsCount badges) instantly
  // without a page refresh. UnifiedSkillManager pushes updates via onItemsChange.
  const [skills, setSkills] = useState<import('@contracts/unified-skill').UnifiedSkillItem[]>(
    initialSkills ?? [],
  )
  const activeSkillsCount = skills.filter((item) => {
    if (!item.installed || !item.is_active) return false
    if (item.auth_provider) return item.connection_status === 'connected'
    return true
  }).length

  // Tasks state — lifted so AgentTasksPanel's live Realtime stream also
  // drives the hero "next scheduled" preview + introspection stream.
  // AgentTasksPanel pushes updates via onTasksChange.
  const [tasks, setTasks] = useState<import('@/lib/mission-control/types').ScheduledTask[]>(
    initialTasks ?? [],
  )
  const [nativeMutationCandidates, setNativeMutationCandidates] = useState<import('@/lib/db/mission-control').NativeMutationCandidateRecord[]>(
    initialNativeMutationCandidates ?? [],
  )
  const [candidateReviewNotes, setCandidateReviewNotes] = useState<Record<string, string>>({})
  const [busyCandidateAction, setBusyCandidateAction] = useState<string | null>(null)
  const {
    result: guidedEditResult,
    setResult: setGuidedEditResult,
    isGenerating: isGuidedEditLoading,
    generate: runGuidedEdit,
    reset: resetGuidedEdit,
  } = useProjectGeneration({ workspaceId })

  const filterUserVisibleChannels = useCallback(
    (items: AssistantChannel[]) => items.filter((channel) => isUserVisibleChannelType(channel.channel_type)),
    [],
  )

  // Channels state
  const [channels, setChannels] = useState<AssistantChannel[]>(
    filterUserVisibleChannels(assistant.assistant_channels || []),
  )
  const [isLoadingChannels, setIsLoadingChannels] = useState(false)
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [addChannelStep, setAddChannelStep] = useState<'pick' | 'form'>('pick')
  const [newChannelType, setNewChannelType] = useState<string>('telegram')
  const [newBotToken, setNewBotToken] = useState('')
  const [newAppToken, setNewAppToken] = useState('')
  const [newPhoneNumber, setNewPhoneNumber] = useState('')
  const [newPhoneNumberId, setNewPhoneNumberId] = useState('')
  const [newWhatsAppAppSecret, setNewWhatsAppAppSecret] = useState('')
  const [newWhatsAppVerifyToken, setNewWhatsAppVerifyToken] = useState('')
  const [newWhatsAppBusinessAccountId, setNewWhatsAppBusinessAccountId] = useState('')
  const [newChannelId, setNewChannelId] = useState('')
  const [newTeamsAppId, setNewTeamsAppId] = useState('')
  const [newTeamsAppPassword, setNewTeamsAppPassword] = useState('')
  const [newTeamsTenantId, setNewTeamsTenantId] = useState('common')
  const [isCreatingChannel, setIsCreatingChannel] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null)
  const [channelJustConnected, setChannelJustConnected] = useState<string | null>(null)
  const [confirmingDeleteChannelId, setConfirmingDeleteChannelId] = useState<string | null>(null)
  const [confirmClearMemories, setConfirmClearMemories] = useState(false)

  // Connection mode state
  const [connectionMode, setConnectionMode] = useState<'byob' | 'hosted'>('byob')
  // Single source of truth: derived from CHANNEL_METADATA.supportsHosted
  const supportsHostedMode = HOSTED_CHANNEL_TYPES as unknown as string[]

  // Memories state — server-prefetched, no client-side loader
  const [memories, setMemories] = useState<AssistantMemory[]>(initialMemories || [])
  const [memoriesTotal, setMemoriesTotal] = useState(initialMemoriesTotal || 0)
  const [isLoadingMemories, setIsLoadingMemories] = useState(false)
  const [memorySearch, setMemorySearch] = useState('')
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null)
  const [isClearingMemories, setIsClearingMemories] = useState(false)

  const fetchNativeMutationCandidates = useCallback(async () => {
    try {
      const res = await fetch(`/api/assistants/${initialAssistant.id}/native-mutation-candidates?limit=25`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to fetch native mutation candidates')
      const payload = (await res.json()) as {
        candidates?: import('@/lib/db/mission-control').NativeMutationCandidateRecord[]
      }
      setNativeMutationCandidates(payload.candidates ?? [])
    } catch (error) {
      console.error('[assistant-detail] failed to refresh native mutation candidates', error)
      toast.error('Failed to refresh native mutation candidates')
    }
  }, [initialAssistant.id])

  const reviewNativeMutationCandidate = useCallback(async (
    candidateId: string,
    action: 'approve' | 'reject' | 'promote',
    promotionScope?: 'assistant_durable' | 'org_durable',
  ) => {
    setBusyCandidateAction(`${candidateId}:${action}:${promotionScope ?? 'none'}`)
    try {
      let csrfToken = getCSRFTokenFromCookie()
      if (!csrfToken) {
        await fetch('/api/auth/csrf').catch(() => {})
        csrfToken = getCSRFTokenFromCookie()
      }
      const res = await fetch(`/api/assistants/${initialAssistant.id}/native-mutation-candidates`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'x-csrf-token': csrfToken }),
        },
        body: JSON.stringify({
          candidateId,
          action,
          promotionScope: promotionScope ?? null,
          reviewNotes: candidateReviewNotes[candidateId]?.trim() || null,
        }),
      })
      if (!res.ok) {
        if (res.status === 409) {
          await fetchNativeMutationCandidates()
          toast.info('This native mutation candidate was already reviewed.')
          return
        }
        throw new Error(`Failed to ${action} native mutation candidate`)
      }

      await fetchNativeMutationCandidates()
      setCandidateReviewNotes((prev) => {
        const next = { ...prev }
        delete next[candidateId]
        return next
      })
      toast.success(
        action === 'promote'
          ? 'Native mutation candidate promoted'
          : action === 'approve'
            ? 'Native mutation candidate approved'
            : 'Native mutation candidate rejected',
      )
    } catch (error) {
      console.error('[assistant-detail] failed to review native mutation candidate', error)
      toast.error(`Failed to ${action} native mutation candidate`)
    } finally {
      setBusyCandidateAction(null)
    }
  }, [candidateReviewNotes, fetchNativeMutationCandidates, initialAssistant.id])

  // Introspection stream data — derives channels, tasks, last memory for idle view
  const introspectionData = useMemo(() => {
    const chans = channels.map((ch) => ({
      type: ch.channel_type,
      name: ch.channel_type,
      message_count: undefined as number | undefined,
    }))
    const activeTasks = tasks
      .filter((t) => (t.status === 'pending' || t.status === 'claimed') && t.next_run_at)
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        label: t.name || t.task_prompt?.slice(0, 40) || 'Routine',
        next_run_at: t.next_run_at ?? undefined,
      }))
    const lastMem = memories.length > 0
      ? { content: memories[0].fact_text, created_at: memories[0].created_at }
      : null
    return { channels: chans, tasks: activeTasks, lastMemory: lastMem }
  }, [channels, tasks, memories])

  // Ensure CSRF cookie exists (needed for PATCH/DELETE calls)
  useEffect(() => {
    if (!getCSRFTokenFromCookie()) {
      fetch('/api/auth/csrf').catch(() => {})
    }
  }, [])

  useEffect(() => {
    return () => {
      telegramVoiceAudioRef.current?.pause()
      if (telegramVoicePreviewUrlRef.current) {
        URL.revokeObjectURL(telegramVoicePreviewUrlRef.current)
        telegramVoicePreviewUrlRef.current = null
      }
    }
  }, [])

  // Keyboard shortcut (Cmd+S / Ctrl+S) — triggers immediate save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveNow()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [saveNow])

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistant.id}`, {
        method: 'DELETE',
        headers: { ...(csrf && { 'x-csrf-token': csrf }) },
      })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success(notificationCopy.agent.deleted, {
        description: `${assistant.name} has been permanently deleted.`,
      })
      router.push(backHref ?? fallbackAgentsHref)
    } catch {
      toast.error(notificationCopy.agent.failedToDelete)
    } finally {
      setIsDeleting(false)
    }
  }, [assistant.id, assistant.name, backHref, fallbackAgentsHref, router])

  const handleGenerateAvatar = useCallback(async () => {
    setIsGeneratingAvatar(true)
    setAvatarGenerationError(null)
    setAvatarGenerationStatus('Queued')
    setAvatarGenerationPercent(8)
    setAvatarPreviewUrl(null)
    try {
      let csrfToken = getCSRFTokenFromCookie()
      if (!csrfToken) {
        await fetch('/api/auth/csrf').catch(() => {})
        csrfToken = getCSRFTokenFromCookie()
      }

      const res = await fetch(`/api/assistants/${assistant.id}/avatar/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'x-csrf-token': csrfToken }),
        },
        body: JSON.stringify({
          name: name || assistant.name || 'Lucid Agent',
          description: description.trim() || assistant.description || systemPrompt.slice(0, 700) || undefined,
          stylePreset: avatarStylePreset,
          expression: avatarExpression,
          background: avatarBackground,
          angle: avatarAngle,
          genderPresentation: avatarGenderPresentation,
          pose: avatarPose,
          crop: 'head-and-shoulders',
          lockIdentity: avatarLockIdentity && Boolean(currentAvatar?.url),
          referenceImageUrl: avatarLockIdentity ? currentAvatar?.url : undefined,
          referenceAssetId: avatarLockIdentity ? currentAvatar?.id : undefined,
        }),
      })

      const payload = await res.json().catch(() => null) as {
        data?: AssistantAvatarAsset | AssistantAvatarJob
        error?: string
        code?: string
      } | null
      if (!res.ok || !payload?.data) {
        const message = payload?.error || `Avatar generation failed (${res.status})`
        setAvatarGenerationError(message)
        throw new Error(message)
      }

      let avatar: AssistantAvatarAsset | null = 'url' in payload.data ? payload.data : null
      if (!avatar) {
        const job = payload.data as AssistantAvatarJob
        avatar = await waitForAgentAvatarJob<AssistantAvatarAsset>(job.id, {
          onUpdate: (jobUpdate: SerializedAgentAvatarJob) => {
            const previewUrl = getLatestAvatarPartialUrl(jobUpdate)
            if (previewUrl) setAvatarPreviewUrl(previewUrl)
            setAvatarGenerationPercent(normalizeAvatarProgress(jobUpdate.progressPercent))
            setAvatarGenerationStatus(formatAvatarGenerationStatus(jobUpdate))
          },
        })
      }

      if (!avatar) throw new Error('Avatar generation timed out. Please check again in a moment.')

      setCurrentAvatar(avatar)
      setAvatarPreviewUrl(null)
      setAvatarGenerationPercent(100)
      setAvatarLockIdentity(true)
      setAvatarGenerationStatus(null)
      toast.success(currentAvatar?.url ? 'Avatar regenerated' : 'Avatar generated')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate avatar'
      setAvatarGenerationError(message)
      setAvatarPreviewUrl(null)
      toast.error(message)
    } finally {
      setIsGeneratingAvatar(false)
      setAvatarGenerationStatus(null)
      setAvatarGenerationPercent(0)
    }
  }, [
    assistant.description,
    assistant.id,
    assistant.name,
    avatarAngle,
    avatarBackground,
    avatarExpression,
    avatarGenderPresentation,
    avatarLockIdentity,
    avatarPose,
    avatarStylePreset,
    currentAvatar?.id,
    currentAvatar?.url,
    description,
    name,
    systemPrompt,
  ])

  const handleAcceptAvatar = useCallback(async () => {
    if (!currentAvatar?.id) return
    setIsAcceptingAvatar(true)
    setAvatarGenerationError(null)
    try {
      let csrfToken = getCSRFTokenFromCookie()
      if (!csrfToken) {
        await fetch('/api/auth/csrf').catch(() => {})
        csrfToken = getCSRFTokenFromCookie()
      }

      const res = await fetch(`/api/assistants/${assistant.id}/avatar/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'x-csrf-token': csrfToken }),
        },
        body: JSON.stringify({ assetId: currentAvatar.id }),
      })

      const payload = await res.json().catch(() => null) as { data?: AssistantAvatarAsset; error?: string } | null
      if (!res.ok || !payload?.data) {
        throw new Error(payload?.error || `Avatar accept failed (${res.status})`)
      }

      setCurrentAvatar(payload.data)
      toast.success('Avatar set as current')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept avatar'
      setAvatarGenerationError(message)
      toast.error(message)
    } finally {
      setIsAcceptingAvatar(false)
    }
  }, [assistant.id, currentAvatar])

  const handleRunGuidedEdit = useCallback(async () => {
    if (!guidedEditPrompt.trim()) return

    const draft = projectDraftFromAssistant({
      name,
      description: description.trim() || null,
      system_prompt: systemPrompt,
      runtime_flavor: assistant.runtime_flavor ?? null,
      engine: assistant.engine ?? null,
    })

    const result = await runGuidedEdit({ draft })
    if (result) {
      setGuidedEditResult(result)
    }
  }, [assistant.engine, assistant.runtime_flavor, description, guidedEditPrompt, name, runGuidedEdit, setGuidedEditResult, systemPrompt])

  const handleApplyGuidedEdit = useCallback(async () => {
    if (!guidedEditResult || guidedEditResult.draft.mode !== 'blank-agent' || !guidedEditResult.draft.agent) {
      return
    }

    try {
      setIsApplyingGuidedEdit(true)
      const nextName = guidedEditResult.draft.starterName?.trim() || guidedEditResult.draft.project.name
      const nextDescription = guidedEditResult.draft.project.description?.trim() || null
      const nextSystemPrompt = guidedEditResult.draft.agent.system_prompt

      await saveSettings({
        ...settingsData,
        name: nextName,
        description: nextDescription,
        system_prompt: nextSystemPrompt,
      })

      setName(nextName)
      setDescription(nextDescription ?? '')
      setSystemPrompt(nextSystemPrompt)
      setGuidedEditPrompt('')
      resetGuidedEdit()
      toast.success('Guided edit applied')
    } catch {
      toast.error('Failed to apply guided edit')
    } finally {
      setIsApplyingGuidedEdit(false)
    }
  }, [guidedEditResult, resetGuidedEdit, saveSettings, settingsData])

  const handlePreviewTelegramVoice = useCallback(async () => {
    if (isPreviewingTelegramVoice) {
      telegramVoiceAudioRef.current?.pause()
      telegramVoiceAudioRef.current = null
      setIsPreviewingTelegramVoice(false)
      return
    }

    setTelegramVoicePreviewError(null)
    setIsPreviewingTelegramVoice(true)
    try {
      let csrfToken = getCSRFTokenFromCookie()
      if (!csrfToken) {
        await fetch('/api/auth/csrf').catch(() => {})
        csrfToken = getCSRFTokenFromCookie()
      }

      const res = await fetch(`/api/assistants/${assistant.id}/telegram-voice-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'x-csrf-token': csrfToken }),
        },
        body: JSON.stringify({
          voice_id: telegramVoiceId.trim() || null,
          voice_instructions: telegramVoiceInstructions.trim() || null,
        }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error || `Preview failed (${res.status})`)
      }

      const blob = await res.blob()
      if (telegramVoicePreviewUrlRef.current) {
        URL.revokeObjectURL(telegramVoicePreviewUrlRef.current)
      }
      const previewUrl = URL.createObjectURL(blob)
      telegramVoicePreviewUrlRef.current = previewUrl
      const audio = new Audio(previewUrl)
      telegramVoiceAudioRef.current = audio
      audio.onended = () => {
        setIsPreviewingTelegramVoice(false)
      }
      await audio.play()
    } catch (error) {
      setTelegramVoicePreviewError(error instanceof Error ? error.message : 'Failed to preview Telegram voice')
      setIsPreviewingTelegramVoice(false)
    }
  }, [assistant.id, isPreviewingTelegramVoice, telegramVoiceId, telegramVoiceInstructions])

  // ---- CHANNEL HANDLERS ----

  const fetchChannels = useCallback(async () => {
    setIsLoadingChannels(true)
    try {
      const res = await fetch(`/api/assistants/${assistant.id}/channels`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setChannels(filterUserVisibleChannels(data.channels || []))
    } catch {
      // Silently fail
    } finally {
      setIsLoadingChannels(false)
    }
  }, [assistant.id, filterUserVisibleChannels])

  const resetNewChannelForm = useCallback(() => {
    setNewBotToken('')
    setNewAppToken('')
    setNewPhoneNumber('')
    setNewPhoneNumberId('')
    setNewWhatsAppAppSecret('')
    setNewWhatsAppVerifyToken('')
    setNewWhatsAppBusinessAccountId('')
    setNewChannelId('')
    setNewTeamsAppId('')
    setNewTeamsAppPassword('')
    setNewTeamsTenantId('common')
  }, [])

  const handleCreateChannel = useCallback(async () => {
    setIsCreatingChannel(true)
    try {
      const payload = {
        channelType: newChannelType,
        connectionMode,
        botToken:
          newChannelType === 'telegram' || newChannelType === 'discord' || newChannelType === 'slack'
            ? newBotToken
            : newChannelType === 'whatsapp'
              ? newBotToken
            : undefined,
        appToken: newChannelType === 'slack' ? newAppToken : undefined,
        phoneNumber: newChannelType === 'whatsapp' ? newPhoneNumber : undefined,
        phoneNumberId: newChannelType === 'whatsapp' ? newPhoneNumberId : undefined,
        appSecret: newChannelType === 'whatsapp' ? newWhatsAppAppSecret : undefined,
        verifyToken: newChannelType === 'whatsapp' ? newWhatsAppVerifyToken : undefined,
        businessAccountId: newChannelType === 'whatsapp' ? newWhatsAppBusinessAccountId : undefined,
        channelId: newChannelType === 'discord' ? newChannelId : undefined,
        appId: newChannelType === 'msteams' ? newTeamsAppId : undefined,
        appPassword: newChannelType === 'msteams' ? newTeamsAppPassword : undefined,
        tenantId: newChannelType === 'msteams' ? newTeamsTenantId : undefined,
      }
      const csrf2 = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistant.id}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf2 && { 'x-csrf-token': csrf2 }) },
        body: JSON.stringify(payload),
      })
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error?.error || 'Failed to create channel')
      }
      
      const data = await res.json()

      setChannels((prev) => filterUserVisibleChannels([...prev, data.channel]))
      resetNewChannelForm()
      const description =
        newChannelType === 'whatsapp' && data?.webhookVerifyToken
          ? `Webhook URL: ${data.webhookUrl} • Verify token: ${data.webhookVerifyToken}`
          : `Webhook URL: ${data.webhookUrl}`

      toast.success(`${newChannelType} channel created`, {
        description,
        duration: 10000,
      })
      const connectedName = CHANNEL_METADATA[newChannelType as ChannelType]?.name ?? newChannelType
      setChannelJustConnected(connectedName)
      setTimeout(() => {
        setChannelJustConnected(null)
        setShowAddChannel(false)
      }, 1500)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create channel')
    } finally {
      setIsCreatingChannel(false)
    }
  }, [assistant.id, newChannelType, newBotToken, newAppToken, newPhoneNumber, newPhoneNumberId, newWhatsAppAppSecret, newWhatsAppVerifyToken, newWhatsAppBusinessAccountId, newChannelId, newTeamsAppId, newTeamsAppPassword, newTeamsTenantId, connectionMode, resetNewChannelForm, filterUserVisibleChannels])

  const handleDeleteChannel = useCallback(
    async (channelId: string) => {
      try {
        const csrf3 = getCSRFTokenFromCookie()
        const res = await fetch(`/api/assistants/${assistant.id}/channels`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...(csrf3 && { 'x-csrf-token': csrf3 }) },
          body: JSON.stringify({ channelId }),
        })
        if (!res.ok) throw new Error('Failed')
        setChannels((prev) => prev.filter((c) => c.id !== channelId))
        toast.success('Channel deleted')
      } catch {
        toast.error('Failed to delete channel')
      }
    },
    [assistant.id],
  )

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedWebhook(id)
    setTimeout(() => setCopiedWebhook(null), 2000)
  }, [])

  // One-click connect handler for Discord/WhatsApp
  const handleOneClickConnect = useCallback(async (channelType: string) => {
    setIsCreatingChannel(true)

    try {
      const csrf4 = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistant.id}/${channelType}-connect`, {
        method: 'POST',
        headers: { ...(csrf4 && { 'x-csrf-token': csrf4 }) },
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `Failed to connect ${channelType}`)
      }
      
      const data = await res.json()

      const connectedName = CHANNEL_METADATA[channelType as ChannelType]?.name ?? channelType

      // For platforms that return OAuth URL, open it
      if (data?.oauthUrl) {
        window.open(data.oauthUrl, '_blank', 'noopener,noreferrer')
        toast.success(`${channelType} OAuth opened`, {
          description: 'Complete authorization in the new tab, then click Refresh.',
        })
        setShowAddChannel(false)
      } else if (data?.connectUrl) {
        window.open(data.connectUrl, '_blank', 'noopener,noreferrer')
        toast.success(`${channelType} connect opened`, {
          description: 'Complete setup in the new tab, then click Refresh.',
        })
        setShowAddChannel(false)
      } else if (data?.channel) {
        // Channel was created directly
        setChannels((prev) => filterUserVisibleChannels([...prev, data.channel]))
        toast.success(`${channelType} channel connected!`)
        setChannelJustConnected(connectedName)
        setTimeout(() => {
          setChannelJustConnected(null)
          setShowAddChannel(false)
        }, 1500)
      } else {
        toast.success(`${channelType} connect initiated`, {
          description: 'Click Refresh to see your channel.',
        })
        setShowAddChannel(false)
      }

      // Refresh channels list
      fetchChannels()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to connect ${channelType}`)
    } finally {
      setIsCreatingChannel(false)
    }
  }, [assistant.id, fetchChannels, filterUserVisibleChannels])

  // ---- MEMORY HANDLERS ----

  const fetchMemories = useCallback(async (offset = 0, append = false) => {
    setIsLoadingMemories(true)
    try {
      const res = await fetch(
        `/api/assistants/${assistant.id}/memories?limit=50&offset=${offset}`,
      )
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setMemories((prev) => append ? [...prev, ...(data.memories || [])] : (data.memories || []))
      setMemoriesTotal(data.total || 0)
    } catch {
      // Silently fail
    } finally {
      setIsLoadingMemories(false)
    }
  }, [assistant.id])

  // fetchMemories is used by the refresh button — data is server-prefetched

  const handleDeleteMemory = useCallback(
    async (memoryId: string) => {
      setDeletingMemoryId(memoryId)
      try {
        const csrf6 = getCSRFTokenFromCookie()
        const res = await fetch(`/api/assistants/${assistant.id}/memories`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...(csrf6 && { 'x-csrf-token': csrf6 }) },
          body: JSON.stringify({ memoryId }),
        })
        if (!res.ok) throw new Error('Failed')
        setMemories((prev) => prev.filter((m) => m.id !== memoryId))
        setMemoriesTotal((prev) => prev - 1)
        toast.success('Memory deleted')
      } catch {
        toast.error('Failed to delete memory')
      } finally {
        setDeletingMemoryId(null)
      }
    },
    [assistant.id],
  )

  const handleClearAllMemories = useCallback(async () => {
    setIsClearingMemories(true)
    try {
      const csrf7 = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistant.id}/memories`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(csrf7 && { 'x-csrf-token': csrf7 }) },
        body: JSON.stringify({ clearAll: true }),
      })
      if (!res.ok) throw new Error('Failed')
      setMemories([])
      setMemoriesTotal(0)
      toast.success('All memories cleared')
    } catch {
      toast.error('Failed to clear memories')
    } finally {
      setIsClearingMemories(false)
    }
  }, [assistant.id])

  const filteredMemories = memorySearch
    ? memories.filter((m) =>
        m.fact_text.toLowerCase().includes(memorySearch.toLowerCase()),
      )
    : memories

  // ── Config sections — split per-section for targeted re-renders ────

  const avatarSection: ConfigSection = useMemo(() => ({
    id: 'avatar',
    title: 'Avatar',
    icon: <ImageIcon className="h-3.5 w-3.5" />,
    badge: currentAvatar ? 'SET' : null,
    badgeClassName: currentAvatar ? 'bg-emerald-500/15 text-emerald-400' : undefined,
    content: (
      <PanelLayout context={undefined}>
        <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
          <div className="shrink-0 space-y-2">
            <div
              className={cn(
                'relative h-20 w-20 rounded-full p-[2px]',
                isGeneratingAvatar ? 'shadow-[0_0_0_1px_var(--border)]' : '',
              )}
              style={isGeneratingAvatar ? {
                background: `conic-gradient(var(--primary) ${avatarGenerationPercent * 3.6}deg, color-mix(in oklab, var(--border) 78%, transparent) 0deg)`,
              } : undefined}
            >
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-border bg-muted/30">
                {avatarPreviewUrl || currentAvatar?.url ? (
                  <img
                    src={avatarPreviewUrl ?? currentAvatar?.url ?? ''}
                    alt={`${name || assistant.name} avatar`}
                    className={cn('h-full w-full object-cover transition-opacity', avatarPreviewUrl ? 'animate-pulse' : undefined)}
                  />
                ) : (
                  <ImageIcon className={cn('h-7 w-7 text-muted-foreground', isGeneratingAvatar ? 'opacity-30' : undefined)} />
                )}
                {isGeneratingAvatar ? (
                  <>
                    <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_15%,rgba(255,255,255,0.20)_45%,transparent_75%)] animate-pulse" />
                    <div className="absolute inset-0 flex items-center justify-center bg-background/35 backdrop-blur-[1px]">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[10px]">Style</Label>
                <Select value={avatarStylePreset} onValueChange={setAvatarStylePreset}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Style" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVATAR_STYLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px]">Angle</Label>
                <Select value={avatarAngle} onValueChange={setAvatarAngle}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Angle" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVATAR_ANGLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px]">Expression</Label>
                <Select value={avatarExpression} onValueChange={setAvatarExpression}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Expression" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVATAR_EXPRESSION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px]">Background</Label>
                <Select value={avatarBackground} onValueChange={setAvatarBackground}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Background" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVATAR_BACKGROUND_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px]">Gender</Label>
                <Select value={avatarGenderPresentation} onValueChange={setAvatarGenderPresentation}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVATAR_GENDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px]">Pose</Label>
                <Select value={avatarPose} onValueChange={setAvatarPose}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Pose" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVATAR_POSE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5">
              <Label className="text-[11px]">Keep same face</Label>
              <Switch
                checked={avatarLockIdentity}
                onCheckedChange={setAvatarLockIdentity}
                disabled={!currentAvatar?.url || isGeneratingAvatar}
              />
            </div>
            {avatarGenerationError ? (
              <p className="text-[10px] text-red-400">{avatarGenerationError}</p>
            ) : null}
            {isGeneratingAvatar && avatarGenerationStatus ? (
              <p className="text-[10px] text-muted-foreground">{avatarGenerationStatus}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                disabled={isGeneratingAvatar}
                onClick={() => void handleGenerateAvatar()}
              >
                {isGeneratingAvatar ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                {currentAvatar?.url ? 'Regenerate' : 'Generate'}
              </Button>
              {currentAvatar?.id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={isAcceptingAvatar || isGeneratingAvatar}
                  onClick={() => void handleAcceptAvatar()}
                >
                  {isAcceptingAvatar ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                  Accept
                </Button>
              ) : null}
            </div>
            {currentAvatar ? (
              <p className="truncate text-[10px] text-muted-foreground">
                {currentAvatar.provider} / {currentAvatar.model}
              </p>
            ) : null}
          </div>
        </div>
      </PanelLayout>
    ),
  }), [
    assistant.name,
    avatarAngle,
    avatarBackground,
    avatarExpression,
    avatarGenderPresentation,
    avatarGenerationError,
    avatarGenerationPercent,
    avatarGenerationStatus,
    avatarLockIdentity,
    avatarPose,
    avatarPreviewUrl,
    avatarStylePreset,
    currentAvatar,
    handleAcceptAvatar,
    handleGenerateAvatar,
    isAcceptingAvatar,
    isGeneratingAvatar,
    name,
  ])

  const settingsSection: ConfigSection = useMemo(() => ({
    id: 'settings',
    title: 'Model & Settings',
    icon: <Settings2 className="h-3.5 w-3.5" />,
    defaultOpen: true,
    content: (
      <PanelLayout context={undefined}>
        <FormField
          label="Description"
          name="assistant-description"
          type="textarea"
          value={description}
          onChange={setDescription}
          placeholder="What this agent does and when to use it."
          help="Used in project and assistant surfaces to explain the role of this agent."
          rows={3}
        />
        <FormField
          label="System Prompt" name="system-prompt" type="textarea"
          value={systemPrompt} onChange={setSystemPrompt}
          placeholder="You are a helpful agent..."
          help="Defines how this agent behaves, responds, and what it knows. Changes affect future responses only."
          rows={4} className="[&_textarea]:font-mono [&_textarea]:text-sm"
        />
        <div className="space-y-2">
          <Label>Model</Label>
          <ModelSelector value={lucidModel} onChange={setLucidModel} initialModels={initialModels} orgId={workspaceId} />
        </div>
        <div className="space-y-2">
          <Label>Inference routing</Label>
          <Select
            value={trustGateInferenceMode}
            onValueChange={(value) => setTrustGateInferenceMode(value as TrustGateInferenceMode)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select inference routing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="managed">Lucid managed</SelectItem>
              <SelectItem value="byok">BYOK only</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Centralized TrustGate routing. Auto chooses the safest available path; Lucid managed ignores BYOK keys; BYOK only requires an active provider key for the selected model.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Telegram voice replies</Label>
          <Select value={telegramVoiceMode} onValueChange={(value) => setTelegramVoiceMode(value as 'off' | 'auto' | 'always')}>
            <SelectTrigger>
              <SelectValue placeholder="Select voice mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="always">Always</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Auto replies in voice only when the user sent a Telegram voice note. Always tries voice for every Telegram reply.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Telegram voice</Label>
          <div className="flex items-center gap-2">
            <Select
              value={telegramVoiceId || '__default__'}
              onValueChange={(value) => setTelegramVoiceId(value === '__default__' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a Telegram voice" />
              </SelectTrigger>
              <SelectContent>
                {TELEGRAM_VOICE_OPTIONS.map((voice) => (
                  <SelectItem key={voice.value || 'default'} value={voice.value}>
                    {voice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => void handlePreviewTelegramVoice()}>
              {isPreviewingTelegramVoice ? 'Stop' : 'Preview'}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Choose a voice directly in UI. `Onyx` and `Echo` are the strongest masculine options right now.
          </p>
          {telegramVoicePreviewError ? (
            <p className="text-[10px] text-red-400">{telegramVoicePreviewError}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label>Voice style preset</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TELEGRAM_VOICE_STYLE_PRESETS) as TelegramVoiceStylePreset[]).map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setTelegramVoiceInstructions(TELEGRAM_VOICE_STYLE_PRESETS[preset])}
              >
                {preset.charAt(0).toUpperCase() + preset.slice(1)}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Presets fill the style instructions below. You can still edit them manually.
          </p>
        </div>
        <FormField
          label="Voice style instructions"
          name="telegram-voice-instructions"
          type="textarea"
          value={telegramVoiceInstructions}
          onChange={setTelegramVoiceInstructions}
          placeholder="Speak warmly, confidently, and naturally."
          help="Optional style guidance for Telegram voice replies. Use this to add warmth, depth, calmness, or more emotion."
          rows={3}
        />
        <Separator className="border-border/60" />
        <div className="rounded-lg border border-red-500/15 p-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-red-400 text-xs">Delete</Label>
              <p className="text-[10px] text-muted-foreground">Permanently delete this agent</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="h-7 text-xs">
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-background border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete agent</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete &quot;{assistant.name}&quot; and all associated data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-border text-muted-foreground">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </PanelLayout>
    ),
  }), [description, systemPrompt, lucidModel, trustGateInferenceMode, telegramVoiceMode, telegramVoiceId, isDeleting, assistant.name, initialModels, workspaceId, handleDelete])

  const guidedEditSection: ConfigSection = useMemo(() => ({
    id: 'guided-edit',
    title: 'Guided Edit',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    content: (
      <PanelLayout context="Ask Lucid to refine this agent. The AI edits a projected draft first, then you review and apply the assistant-level changes through the normal save path.">
        <GenerationPromptPanel
          id="guided-edit-prompt"
          label="What should change?"
          description="This works on the current agent config. It does not create or deploy a new agent here."
          prompt={guidedEditPrompt}
          onPromptChange={setGuidedEditPrompt}
          placeholder="Make this more direct, tighten the troubleshooting steps, and escalate billing issues faster."
          isGenerating={isGuidedEditLoading}
          hasResult={Boolean(guidedEditResult)}
          onGenerate={() => { void handleRunGuidedEdit() }}
          onClear={() => {
            setGuidedEditPrompt('')
            resetGuidedEdit()
          }}
          compact
        />

        {guidedEditResult ? (
          <GenerationSuggestionCard
            reasoningSummary={guidedEditResult.reasoning_summary}
            warnings={guidedEditResult.warnings}
            className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-3"
          >
            <GenerationModeSummary result={guidedEditResult} title="Suggested path" />
            {guidedEditResult.draft.mode === 'blank-agent' && guidedEditResult.draft.agent ? (
              <>
                <PanelDetailBlock>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</p>
                  <p className="mt-1 text-xs text-foreground">{guidedEditResult.draft.starterName?.trim() || guidedEditResult.draft.project.name}</p>
                </PanelDetailBlock>
                <PanelDetailBlock>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Description</p>
                  <p className="mt-1 text-xs text-muted-foreground">{guidedEditResult.draft.project.description?.trim() || 'No description'}</p>
                </PanelDetailBlock>
                <PanelDetailBlock>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">System prompt</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{guidedEditResult.draft.agent.system_prompt}</p>
                </PanelDetailBlock>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={isApplyingGuidedEdit}
                    onClick={() => { void handleApplyGuidedEdit() }}
                  >
                    {isApplyingGuidedEdit ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    Apply changes
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                This suggestion turns the current agent into a broader project or team setup. Review that in the project creation flow instead of applying it directly here.
              </p>
            )}
          </GenerationSuggestionCard>
        ) : null}
      </PanelLayout>
    ),
  }), [guidedEditPrompt, guidedEditResult, handleApplyGuidedEdit, handleRunGuidedEdit, isApplyingGuidedEdit, isGuidedEditLoading, resetGuidedEdit])

  const channelsSection: ConfigSection = useMemo(() => ({
    id: 'channels',
    title: 'Channels',
    icon: <MessageSquare className="h-3.5 w-3.5" />,
    badge: channels.length || null,
    content: (
      <div className="space-y-3">
        {channelOpsLaunchHref ? (
          <PanelStateCard
            title="QA channel UX"
            subtitle="Run Agent Ops against routing, streaming, media, fallback, and delivery behavior for this agent's connected channels."
            icon={<MessageSquare className="h-4 w-4" />}
            status={(
              <Button asChild size="sm" variant="outline">
                <a href={channelOpsLaunchHref}>
                  Open Agent Ops
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </a>
              </Button>
            )}
          />
        ) : null}
        <AssistantChannelsPanel
          assistantId={assistant.id}
          channels={channels}
          onChannelsChange={setChannels}
          slackShareEnabled={assistant.slack_share_enabled === true}
          onSlackShareEnabledChange={(enabled) => {
            setAssistant((prev) => ({ ...prev, slack_share_enabled: enabled }))
          }}
        />
      </div>
    ),
  }), [assistant.id, assistant.slack_share_enabled, channelOpsLaunchHref, channels])

  const walletSection: ConfigSection = useMemo(() => ({
    id: 'wallet',
    title: 'Wallet',
    icon: <Wallet className="h-3.5 w-3.5" />,
    badge: assistant.wallet_enabled ? 'ON' : null,
    badgeClassName: 'bg-green-500/20 text-green-400',
    content: (
      <AgentWalletTab
        assistantId={assistant.id}
        walletEnabled={assistant.wallet_enabled ?? false}
        wallets={assistant.agent_wallets ?? []}
        onUpdate={(walletEnabled) => {
          // Wallet toggle → lift state instantly so hero "ON" badge + section
          // badge re-render without a server roundtrip. Trading policy saves
          // (no arg) still use router.refresh() to pick up server-side updates.
          if (typeof walletEnabled === 'boolean') {
            setAssistant((prev) => ({ ...prev, wallet_enabled: walletEnabled }))
          } else {
            router.refresh()
          }
        }}
        initialTradingPolicy={initialTradingPolicy}
      />
    ),
  }), [assistant.id, assistant.wallet_enabled, assistant.agent_wallets, initialTradingPolicy, router])

  const memoriesSection: ConfigSection = useMemo(() => ({
    id: 'memories',
    title: 'Memories',
    icon: <Brain className="h-3.5 w-3.5" />,
    badge: memoriesTotal || null,
    content: (
      <PanelLayout context="Facts and preferences learned from conversations.">
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div className="space-y-0.5">
            <Label className="text-xs">{memoryEnabled ? 'Persistent memory' : 'Stateless mode'}</Label>
            <p className="text-[10px] text-muted-foreground">
              {memoryEnabled
                ? 'Stores useful context across conversations'
                : 'No memory retained — for privacy-sensitive or deterministic agents'}
            </p>
          </div>
          <Switch checked={memoryEnabled} onCheckedChange={setMemoryEnabled} />
        </div>
        {memoriesTotal > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => fetchMemories()} disabled={isLoadingMemories}>
              {isLoadingMemories ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
            </Button>
            {confirmClearMemories ? (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setConfirmClearMemories(false)} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border">Cancel</button>
                <button type="button" onClick={() => { setConfirmClearMemories(false); handleClearAllMemories() }} disabled={isClearingMemories} className="text-[11px] text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded border border-red-500/20 hover:border-red-500/40 flex items-center gap-1">
                  {isClearingMemories ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Clear all
                </button>
              </div>
            ) : (
              <Button size="sm" variant="destructive" className="gap-1 h-7 text-xs" onClick={() => setConfirmClearMemories(true)}>
                <Trash2 className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>
        )}
        {memoriesTotal > 0 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Filter..." value={memorySearch} onChange={(e) => setMemorySearch(e.target.value)} className="pl-8 h-8 text-xs border-border" />
          </div>
        )}
        {isLoadingMemories && memories.length === 0 ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filteredMemories.length === 0 ? (
          memorySearch ? (
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground">No matches</p>
            </div>
          ) : memoryEnabled ? (
            <PanelEmptyState
              icon={<Brain className="h-4 w-4 text-muted-foreground" />}
              title="This agent can learn"
              description="Memories build automatically from conversations — facts, preferences, instructions, and context."
              hint="Send a message to start building memory"
            />
          ) : (
            <PanelEmptyState
              icon={<Brain className="h-4 w-4 text-muted-foreground" />}
              title="Memory disabled"
              description="Enable memory above to let this agent learn from conversations."
            />
          )
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1.5">
              {filteredMemories.map((mem) => (
                <div key={mem.id} className="rounded-lg border border-border/60 p-2.5 hover:bg-card/30 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">{mem.fact_text}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-border text-muted-foreground">{mem.category}</Badge>
                        <span>{formatDistanceToNow(new Date(mem.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={() => handleDeleteMemory(mem.id)} disabled={deletingMemoryId === mem.id}>
                      {deletingMemoryId === mem.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>
              ))}
              {!memorySearch && memories.length < memoriesTotal && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs text-muted-foreground"
                  onClick={() => fetchMemories(memories.length, true)}
                  disabled={isLoadingMemories}
                >
                  {isLoadingMemories ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Load more ({memoriesTotal - memories.length} remaining)
                </Button>
              )}
            </div>
          </ScrollArea>
        )}
      </PanelLayout>
    ),
  }), [memoriesTotal, memories, memorySearch, isLoadingMemories, filteredMemories, deletingMemoryId, isClearingMemories, memoryEnabled, setMemoryEnabled, fetchMemories, handleDeleteMemory, handleClearAllMemories, confirmClearMemories])

  const agentOpsSection: ConfigSection = useMemo(() => ({
    id: 'agent-ops',
    title: 'Agent Ops',
    icon: <Shield className="h-3.5 w-3.5" />,
    content: (
      <PanelLayout context="Launch evidence-backed workflows from this agent context without copying IDs, model settings, or project scope by hand.">
        <PanelStateCard
          title="Review this agent"
          subtitle="Check instructions, tool posture, memory policy, runtime readiness, and channel behavior through the shared Agent Ops run contract."
          icon={<Shield className="h-4 w-4" />}
          status={agentOpsLaunchHref ? (
            <Button asChild size="sm">
              <a href={agentOpsLaunchHref}>
                Open Agent Ops
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
        />
      </PanelLayout>
    ),
  }), [agentOpsLaunchHref])

  const skillsSection: ConfigSection = useMemo(() => ({
    id: 'skills',
    title: 'Skills',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    content: (
      <IntegrationProvider assistantId={initialAssistant.id}>
        <UnifiedSkillManager
          assistantId={initialAssistant.id}
          orgId={initialAssistant.org_id}
          initialItems={skills}
          onItemsChange={setSkills}
        />
      </IntegrationProvider>
    ),
  }), [initialAssistant.id, initialAssistant.org_id, skills])

  const runtimeSection: ConfigSection = useMemo(() => ({
    id: 'runtime',
    title: 'Runtime',
    icon: <Cpu className="h-3.5 w-3.5" />,
    content: (
      <AgentRuntimePanel
        agentId={initialAssistant.id}
        agentName={assistant.name || initialAssistant.name}
        orgId={initialAssistant.org_id}
        workspaceSlug={workspaceSlug}
        runtimeId={assistant.runtime_id}
        runtimes={runtimes}
        engine={assistant.engine}
        runtimeFeatureAccess={runtimeFeatureAccess}
        modelHint={lucidModel}
        onEngineChange={(engine) => setAssistant((current) => ({ ...current, engine }))}
        onModelChange={(modelHint) => {
          const nextModel = modelHint ?? 'lucid-auto'
          setLucidModel(nextModel)
          setAssistant((current) => ({ ...current, lucid_model: nextModel }))
        }}
        onRuntimeChange={(runtimeId, runtimeFlavor) => {
          setAssistant((current) => ({
            ...current,
            runtime_id: runtimeId,
            runtime_flavor: runtimeFlavor,
          }))
        }}
      />
    ),
  }), [initialAssistant.id, initialAssistant.name, assistant.name, assistant.runtime_id, assistant.engine, initialAssistant.org_id, lucidModel, runtimeFeatureAccess, runtimes, workspaceSlug])

  const tasksSection: ConfigSection = useMemo(() => ({
    id: 'tasks',
    title: 'Routines',
    icon: <Calendar className="h-3.5 w-3.5" />,
    content: (
      <AgentTasksPanel
        agentId={initialAssistant.id}
        orgId={initialAssistant.org_id}
        initialTasks={initialTasks}
        onTasksChange={setTasks}
      />
    ),
  }), [initialAssistant.id, initialAssistant.org_id, initialTasks])

  const teamSection: ConfigSection = useMemo(() => ({
    id: 'team',
    title: 'Team',
    icon: <Users className="h-3.5 w-3.5" />,
    badge: assistant.crew_id ? 'TEAM' : null,
    badgeClassName: assistant.crew_id ? 'bg-emerald-500/15 text-emerald-400' : undefined,
    content: (
      <AgentTeamPanel
        assistantId={initialAssistant.id}
        crewId={assistant.crew_id}
        orgId={initialAssistant.org_id}
        projectId={initialAssistant.project_id}
        workspaceSlug={workspaceSlug}
        projectSlug={projectSlug}
      />
    ),
  }), [assistant.crew_id, initialAssistant.id, initialAssistant.org_id, initialAssistant.project_id, projectSlug, workspaceSlug])

  const operatingContextSection: ConfigSection = useMemo(() => ({
    id: 'operating-context',
    title: 'Operating Context',
    icon: <Fingerprint className="h-3.5 w-3.5" />,
    content: (
      <AgentOperatingContextPanel
        assistantId={initialAssistant.id}
        assistantName={assistant.name || initialAssistant.name}
      />
    ),
  }), [assistant.name, initialAssistant.id, initialAssistant.name])

  const agentCardSection: ConfigSection = useMemo(() => ({
    id: 'agent-card',
    title: 'Agent Card',
    icon: <FileJson className="h-3.5 w-3.5" />,
    content: <AgentCardPanel assistantId={initialAssistant.id} />,
  }), [initialAssistant.id])

  const healthSection: ConfigSection = useMemo(() => ({
    id: 'health',
    title: 'Health',
    icon: <Activity className="h-3.5 w-3.5" />,
    badge: healthData?.overall_score ?? null,
    content: (
      <AgentHealthPanel
        healthScore={healthData?.overall_score ?? null}
        dimensionScores={healthData?.dimension_scores}
        fleetPercentile={healthData?.fleet_percentile}
      />
    ),
  }), [healthData])

  const guardrailsSection: ConfigSection = useMemo(() => ({
    id: 'guardrails',
    title: 'Guardrails',
    icon: <Shield className="h-3.5 w-3.5" />,
    content: (
      <AgentGuardrailsPanel agentId={initialAssistant.id} />
    ),
  }), [initialAssistant.id])

  const verificationSection: ConfigSection = useMemo(() => ({
    id: 'verification',
    title: 'Verification',
    icon: <Fingerprint className="h-3.5 w-3.5" />,
    badge: null,
    badgeClassName: undefined,
    content: (
      <AgentVerificationPanel
        assistantId={initialAssistant.id}
        passportId={initialAssistant.passport_id}
        initialPassport={initialPassport}
      />
    ),
  }), [initialAssistant.id, initialAssistant.passport_id, initialPassport])

  const nativeMutationSection: ConfigSection = useMemo(() => ({
    id: 'native-mutation-candidates',
    title: 'Native Mutation Candidates',
    icon: <RefreshCw className="h-3.5 w-3.5" />,
    badge: nativeMutationCandidates.length || null,
    content: (
      <PanelLayout context="Recent native memory and skill mutations proposed or executed through Hermes-native runtime behavior.">
        {nativeMutationCandidates.length === 0 ? (
          <PanelEmptyState
            icon={<RefreshCw className="h-4 w-4 text-muted-foreground" />}
            title="No native mutation candidates"
            description="Candidate memory or skill mutations will appear here once the runtime proposes or records them."
          />
        ) : (
          <div className="space-y-2">
            {nativeMutationCandidates.map((candidate) => {
              const argPreview = JSON.stringify(candidate.tool_args)
              const isPending = candidate.status === 'pending'
              return (
                <PanelDetailBlock key={candidate.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {formatMutationKindLabel(candidate.mutation_kind)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {candidate.reason}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant="outline" className="h-5 border-border text-[9px] text-muted-foreground">
                        {candidate.runtime_flavor}
                      </Badge>
                      <Badge className={cn('h-5 text-[9px]', getCandidateStatusBadgeClass(candidate.status))}>
                        {formatCandidateStatusLabel(candidate.status)}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
                    <div>Tool: <span className="text-foreground/80">{candidate.tool_name}</span></div>
                    <div>Source: <span className="text-foreground/80">{candidate.source}</span></div>
                    <div>Engine: <span className="text-foreground/80">{candidate.engine}</span></div>
                    <div>{formatDistanceToNow(new Date(candidate.created_at), { addSuffix: true })}</div>
                  </div>
                  {(candidate.promotion_scope || candidate.applied_record_id || candidate.review_notes) && (
                    <div className="grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
                      {candidate.promotion_scope ? (
                        <div>Scope: <span className="text-foreground/80">{candidate.promotion_scope}</span></div>
                      ) : null}
                      {candidate.applied_record_id ? (
                        <div>Applied: <span className="font-mono text-foreground/80">{candidate.applied_record_id.slice(0, 8)}</span></div>
                      ) : null}
                      {candidate.review_notes ? (
                        <div className="sm:col-span-2">Notes: <span className="text-foreground/80">{candidate.review_notes}</span></div>
                      ) : null}
                    </div>
                  )}
                  {argPreview && argPreview !== '{}' && (
                    <div className="rounded border border-border/60 bg-muted/20 px-2 py-1.5">
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground/70">Args</p>
                      <p className="mt-1 line-clamp-3 break-all font-mono text-[10px] text-muted-foreground">
                        {argPreview}
                      </p>
                    </div>
                  )}
                  {isPending ? (
                    <div className="space-y-2 rounded border border-border/60 bg-muted/10 px-2 py-2">
                      <Textarea
                        value={candidateReviewNotes[candidate.id] ?? ''}
                        onChange={(event) => {
                          const value = event.target.value
                          setCandidateReviewNotes((prev) => ({ ...prev, [candidate.id]: value }))
                        }}
                        placeholder="Review notes (optional)"
                        rows={2}
                        className="min-h-[56px] text-xs"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={busyCandidateAction !== null}
                          onClick={() => void reviewNativeMutationCandidate(candidate.id, 'approve')}
                        >
                          {busyCandidateAction === `${candidate.id}:approve:none` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          disabled={busyCandidateAction !== null}
                          onClick={() => void reviewNativeMutationCandidate(candidate.id, 'reject')}
                        >
                          {busyCandidateAction === `${candidate.id}:reject:none` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={busyCandidateAction !== null}
                          onClick={() => void reviewNativeMutationCandidate(candidate.id, 'promote', 'assistant_durable')}
                        >
                          {busyCandidateAction === `${candidate.id}:promote:assistant_durable` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          Promote to agent
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={busyCandidateAction !== null}
                          onClick={() => void reviewNativeMutationCandidate(candidate.id, 'promote', 'org_durable')}
                        >
                          {busyCandidateAction === `${candidate.id}:promote:org_durable` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          Promote to org
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </PanelDetailBlock>
              )
            })}
          </div>
        )}
      </PanelLayout>
    ),
  }), [busyCandidateAction, candidateReviewNotes, nativeMutationCandidates, reviewNativeMutationCandidate])

  const configSections: ConfigSection[] = useMemo(() => [
    // Engage — agent capabilities and connections
    channelsSection,
    agentOpsSection,
    skillsSection,
    memoriesSection,
    teamSection,
    agentCardSection,
    operatingContextSection,
    tasksSection,
    // Configure — settings, safety, identity
    avatarSection,
    guidedEditSection,
    guardrailsSection,
    nativeMutationSection,
    walletSection,
    settingsSection,
    healthSection,
    runtimeSection,
    verificationSection,
  ], [
    channelsSection, agentOpsSection, skillsSection, memoriesSection, teamSection, agentCardSection, operatingContextSection, tasksSection,
    avatarSection, guidedEditSection, guardrailsSection, nativeMutationSection, walletSection, settingsSection, healthSection,
    runtimeSection, verificationSection,
  ])

  return (
    <>
      <AssistantCommandCenter
        name={name}
        onNameChange={setName}
        model={lucidModel}
        active={isActive}
        saveStatus={autoSaveStatus}
        onBack={() => router.push(backHref ?? fallbackAgentsHref)}
        onSave={saveNow}
        onToggleActive={setIsActive}
        configSections={configSections}
        chatProps={{
          assistantId: initialAssistant.id,
          assistantName: name,
          lucidModel: assistant.lucid_model,
          orgId: initialAssistant.org_id,
          isActive,
        }}
        activityEvents={activityEvents}
        feedLoading={feedLoading}
        feedConnected={feedConnected}
        healthData={healthData}
        channels={channels}
        introspectionData={introspectionData}
        memoriesTotal={memories.length}
        memoryEnabled={memoryEnabled}
        runtimeId={assistant.runtime_id}
        runtimes={runtimes}
        tasks={tasks}
        walletEnabled={assistant.wallet_enabled ?? false}
        skillsCount={activeSkillsCount}
        skills={skills}
        recentRunCount={activityEvents.filter(e => e.event_type === 'run_finished' || e.event_type === 'message_sent').length}
        mission={systemPrompt ? systemPrompt.split(/[.\n]/)[0]?.trim() || undefined : undefined}
        engine={assistant.engine}
        onSaveAsTemplate={() => setSaveAsTemplateOpen(true)}
        onLiveSurfacesChange={setLiveSurfaces}
        dialogs={
          <SaveAsTemplateDialog
            open={saveAsTemplateOpen}
            onOpenChange={setSaveAsTemplateOpen}
            orgId={initialAssistant.org_id}
            agentName={name}
            agentDescription={assistant.description ?? undefined}
            systemPrompt={systemPrompt}
            memoryEnabled={memoryEnabled}
            memoryStrategy={assistant.memory_strategy ?? 'auto'}
            soulContent={(assistant as typeof assistant & { soul_content?: string | null }).soul_content ?? undefined}
            modelHint={assistant.lucid_model}
            approvalRequiredTools={(assistant as typeof assistant & { approval_required_tools?: string[] | null }).approval_required_tools ?? undefined}
          />
        }
      />
    </>
  )
}

function formatMutationKindLabel(
  mutationKind: import('@/lib/db/mission-control').NativeMutationCandidateRecord['mutation_kind'],
) {
  switch (mutationKind) {
    case 'memory_write':
      return 'Memory write'
    case 'skill_create':
      return 'Skill create'
    case 'skill_update':
      return 'Skill update'
    case 'skill_delete':
      return 'Skill delete'
    default:
      return mutationKind
  }
}

function formatCandidateStatusLabel(
  status: import('@/lib/db/mission-control').NativeMutationCandidateRecord['status'],
) {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'promoted':
      return 'Promoted'
    default:
      return status
  }
}

function getCandidateStatusBadgeClass(
  status: import('@/lib/db/mission-control').NativeMutationCandidateRecord['status'],
) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-400'
    case 'rejected':
      return 'bg-red-500/15 text-red-400'
    case 'promoted':
      return 'bg-blue-500/15 text-blue-400'
    case 'pending':
    default:
      return 'bg-amber-500/15 text-amber-400'
  }
}
