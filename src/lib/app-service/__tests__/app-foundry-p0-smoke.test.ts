import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AppBlueprintDiscoveryMetadataSchema,
  AppBlueprintUpgradeMetadataSchema,
} from '@contracts/app-service'
import { APP_RUNTIME_ENDPOINTS } from '../public-api-contract'
import { APP_SERVICE_PRODUCT_PROOF_PATHS } from '../production-launch-core'

const root = process.cwd()

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(root, relativePath))
}

function runtimeRouteFile(endpointPath: string): string {
  return `src/app/api/app-runtime/v1${endpointPath
    .replaceAll('{slug}', '[slug]')
    .replaceAll('{appId}', '[appId]')
    .replaceAll('{agentId}', '[agentId]')
    .replaceAll('{tokenId}', '[tokenId]')
    .replaceAll('{originId}', '[originId]')
    .replaceAll('{action}', '[action]')}/route.ts`
}

const appServicesRouteFiles = [
  'src/app/api/app-services/[id]/settings/route.ts',
  'src/app/api/app-services/[id]/pause/route.ts',
  'src/app/api/app-services/[id]/resume/route.ts',
  'src/app/api/app-services/[id]/rollback/route.ts',
  'src/app/api/app-services/[id]/feedback/route.ts',
  'src/app/api/app-services/[id]/launch/route.ts',
  'src/app/api/app-services/[id]/upgrades/plan/route.ts',
  'src/app/api/app-services/[id]/upgrades/apply/route.ts',
  'src/app/api/app-services/benchmarks/route.ts',
  'src/app/api/app-services/blueprints/route.ts',
  'src/app/api/app-services/registry/route.ts',
  'src/app/api/app-services/registry/[slug]/install/route.ts',
  'src/app/api/app-services/registry/[slug]/remix/route.ts',
  'src/app/api/app-services/generation-runs/route.ts',
  'src/app/api/app-services/generation-runs/[id]/route.ts',
  'src/app/api/app-services/generation-runs/[id]/approve/route.ts',
  'src/app/api/app-services/generation-runs/[id]/requeue/route.ts',
  'src/app/api/app-services/generation-runs/[id]/cancel/route.ts',
  'src/app/api/app-services/generation-runs/process-next/route.ts',
] as const

describe('App Foundry P0 smoke wiring', () => {
  it('backs every public API contract endpoint with a Next route file', () => {
    const missing = APP_RUNTIME_ENDPOINTS
      .map((endpoint) => runtimeRouteFile(endpoint.path))
      .filter((routeFile) => !exists(routeFile))

    expect(missing).toEqual([])
  })

  it('keeps the P0 App Service management, public shell, and migration files present', () => {
    const requiredFiles = [
      ...APP_SERVICE_PRODUCT_PROOF_PATHS,
      ...appServicesRouteFiles,
      'packages/app-runtime-sdk/package.json',
      'packages/app-runtime-sdk/src/index.ts',
      'packages/app-runtime-sdk/examples/generated-public-app.ts',
      'packages/app-runtime-sdk/examples/generated-owner-cockpit.ts',
      'scripts/lucid-app-service.ts',
      'supabase/migrations/20260518120000_app_service_foundry.sql',
    ]

    expect(requiredFiles.filter((file) => !exists(file))).toEqual([])
  })

  it('backs blueprint upgrade and MCP/A2A discovery metadata with the foundation migration', () => {
    expect(AppBlueprintUpgradeMetadataSchema.parse({})).toMatchObject({
      schema_version: '1.0',
      channel: 'stable',
      compatible_from: [],
      migration_steps: [],
    })
    expect(AppBlueprintDiscoveryMetadataSchema.parse({})).toMatchObject({
      schema_version: '1.0',
      protocols: [],
      mcp: [],
      a2a: [],
    })

    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20260518120000_app_service_foundry.sql'),
      'utf8',
    )
    expect(migration).toContain('upgrade_metadata JSONB NOT NULL')
    expect(migration).toContain('discovery_metadata JSONB NOT NULL')
    expect(migration).toContain('app_blueprint_upgrade_runs')
    expect(migration).toContain('increment_app_public_usage_bucket')
  })
})
