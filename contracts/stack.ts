/**
 * Lucid Stack IDs
 *
 * Tiny shared vocabulary for cross-process references such as AgentOps events,
 * feature gates, generated-app guards, and docs/backlog links.
 *
 * Keep rich product metadata out of this file. Stack ownership, surfaces, and
 * dependency descriptions live in app/docs config, not the shared contract
 * boundary.
 */

import { z } from 'zod'

export const LUCID_STACK_IDS = [
  'commerce',
  'agentops',
  'mission_control',
  'teams',
  'templates',
  'runtime',
  'app_service',
  'trust',
  'data',
  'providers',
] as const

export const LucidStackIdSchema = z.enum(LUCID_STACK_IDS)

export type LucidStackId = z.infer<typeof LucidStackIdSchema>

export function isLucidStackId(value: unknown): value is LucidStackId {
  return LucidStackIdSchema.safeParse(value).success
}
