import { z } from 'zod'
import {
  AppDeploymentStatusSchema,
  AppVisibilitySchema,
  type AppDeployment,
} from '@contracts/app-service'
import { PublicActionCommerceConfigSchema } from '@contracts/app-runtime'
import { sanitizeGeneratedAppManifest } from './manifest-sanitizer'
import { appServiceGeneratedAppUrlForSlug } from './product-policy-core'

const HexColorSchema = z.preprocess(
  (value) => value === '' || value === null ? undefined : value,
  z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
)

const OptionalUrlSchema = z.preprocess(
  (value) => value === '' || value === null ? undefined : value,
  z.string().url().optional(),
)

export const AppDeploymentThemePatchSchema = z.object({
  mode: z.enum(['light', 'dark', 'system']).optional(),
  primary_color: HexColorSchema,
  accent_color: HexColorSchema,
  font_family: z.string().trim().min(1).max(80).optional(),
  radius: z.enum(['none', 'sm', 'md']).optional(),
}).partial()

export const AppDeploymentLimitsPatchSchema = z.object({
  public_requests_per_day: z.number().int().positive().max(1_000_000).optional(),
  chat_turns_per_session: z.number().int().positive().max(1_000).optional(),
  max_upload_mb: z.number().int().positive().max(1_000).optional(),
  monthly_cost_cents: z.number().int().nonnegative().max(100_000_000).optional(),
}).partial()

export const AppDeploymentConsentPatchSchema = z.object({
  privacy_url: OptionalUrlSchema,
  terms_url: OptionalUrlSchema,
  transcript_retention_days: z.number().int().nonnegative().max(3650).optional(),
}).partial()

export const AppDeploymentCommercePatchSchema = z.object({
  paid_actions: z.record(
    z.string().min(1).max(80),
    PublicActionCommerceConfigSchema,
  ).optional(),
}).partial()

export const AppDeploymentSettingsPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  visibility: AppVisibilitySchema.optional(),
  theme: AppDeploymentThemePatchSchema.optional(),
  limits: AppDeploymentLimitsPatchSchema.optional(),
  consent: AppDeploymentConsentPatchSchema.optional(),
  commerce: AppDeploymentCommercePatchSchema.optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one setting must be provided.' },
)

export const AppDeploymentResumeStatusSchema = AppDeploymentStatusSchema.extract(['preview', 'active'])

export type AppDeploymentSettingsPatch = z.infer<typeof AppDeploymentSettingsPatchSchema>
export type AppDeploymentResumeStatus = z.infer<typeof AppDeploymentResumeStatusSchema>

export interface AppDeploymentSettingsUpdate {
  name?: string
  slug?: string
  visibility?: AppDeployment['visibility']
  frontend_manifest?: Record<string, unknown>
  preview_url?: string | null
  public_url?: string | null
}

export interface AppDeploymentLifecycleUpdate {
  status?: AppDeployment['status']
}

export interface AppDeploymentSettingsPlan {
  update: AppDeploymentSettingsUpdate
  changedFields: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeSection(
  manifest: Record<string, unknown>,
  key: string,
  patch: Record<string, unknown> | undefined,
): boolean {
  if (!patch || Object.keys(patch).length === 0) return false

  const current = isRecord(manifest[key]) ? manifest[key] as Record<string, unknown> : {}
  const next = { ...current }
  let changed = false

  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) {
      if (field in next) {
        delete next[field]
        changed = true
      }
      continue
    }

    if (next[field] !== value) {
      next[field] = value
      changed = true
    }
  }

  if (changed) {
    manifest[key] = next
  }

  return changed
}

function appHostedUrl(slug: string) {
  return appServiceGeneratedAppUrlForSlug(slug)
}

