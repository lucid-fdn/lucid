// Retail server-side logic. See docs/plans/2026-04-07-consumer-retail-funnel.md.
export type {
  RetailTemplate,
  RetailAudience,
  RetailChannel,
  RetailSoulPreset,
} from './types'
export { RETAIL_TEMPLATES, getTemplateBySlug } from './templates'
export { RETAIL_ORG_FLAG } from './constants'
export {
  RETAIL_SOUL_PRESETS,
  RETAIL_SOUL_MAX_LENGTH,
  getRetailSoulPreset,
} from './soul-presets'
export { buildRetailSystemPrompt } from './system-prompt'
// Note: ensureRetailOrg is server-only — import directly from
// '@/lib/retail/retail-org' to avoid pulling 'server-only' through the barrel.
