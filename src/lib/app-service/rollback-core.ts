import type { AppArtifact, AppDeployment } from '@contracts/app-service'
import { assertRollbackArtifactChecksum } from './artifact-integrity-core'
import { sanitizeGeneratedAppManifest } from './manifest-sanitizer'

export interface AppDeploymentRollbackUpdate {
  latest_artifact_id: string
  frontend_strategy: AppDeployment['frontend_strategy']
  frontend_manifest?: Record<string, unknown>
  deployment_target: AppDeployment['deployment_target']
  status: AppDeployment['status']
  preview_url?: string | null
  public_url?: string | null
}

function stableRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function isRollbackArtifactKind(kind: AppArtifact['kind']): boolean {
  return kind === 'manifest' || kind === 'source_archive'
}

export function assertRollbackArtifactBelongsToApp(app: AppDeployment, artifact: AppArtifact): void {
  const sameDeployment = artifact.app_deployment_id === app.id
  const sameGeneration = Boolean(app.generation_run_id && artifact.generation_run_id === app.generation_run_id)

  if (!sameDeployment && !sameGeneration) {
    throw new Error('Rollback artifact does not belong to this app deployment.')
  }
}

export function buildRollbackDeploymentUpdate(
  app: AppDeployment,
  artifact: AppArtifact,
): AppDeploymentRollbackUpdate {
  assertRollbackArtifactBelongsToApp(app, artifact)
  assertRollbackArtifactChecksum(app, artifact)

  if (artifact.kind === 'manifest') {
    const manifest = sanitizeGeneratedAppManifest(stableRecord(artifact.metadata.manifest), {
      name: app.name,
      slug: app.slug,
    })
    if (Object.keys(manifest).length === 0) {
      throw new Error('Manifest rollback artifact is missing manifest metadata.')
    }

    return {
      latest_artifact_id: artifact.id,
      frontend_strategy: 'manifest',
      frontend_manifest: manifest,
      deployment_target: 'lucid_hosted',
      status: 'preview',
      preview_url: app.preview_url ?? `/apps/${app.slug}`,
      public_url: null,
    }
  }

  if (artifact.kind === 'source_archive') {
    return {
      latest_artifact_id: artifact.id,
      frontend_strategy: 'generated_code',
      deployment_target: app.deployment_target === 'lucid_hosted' ? 'vercel' : app.deployment_target,
      status: 'preview',
      preview_url: stringOrNull(artifact.metadata.preview_url) ?? app.preview_url,
      public_url: null,
    }
  }

  throw new Error(`Artifact kind "${artifact.kind}" cannot be used for rollback.`)
}
