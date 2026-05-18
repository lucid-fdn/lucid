import 'server-only'

import { z } from 'zod'
import { AppServiceSpecSchema } from '@contracts/app-service'
import { AppServiceError } from './errors'
import { createAppBlueprint } from './blueprints'
import { createAppGenerationRun } from './generation-service'
import { getFirstPlatformBlueprintBySlug } from './platform-blueprints-core'
import { recordAppServiceEvent } from './events'

export const RegistryInstallInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().max(160).optional(),
})

export const RegistryRemixInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  visibility: z.enum(['private', 'unlisted', 'public']).default('private'),
  tags: z.array(z.string()).default([]),
})

export async function installPlatformBlueprintFromRegistry(params: {
  slug: string
  input: unknown
  userId: string
}) {
  const input = RegistryInstallInputSchema.parse(params.input)
  const blueprint = getFirstPlatformBlueprintBySlug(params.slug)
  if (!blueprint) {
    throw new AppServiceError('not_found', 'Platform blueprint was not found.', 404)
  }

  const run = await createAppGenerationRun({
    orgId: input.orgId,
    projectId: input.projectId,
    blueprintSlug: blueprint.slug,
    input: input.input,
    idempotencyKey: input.idempotencyKey,
  }, params.userId)

  await recordAppServiceEvent({
    generationRunId: run.id,
    eventType: 'app_blueprint_installed',
    message: `Installed ${blueprint.slug}@${blueprint.version} from the App Service registry.`,
    payload: {
      registry_slug: blueprint.slug,
      registry_version: blueprint.version,
      installed_by: params.userId,
    },
  })

  return { run, blueprint: { slug: blueprint.slug, version: blueprint.version, name: blueprint.spec.name } }
}

export async function remixPlatformBlueprintFromRegistry(params: {
  slug: string
  input: unknown
  userId: string
}) {
  const input = RegistryRemixInputSchema.parse(params.input)
  const blueprint = getFirstPlatformBlueprintBySlug(params.slug)
  if (!blueprint) {
    throw new AppServiceError('not_found', 'Platform blueprint was not found.', 404)
  }

  const spec = AppServiceSpecSchema.parse({
    ...blueprint.spec,
    name: input.name ?? `${blueprint.spec.name} Remix`,
    slug: input.slug ?? `${blueprint.slug}-remix`,
    marketplace: {
      ...blueprint.spec.marketplace,
      tags: [...new Set([...blueprint.spec.marketplace.tags, 'remix', ...input.tags])],
      creator_attribution: 'Lucid App Foundry remix',
    },
  })

  const remix = await createAppBlueprint({
    orgId: input.orgId,
    projectId: input.projectId,
    spec,
    source: 'org',
    status: 'draft',
    visibility: input.visibility,
    version: blueprint.version,
    upgradeMetadata: {
      schema_version: '1.0',
      channel: 'stable',
      compatible_from: [blueprint.version],
      migration_steps: [],
      notes: `Remixed from ${blueprint.slug}@${blueprint.version}.`,
    },
    discoveryMetadata: {
      schema_version: '1.0',
      protocols: [],
      mcp: [],
      a2a: [],
    },
    tags: [...new Set(['remix', blueprint.slug, ...input.tags])],
  }, params.userId)

  await recordAppServiceEvent({
    eventType: 'app_blueprint_remixed',
    message: `Remixed ${blueprint.slug}@${blueprint.version}.`,
    payload: {
      source_slug: blueprint.slug,
      source_version: blueprint.version,
      remix_blueprint_id: remix.id,
      remixed_by: params.userId,
    },
  })

  return { blueprint: remix, source: { slug: blueprint.slug, version: blueprint.version } }
}