function mergeCommerce(
  manifest: Record<string, unknown>,
  patch: z.infer<typeof AppDeploymentCommercePatchSchema> | undefined,
): boolean {
  if (!patch?.paid_actions || Object.keys(patch.paid_actions).length === 0) return false

  const currentCommerce = isRecord(manifest.commerce) ? manifest.commerce as Record<string, unknown> : {}
  const currentPaidActions = isRecord(currentCommerce.paid_actions)
    ? currentCommerce.paid_actions as Record<string, unknown>
    : {}
  const nextPaidActions = { ...currentPaidActions }

  for (const [action, config] of Object.entries(patch.paid_actions)) {
    if (config.mode === 'off') {
      delete nextPaidActions[action]
    } else {
      nextPaidActions[action] = config
    }
  }

  const changed = JSON.stringify(currentPaidActions) !== JSON.stringify(nextPaidActions)
  if (changed) {
    manifest.commerce = {
      ...currentCommerce,
      paid_actions: nextPaidActions,
    }
  }

  return changed
}

export function assertAppDeploymentMutable(app: AppDeployment): void {
  if (app.status === 'archived') {
    throw new Error('Archived app deployments cannot be changed.')
  }
}

export function buildAppDeploymentSettingsUpdate(
  app: AppDeployment,
  rawInput: unknown,
): AppDeploymentSettingsPlan {
  assertAppDeploymentMutable(app)
  const input = AppDeploymentSettingsPatchSchema.parse(rawInput)
  const update: AppDeploymentSettingsUpdate = {}
  const changedFields: string[] = []
  const manifest = { ...(app.frontend_manifest ?? {}) }
  let manifestChanged = false

  if (input.name && input.name !== app.name) {
    update.name = input.name
    manifest.name = input.name
    changedFields.push('name')
    manifestChanged = true
  }

  if (input.slug && input.slug !== app.slug) {
    update.slug = input.slug
    manifest.slug = input.slug
    manifest.public_api = {
      ...(isRecord(manifest.public_api) ? manifest.public_api : {}),
      base_path: `/api/app-runtime/v1/public/apps/${input.slug}`,
    }
    if (!app.preview_url || app.preview_url.startsWith('/apps/')) {
      update.preview_url = appHostedUrl(input.slug)
    }
    if (app.public_url?.startsWith('/apps/')) {
      update.public_url = appHostedUrl(input.slug)
    }
    changedFields.push('slug')
    manifestChanged = true
  }

  if (input.visibility && input.visibility !== app.visibility) {
    update.visibility = input.visibility
    changedFields.push('visibility')
  }

  if (mergeSection(manifest, 'theme', input.theme)) {
    changedFields.push('theme')
    manifestChanged = true
  }

  if (mergeSection(manifest, 'limits', input.limits)) {
    changedFields.push('limits')
    manifestChanged = true
  }

  if (mergeSection(manifest, 'consent', input.consent)) {
    changedFields.push('consent')
    manifestChanged = true
  }

  if (mergeCommerce(manifest, input.commerce)) {
    changedFields.push('commerce')
    manifestChanged = true
  }

  if (manifestChanged) {
    update.frontend_manifest = sanitizeGeneratedAppManifest(manifest, {
      name: input.name ?? app.name,
      slug: input.slug ?? app.slug,
    })
  }

  return { update, changedFields }
}

export function buildPauseDeploymentUpdate(app: AppDeployment): AppDeploymentLifecycleUpdate {
  assertAppDeploymentMutable(app)
  if (app.status === 'paused') return {}
  return { status: 'paused' }
}

export function deriveResumeStatus(
  app: AppDeployment,
  requestedStatus?: AppDeploymentResumeStatus,
): AppDeploymentResumeStatus {
  if (requestedStatus) return requestedStatus
  if (app.visibility === 'private' && !app.public_url) return 'preview'
  return 'active'
}

export function buildResumeDeploymentUpdate(
  app: AppDeployment,
  requestedStatus?: AppDeploymentResumeStatus,
): AppDeploymentLifecycleUpdate {
  assertAppDeploymentMutable(app)
  if (app.status !== 'paused') return {}
  return { status: deriveResumeStatus(app, requestedStatus) }
}
