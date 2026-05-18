'use client'

/**
 * BuildSummaryRows — Compact system state for the agent detail page.
 *
 * Linear/Apple style: no card containers, just clean rows.
 * Two row types:
 *   - State rows: text-only (health, runtime, guardrails, cost)
 *   - Identity rows: stacked avatars with logos (channels, skills)
 */

import {
  Activity,
  Cpu,
  Brain,
  Shield,
  Calendar,
  DollarSign,
  ChevronRight,
  Globe,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AvatarStack } from '@/components/ui/avatar-stack'
import { CapabilityAvatarStack } from '@/components/ui/capability-avatar-stack'
import { LogoIcon } from '@/components/ui/logo-icon'
import { EngineIcon, getEngineLabel } from '@/components/icons/engine-icon'
import { resolveCapabilityIconItems } from '@/lib/capabilities/icon-resolver'
import type { AgentHealthScore } from '@/hooks/use-health-score'
import type { DedicatedRuntime } from '@/lib/mission-control/types'
import type {
  SummaryChannelItem,
  SummarySkillItem,
  SummaryTaskItem,
} from '@/components/assistant/view-models'

interface BuildSummaryRowsProps {
  healthData: AgentHealthScore | null
  runtimeId?: string | null
  runtimes: DedicatedRuntime[]
  memoriesTotal: number
  memoryEnabled: boolean
  tasks?: SummaryTaskItem[]
  channels?: SummaryChannelItem[]
  skills?: SummarySkillItem[]
  showPendingSkillSelections?: boolean
  costTodayUsd?: number
  engine?: string | null
  runtimeLabelOverride?: string | null
  showEngine?: boolean
  showGuardrails?: boolean
  showCost?: boolean
  onTabChange?: (tab: string) => void
  onAddChannel?: () => void
  onAddSkill?: () => void
}

// =============================================================================
// TEXT ROW — state/config rows
// =============================================================================

function Row({
  icon,
  label,
  value,
  valueColor,
  action,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  valueColor?: string
  action?: { label: string; onClick: () => void }
  onClick?: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-1 py-3',
        'border-b border-border last:border-b-0',
        onClick && 'cursor-pointer hover:bg-accent rounded-sm transition-colors duration-120',
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick() } : undefined}
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-[11px] text-muted-foreground uppercase tracking-wider w-24 shrink-0">
        {label}
      </span>
      <span className={cn('text-sm font-mono flex-1', valueColor ?? 'text-foreground')}>
        {value}
      </span>
      {action && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); action.onClick() }}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-150 flex items-center gap-0.5 shrink-0"
        >
          {action.label}
          <ChevronRight className="h-2.5 w-2.5" />
        </button>
      )}
      {!action && onClick && (
        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
      )}
    </div>
  )
}

// =============================================================================
// BUILD SUMMARY ROWS
// =============================================================================

