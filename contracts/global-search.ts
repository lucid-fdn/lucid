import { z } from 'zod'

export const GlobalSearchScopeSchema = z.enum([
  'all',
  'runs',
  'knowledge',
  'claims',
  'sources',
  'agents',
  'teams',
  'projects',
  'evidence',
  'channels',
  'procedures',
  'approvals',
  'commerce',
  'routines',
  'packs',
])

export type GlobalSearchScope = z.infer<typeof GlobalSearchScopeSchema>

export const GlobalSearchResultSchema = z.object({
  id: z.string().min(1),
  type: GlobalSearchScopeSchema,
  title: z.string().min(1).max(240),
  subtitle: z.string().max(500).nullable().optional(),
  snippet: z.string().max(1000).nullable().optional(),
  href: z.string().min(1).max(2000),
  score: z.number().finite(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  status: z.string().max(120).nullable().optional(),
  freshness: z.enum(['fresh', 'aging', 'stale', 'unknown']).optional(),
  evidenceCount: z.number().int().nonnegative().optional(),
  updatedAt: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type GlobalSearchResult = z.infer<typeof GlobalSearchResultSchema>

export const GlobalSearchRequestSchema = z.object({
  orgId: z.string().uuid(),
  workspaceSlug: z.string().min(1).max(160).optional(),
  query: z.string().min(1).max(500),
  scopes: z.array(GlobalSearchScopeSchema).default(['all']),
  projectId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  limit: z.number().int().positive().max(100).default(25),
})

export type GlobalSearchRequest = z.infer<typeof GlobalSearchRequestSchema>

export const GlobalSearchResponseSchema = z.object({
  query: z.string(),
  scopes: z.array(GlobalSearchScopeSchema),
  results: z.array(GlobalSearchResultSchema),
  countsByType: z.partialRecord(GlobalSearchScopeSchema, z.number().int().nonnegative()).default({}),
  partial: z.boolean().default(false),
  warnings: z.array(z.string()).default([]),
  durationMs: z.number().int().nonnegative(),
})

export type GlobalSearchResponse = z.infer<typeof GlobalSearchResponseSchema>
