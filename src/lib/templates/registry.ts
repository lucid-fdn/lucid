import supportAgent from './seeds/support-agent.json'
import personalAgent from './seeds/personal-agent.json'
import devMonitor from './seeds/dev-monitor.json'
import contentPipeline from './seeds/content-pipeline.json'
import brandMonitor from './seeds/brand-monitor.json'
import salesAssistant from './seeds/sales-assistant.json'
import contentMachine from './seeds/content-machine.json'
import competitiveIntel from './seeds/competitive-intel.json'
import tier1Support from './seeds/tier1-support.json'
import churnRadar from './seeds/churn-radar.json'
import ceoBriefing from './seeds/ceo-briefing.json'
import contractSentinel from './seeds/contract-sentinel.json'
import socialMediaManager from './seeds/social-media-manager.json'
import salesOutreachLemlist from './seeds/sales-outreach-lemlist.json'
import marketingCampaign from './seeds/marketing-campaign.json'
import socialPerformance from './seeds/social-performance.json'
import npsPipeline from './seeds/nps-pipeline.json'
import aiVideoProducer from './seeds/ai-video-producer.json'
import prospectIntelligence from './seeds/prospect-intelligence.json'

import type { AgentTemplateSpec, TeamTemplateSpec } from '@contracts/template'
import {
  templateRegistrySeedSchema,
  type TemplateRegistrySeedInput,
} from './validation'

export type TemplateRegistrySeed = {
  slug: string
  name: string
  description?: string
  category: string
  kind: 'agent' | 'team'
  tags?: string[]
  preview_prompt?: string
  spec: AgentTemplateSpec | TeamTemplateSpec
  params?: unknown[]
  version?: string
}

export interface TemplateRegistryEntry {
  template: TemplateRegistrySeed
  starter: boolean
  advanced: boolean
  recommendedForOnboarding: boolean
  quickCreateRuntimeMode?: 'shared' | 'dedicated' | 'byo'
  archetype?: 'personal' | 'executive' | 'support' | 'sales' | 'research' | 'monitoring' | 'marketing' | 'content' | 'operations'
  recommendedIntegrations?: string[]
  intentKeywords?: string[]
  antiKeywords?: string[]
}

function parseRegistrySeed(input: unknown): TemplateRegistrySeed {
  const parsed = templateRegistrySeedSchema.parse(input) as TemplateRegistrySeedInput

  return {
    ...parsed,
    spec: parsed.spec as AgentTemplateSpec | TeamTemplateSpec,
  }
}