export function BuildSummaryRows({
  healthData,
  runtimeId,
  runtimes,
  memoriesTotal,
  memoryEnabled,
  tasks = [],
  channels = [],
  skills = [],
  showPendingSkillSelections = false,
  costTodayUsd = 0,
  engine,
  runtimeLabelOverride,
  showEngine = true,
  showGuardrails = true,
  showCost = true,
  onTabChange,
  onAddChannel,
  onAddSkill,
}: BuildSummaryRowsProps) {
  const healthScore = healthData?.overall_score ?? null
  const healthValue = healthScore != null ? healthScore : 'Ready'
  const healthColor =
    healthScore == null ? 'text-foreground' :
    healthScore > 75 ? 'text-emerald-400' :
    healthScore > 40 ? 'text-amber-400' : 'text-red-400'

  const runtime = runtimeId ? runtimes.find((r) => r.id === runtimeId) : null
  // shared = no runtime, dedicated = Lucid-managed, byo = user's own infra (show provider)
  const runtimeLabel = runtimeLabelOverride ?? (!runtimeId ? 'Lucid Cloud (Shared)'
    : runtime?.runtimeTier === 'byo' ? (runtime.provider ?? 'BYO')
    : 'Lucid Cloud (Dedicated)')

  const activeTasks = tasks.filter(
    (t) => t.enabled && (t.status === 'pending' || t.status === 'claimed' || t.status === 'running'),
  ).length
  const suggestedTasks = tasks.filter((t) => !t.enabled && t.status === 'cancelled').length
  const taskLabel = activeTasks > 0
    ? `${activeTasks} scheduled`
    : suggestedTasks > 0
      ? `${suggestedTasks} suggested`
      : tasks.length > 0
        ? `${tasks.length} configured`
        : 'None'

  const memoryLabel = !memoryEnabled
    ? 'Disabled'
    : memoriesTotal === 0
      ? 'Enabled, no facts yet'
      : `${memoriesTotal} facts`

  // Channel items for AvatarStack
  const channelItems = channels
    .filter((channel) => channel.isActive)
    .map((channel) => ({ id: channel.id, label: channel.label, _type: channel.slug }))

  // Skill items for AvatarStack — integrations only count as enabled when the
  // underlying connection is still live. A disconnected integration remains
  // installed, but should not keep showing in the active avatar stack.
  const enabledSkills = skills.filter((s) => {
    if (!s.installed || !s.isActive) return false
    if (s.authProvider && !showPendingSkillSelections) return s.connectionStatus === 'connected'
    return true
  })
  const skillItems = resolveCapabilityIconItems(enabledSkills.map((s) => ({
    id: s.id,
    slug: s.slug,
    label: s.label,
    category: s.category,
    section: s.section,
    always_on: s.alwaysOn,
    item_type: 'skill',
  })))
  const enabledCount = enabledSkills.length

  return (
    <div className="px-14 pb-10 pt-8 max-w-[860px]">
      {/* Core — always-relevant state, stronger visual weight */}
      <div className="mb-10">
        <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-2.5 font-medium">System</p>
        <Row
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Health"
          value={healthValue}
          valueColor={healthColor}
          onClick={() => onTabChange?.('health')}
        />
        {showEngine ? (
          <div
            className={cn(
              'flex items-center gap-3 px-1 py-3',
              'border-b border-border last:border-b-0',
              'cursor-pointer hover:bg-accent rounded-sm transition-colors duration-120',
            )}
            onClick={() => onTabChange?.('engine')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onTabChange?.('engine') }}
          >
            <span className="text-muted-foreground shrink-0"><Cpu className="h-3.5 w-3.5" /></span>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider w-24 shrink-0">Engine</span>
            <span className="text-sm font-mono text-foreground flex-1 flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 size-5 flex items-center justify-center overflow-hidden rounded-sm">
                <EngineIcon engine={engine ?? 'openclaw'} size={20} className="!w-5 !h-5" />
              </span>
              <span className="truncate">{getEngineLabel(engine)}</span>
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          </div>
        ) : null}
        <div
          className={cn(
            'flex items-center gap-3 px-1 py-3',
            'border-b border-border last:border-b-0',
            'cursor-pointer hover:bg-accent rounded-sm transition-colors duration-120',
          )}
          onClick={() => onTabChange?.('channels')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onTabChange?.('channels') }}
        >
          <span className="text-muted-foreground shrink-0"><Globe className="h-3.5 w-3.5" /></span>
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider w-24 shrink-0">Channels</span>
          <div className="flex-1 min-w-0">
            {channelItems.length > 0 ? (
              <AvatarStack
                items={channelItems}
                renderIcon={(item, size) => <LogoIcon slug={item._type} size={size} className="w-full h-full object-contain" />}
                max={3}
                onAdd={onAddChannel}
                addTitle="Connect channel"
                className="opacity-100"
              />
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-mono text-muted-foreground">None connected</span>
                {onAddChannel && (
                  <AvatarStack
                    items={[]}
                    renderIcon={() => null}
                    avatarClassName="!size-7"
                    iconSize={16}
                    onAdd={onAddChannel}
                    addTitle="Connect channel"
                    className="opacity-100"
                  />
                )}
              </div>
            )}
          </div>
          {!onAddChannel && (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
        </div>
        <Row
          icon={<Cpu className="h-3.5 w-3.5" />}
          label="Runtime"
          value={runtimeLabel}
          onClick={() => onTabChange?.('runtime')}
        />
        {showGuardrails ? (
          <Row
            icon={<Shield className="h-3.5 w-3.5" />}
            label="Guardrails"
            value="Configured"
            onClick={() => onTabChange?.('guardrails')}
          />
        ) : null}
      </div>

      {/* Configuration — secondary, lighter weight */}
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-2.5">Configuration</p>
        <Row
          icon={<Brain className="h-3.5 w-3.5" />}
          label="Memory"
          value={memoryLabel}
          onClick={() => onTabChange?.('memories')}
        />
        <div
          className={cn(
            'flex items-center gap-3 px-1 py-3',
            'border-b border-border last:border-b-0',
            'cursor-pointer hover:bg-accent rounded-sm transition-colors duration-120',
          )}
          onClick={() => onTabChange?.('skills')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onTabChange?.('skills') }}
        >
          <span className="text-muted-foreground shrink-0"><Sparkles className="h-3.5 w-3.5" /></span>
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider w-24 shrink-0">Skills</span>
          <div className="flex-1 min-w-0">
            {skillItems.length > 0 ? (
              <CapabilityAvatarStack
                items={skillItems}
                max={3}
                onAdd={onAddSkill}
                addTitle="Add skill"
                className="opacity-100"
              />
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-mono text-muted-foreground">
                  {enabledCount > 0 ? `${enabledCount} enabled` : 'No skills added'}
                </span>
                {onAddSkill && (
                  <AvatarStack
                    items={[]}
                    renderIcon={() => null}
                    avatarClassName="!size-7"
                    iconSize={16}
                    onAdd={onAddSkill}
                    addTitle="Add skill"
                    className="opacity-100"
                  />
                )}
              </div>
            )}
          </div>
          {!onAddSkill && (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
        </div>
        <Row
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Tasks"
          value={taskLabel}
          onClick={() => onTabChange?.('tasks')}
        />
        {showCost ? (
          <Row
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label="Cost"
            value={`$${costTodayUsd.toFixed(2)} today`}
            onClick={() => onTabChange?.('health')}
          />
        ) : null}
      </div>
    </div>
  )
}
