/**
 * Retail funnel — shared types.
 *
 * These describe the consumer-facing template catalog and related metadata.
 * Pure types — no runtime imports. Safe to use from server and client components.
 */

export type RetailAudience = 'generic' | 'crypto'

export type RetailChannel = 'telegram' | 'web' | 'slack' | 'discord'

export type RetailSoulPreset =
  | 'friendly'
  | 'professional'
  | 'witty'
  | 'expert'
  | 'concise'

/**
 * A retail template is a typed const definition (in `templates.ts`) that
 * pre-fills sensible defaults for the 3-question wizard. It is NOT a DB row.
 *
 * Cleanup is just deleting `src/lib/retail/templates.ts`.
 */
export interface RetailTemplate {
  /** URL slug — kebab-case, stable. Used in `/agents-preview/start/[slug]`. */
  slug: string
  /** Display name shown on the gallery card. */
  name: string
  /** One-line value prop. */
  tagline: string
  /** Two-sentence description for the card body. */
  description: string
  /** Audience grouping for filtering / analytics. */
  audience: RetailAudience
  /** Default channel suggested in the wizard. */
  defaultChannel: RetailChannel
  /** Personality preset applied at create time. */
  soulPreset: RetailSoulPreset
  /** Plugin slugs (must match `plugin_catalog.slug`) pre-selected by the wizard. */
  preselectedSkills: readonly string[]
  /** Three sample first-message prompts shown in the activation tutorial. */
  samplePrompts: readonly [string, string, string]
  /** Sensible default monthly cost ceiling (USD). */
  monthlyCostCapUsd: number
}
