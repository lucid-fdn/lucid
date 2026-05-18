'use client'

import type { ChannelHint, ScheduleHint } from '@contracts/template'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { CHANNEL_METADATA, isUserVisibleChannelType, type ChannelType } from '@/lib/channels/types'
import type { ScheduledTask, ScheduledTaskStatus } from '@/lib/mission-control/types'
import type { AgentChannel as AssistantChannel } from '@/types/agent'

export interface SummaryChannelItem {
  id: string
  slug: string
  label: string
  isActive: boolean
}

export interface SummarySkillItem {
  id: string
  slug: string
  label: string
  category?: string
  section?: UnifiedSkillItem['section']
  installed: boolean
  isActive: boolean
  alwaysOn?: boolean
  authProvider?: string | null
  connectionStatus?: UnifiedSkillItem['connection_status']
}

export interface SummaryTaskItem {
  id: string
  enabled: boolean
  status: ScheduledTaskStatus
}

export function mapAssistantChannelsToSummaryItems(channels: AssistantChannel[] = []): SummaryChannelItem[] {
  return channels
    .filter((channel) => channel.is_active)
    .filter((channel) => isUserVisibleChannelType(channel.channel_type))
    .map((channel) => ({
      id: channel.id,
      slug: channel.channel_type,
      label: CHANNEL_METADATA[channel.channel_type as ChannelType]?.name ?? channel.channel_type,
      isActive: channel.is_active,
    }))
}

export function mapChannelHintsToSummaryItems(channelHints: ChannelHint[] = []): SummaryChannelItem[] {
  return channelHints
    .filter((channel) => channel.required ?? true)
    .filter((channel) => isUserVisibleChannelType(channel.channel_type))
    .map((channel, index) => ({
      id: `builder-channel:${channel.channel_type}:${index}`,
      slug: channel.channel_type,
      label: CHANNEL_METADATA[channel.channel_type as ChannelType]?.name ?? channel.channel_type,
      isActive: channel.required ?? true,
    }))
}

export function mapUnifiedSkillsToSummaryItems(skills: UnifiedSkillItem[] = []): SummarySkillItem[] {
  return skills.map((skill) => ({
    id: skill.id,
    slug: skill.slug,
    label: skill.name,
    category: skill.category,
    section: skill.section,
    installed: skill.installed,
    isActive: skill.is_active,
    alwaysOn: skill.always_on,
    authProvider: skill.auth_provider,
    connectionStatus: skill.connection_status,
  }))
}

export function mapScheduledTasksToSummaryItems(tasks: ScheduledTask[] = []): SummaryTaskItem[] {
  return tasks.map((task) => ({
    id: task.id,
    enabled: task.enabled,
    status: task.status,
  }))
}

export function mapScheduleHintsToSummaryItems(scheduleHints: ScheduleHint[] = []): SummaryTaskItem[] {
  return scheduleHints.map((schedule, index) => ({
    id: `builder-task:${index}`,
    enabled: !schedule.optional,
    status: schedule.optional ? 'cancelled' : 'pending',
  }))
}

export function mapScheduleHintsToControlledTasks(scheduleHints: ScheduleHint[] = []): ScheduledTask[] {
  const now = new Date().toISOString()
  return scheduleHints.map((schedule, index) => ({
    id: `builder-task:${index}`,
    assistant_id: 'builder-draft',
    org_id: 'builder-draft',
    name: schedule.description || `Schedule ${index + 1}`,
    description: schedule.description || null,
    task_prompt: schedule.prompt,
    cron_expression: schedule.cron,
    timezone: 'UTC',
    run_at: null,
    status: schedule.optional ? 'cancelled' : 'pending',
    last_run_at: null,
    last_error: null,
    next_run_at: null,
    run_count: 0,
    retry_count: 0,
    max_retries: 0,
    enabled: !schedule.optional,
    webhook_url: null,
    created_at: now,
    updated_at: now,
  }))
}

export function mapControlledTasksToScheduleHints(tasks: ScheduledTask[] = []): ScheduleHint[] {
  return tasks.map((task) => ({
    cron: task.cron_expression ?? '',
    prompt: task.task_prompt,
    description: task.description ?? task.name,
    optional: !task.enabled,
  }))
}