const registryEntries: TemplateRegistryEntry[] = [
  {
    template: parseRegistrySeed(personalAgent),
    starter: true,
    advanced: false,
    recommendedForOnboarding: true,
    quickCreateRuntimeMode: 'shared',
    archetype: 'personal',
    recommendedIntegrations: ['email', 'calendar', 'tasks', 'notes'],
    intentKeywords: ['personal agent', 'personal assistant', 'daily assistant', 'my assistant'],
    antiKeywords: ['sales outreach', 'prospecting', 'campaign launch'],
  },
  {
    template: parseRegistrySeed(salesAssistant),
    starter: false,
    advanced: false,
    recommendedForOnboarding: false,
    archetype: 'sales',
    recommendedIntegrations: ['crm', 'email', 'tasks'],
    intentKeywords: ['sales assistant', 'pipeline assistant', 'crm assistant', 'lead follow-up'],
    antiKeywords: ['daily assistant', 'personal assistant', 'helpdesk', 'support inbox'],
  },
  { template: parseRegistrySeed(contentPipeline), starter: true, advanced: true, recommendedForOnboarding: false, quickCreateRuntimeMode: 'dedicated' },
  {
    template: parseRegistrySeed(supportAgent),
    starter: true,
    advanced: false,
    recommendedForOnboarding: true,
    quickCreateRuntimeMode: 'shared',
    archetype: 'support',
    recommendedIntegrations: ['email', 'slack', 'stripe'],
    intentKeywords: ['support agent', 'customer support', 'helpdesk', 'billing support', 'support inbox'],
    antiKeywords: ['outbound sales', 'daily planning', 'content creation'],
  },
  { template: parseRegistrySeed(contentMachine), starter: false, advanced: true, recommendedForOnboarding: false },
  {
    template: parseRegistrySeed(competitiveIntel),
    starter: false,
    advanced: false,
    recommendedForOnboarding: false,
    archetype: 'research',
    recommendedIntegrations: ['notes', 'tasks'],
    intentKeywords: ['competitive intelligence', 'market research', 'research brief', 'competitor tracking'],
    antiKeywords: ['personal assistant', 'outbound sales'],
  },
  {
    template: parseRegistrySeed(tier1Support),
    starter: false,
    advanced: false,
    recommendedForOnboarding: false,
    archetype: 'support',
    recommendedIntegrations: ['email', 'slack'],
    intentKeywords: ['tier 1 support', 'ticket triage', 'customer triage', 'support escalation'],
    antiKeywords: ['prospecting', 'campaign launch'],
  },
  {
    template: parseRegistrySeed(churnRadar),
    starter: false,
    advanced: false,
    recommendedForOnboarding: false,
    archetype: 'monitoring',
    recommendedIntegrations: ['slack', 'email'],
    intentKeywords: ['churn radar', 'retention alerts', 'risk monitoring', 'customer health'],
    antiKeywords: ['daily assistant', 'outbound sequence'],
  },
  {
    template: parseRegistrySeed(ceoBriefing),
    starter: false,
    advanced: true,
    recommendedForOnboarding: false,
    archetype: 'executive',
    intentKeywords: ['ceo brief', 'executive brief', 'leadership briefing', 'weekly executive report'],
    antiKeywords: ['outbound prospecting', 'sales sequence'],
  },
  {
    template: parseRegistrySeed(brandMonitor),
    starter: true,
    advanced: false,
    recommendedForOnboarding: false,
    quickCreateRuntimeMode: 'dedicated',
    archetype: 'monitoring',
    recommendedIntegrations: ['slack', 'discord'],
    intentKeywords: ['brand watch', 'brand monitor', 'mention tracking', 'social listening'],
    antiKeywords: ['personal assistant', 'crm follow-up'],
  },
  {
    template: parseRegistrySeed(contractSentinel),
    starter: false,
    advanced: false,
    recommendedForOnboarding: false,
    archetype: 'operations',
    recommendedIntegrations: ['email', 'notes'],
    intentKeywords: ['contract review', 'legal ops', 'compliance monitor', 'renewal tracking', 'clause review'],
    antiKeywords: ['daily assistant', 'outbound prospecting'],
  },
  {
    template: parseRegistrySeed(socialMediaManager),
    starter: false,
    advanced: true,
    recommendedForOnboarding: false,
    archetype: 'marketing',
    recommendedIntegrations: ['slack', 'notes'],
    intentKeywords: ['social media manager', 'content calendar', 'social publishing', 'community posts'],
    antiKeywords: ['personal assistant', 'helpdesk'],
  },
  {
    template: parseRegistrySeed(salesOutreachLemlist),
    starter: false,
    advanced: true,
    recommendedForOnboarding: false,
    archetype: 'sales',
    intentKeywords: ['sales outreach', 'outbound prospecting', 'lemlist campaign', 'prospect list'],
    antiKeywords: ['personal assistant', 'daily assistant', 'calendar planning', 'task management'],
  },
  {
    template: parseRegistrySeed(marketingCampaign),
    starter: false,
    advanced: true,
    recommendedForOnboarding: false,
    archetype: 'marketing',
    recommendedIntegrations: ['email', 'slack', 'notes'],
    intentKeywords: ['marketing campaign', 'launch campaign', 'campaign planner', 'growth campaign'],
    antiKeywords: ['daily assistant', 'support inbox'],
  },
  {
    template: parseRegistrySeed(devMonitor),
    starter: true,
    advanced: false,
    recommendedForOnboarding: false,
    quickCreateRuntimeMode: 'dedicated',
    archetype: 'monitoring',
    recommendedIntegrations: ['slack', 'email'],
    intentKeywords: ['dev monitor', 'incident alerts', 'production monitor', 'engineering alerts'],
    antiKeywords: ['calendar planning', 'prospecting'],
  },
  {
    template: parseRegistrySeed(socialPerformance),
    starter: false,
    advanced: false,
    recommendedForOnboarding: false,
    archetype: 'marketing',
    recommendedIntegrations: ['slack', 'notes'],
    intentKeywords: ['social performance', 'engagement report', 'campaign analytics'],
    antiKeywords: ['daily assistant', 'support triage'],
  },
  {
    template: parseRegistrySeed(npsPipeline),
    starter: false,
    advanced: false,
    recommendedForOnboarding: false,
    archetype: 'operations',
    recommendedIntegrations: ['email', 'slack'],
    intentKeywords: ['nps follow-up', 'survey pipeline', 'feedback routing', 'customer feedback loop'],
    antiKeywords: ['daily assistant', 'sales outreach'],
  },
  { template: parseRegistrySeed(aiVideoProducer), starter: false, advanced: true, recommendedForOnboarding: false, archetype: 'content' },
  {
    template: parseRegistrySeed(prospectIntelligence),
    starter: false,
    advanced: false,
    recommendedForOnboarding: false,
    archetype: 'sales',
    recommendedIntegrations: ['crm', 'email', 'notes'],
    intentKeywords: ['prospect intelligence', 'account research', 'lead research', 'sales research'],
    antiKeywords: ['personal assistant', 'support ops'],
  },
]

export const templateRegistryEntries = registryEntries

export function getPlatformTemplateSeeds(): TemplateRegistrySeed[] {
  return templateRegistryEntries.map((entry) => entry.template)
}

export function getStarterTemplateRegistryEntries(): TemplateRegistryEntry[] {
  return templateRegistryEntries.filter((entry) => entry.starter)
}

export function getTemplateRegistryEntryBySlug(slug: string): TemplateRegistryEntry | null {
  return templateRegistryEntries.find((entry) => entry.template.slug === slug) ?? null
}

export function getTemplateRecommendationHintsBySlug(slug: string): {
  archetype: TemplateRegistryEntry['archetype'] | null
  recommendedIntegrations: string[]
  intentKeywords: string[]
  antiKeywords: string[]
} | null {
  const entry = getTemplateRegistryEntryBySlug(slug)
  if (!entry) return null
  return {
    archetype: entry.archetype ?? null,
    recommendedIntegrations: entry.recommendedIntegrations ?? [],
    intentKeywords: entry.intentKeywords ?? [],
    antiKeywords: entry.antiKeywords ?? [],
  }
}
