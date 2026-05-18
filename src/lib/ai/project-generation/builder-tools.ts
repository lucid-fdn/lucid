import 'server-only'

import { tool } from 'ai'
import { z } from 'zod'
import type { TemplateCatalogEntry } from '@contracts/template'

import type { BuilderCapabilityRegistry } from './capability-registry'
import { planBuilderTeamTopology, recommendRuntimeMode } from './team-planner'
import { shortlistTemplates } from './template-shortlist'
import type { GenerationDraft } from './schemas'

export function createBuilderPlanningTools(input: {
  prompt: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  runtimeMode?: 'shared' | 'dedicated' | 'byo'
  draft?: GenerationDraft
  templates: TemplateCatalogEntry[]
  registry: BuilderCapabilityRegistry
}) {
  return {
    searchTemplates: tool({
      description: 'Search Lucid starter templates relevant to the current request.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(8).default(5),
      }),
      execute: async ({ query, limit }) => {
        const matches = shortlistTemplates(input.templates, query, {
          preferredMode: input.preferredMode === 'auto' ? 'auto' : undefined,
          draft: input.draft,
          selectedTemplateSlug: input.draft?.template?.slug,
          limit,
        })

        return matches.map((match) => ({
          slug: match.slug,
          reason: match.reason,
          score: match.score,
          missing_params: match.missing_params,
        }))
      },
    }),
    listCapabilities: tool({
      description: 'List Lucid-native capabilities including skills, plugins, internal tools, and MCP servers.',
      inputSchema: z.object({
        topic: z.enum(['skills', 'plugins', 'tools', 'servers']).default('tools'),
      }),
      execute: async ({ topic }) => {
        switch (topic) {
          case 'skills':
            return input.registry.skills.slice(0, 12)
          case 'plugins':
            return input.registry.plugins.slice(0, 12)
          case 'servers':
            return input.registry.toolServers.slice(0, 12)
          default:
            return input.registry.internalTools.slice(0, 20)
        }
      },
    }),
    recommendRuntime: tool({
      description: 'Recommend an appropriate runtime posture for the setup.',
      inputSchema: z.object({
        goal: z.string().min(1),
      }),
      execute: async ({ goal }) => ({
        mode: recommendRuntimeMode(goal, input.runtimeMode) ?? 'shared',
      }),
    }),
    planTeamTopology: tool({
      description: 'Plan a single-agent or team topology with responsibilities and handoffs.',
      inputSchema: z.object({
        goal: z.string().min(1),
      }),
      execute: async ({ goal }) => planBuilderTeamTopology({
        prompt: goal,
        preferredMode: input.preferredMode,
        runtimeMode: input.runtimeMode,
        registry: input.registry,
      }),
    }),
  }
}
