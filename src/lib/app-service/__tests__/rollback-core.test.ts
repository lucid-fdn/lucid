import { describe, expect, it } from 'vitest'
import type { AppArtifact, AppDeployment } from '@contracts/app-service'
import {
  buildRollbackDeploymentUpdate,
  isRollbackArtifactKind,
} from '../rollback-core'
import { computeManifestArtifactChecksum } from '../artifact-integrity-core'
import { validateGeneratedCodeFiles } from '../generated-code-guard'

const app: AppDeployment = {
  id: '0a3f7cb8-0e10-4c7c-bde9-1d8af7066c4a',
  org_id: '8abed822-343a-4f6b-83b8-5ad167f0743d',
  project_id: '9004b6c6-f9d0-42cb-ae3c-522dd5367ef5',
  generation_run_id: '69777b10-56a8-4aa6-a5c5-4a0b6e63045b',
  name: 'Support Concierge',
  slug: 'support-concierge',
  status: 'active',
  visibility: 'public',
  frontend_strategy: 'generated_code',
  frontend_manifest: {},
  preview_url: '/apps/support-concierge',
  public_url: 'https://support.example',
  assistant_ids: [],
  dag_ids: [],
  template_deployment_ids: [],
  deployment_target: 'vercel',
  latest_artifact_id: '8e5c3e98-9f48-4f99-9fb5-14b4f3a7d5e7',
  created_by: '98fd4493-317e-4182-9f68-c3e379f770a5',
  created_at: '2026-04-29T09:00:00.000Z',
  updated_at: '2026-04-29T09:15:00.000Z',
}

function artifact(overrides: Partial<AppArtifact>): AppArtifact {
  const manifest = { blocks: [] }
  return {
    id: '2d34bcc7-5db8-4e80-a681-5b158c83193d',
    app_deployment_id: app.id,
    generation_run_id: app.generation_run_id!,
    kind: 'manifest',
    version: 1,
    checksum: computeManifestArtifactChecksum(manifest, {
      name: app.name,
      slug: app.slug,
    }),
    metadata: { manifest },
    created_at: '2026-04-29T09:11:00.000Z',
    ...overrides,
  }
}

describe('rollback core', () => {
  it('allows only manifest and source archive rollback artifacts', () => {
    expect(isRollbackArtifactKind('manifest')).toBe(true)
    expect(isRollbackArtifactKind('source_archive')).toBe(true)
    expect(isRollbackArtifactKind('build_log')).toBe(false)
  })

  it('builds a manifest rollback update', () => {
    const update = buildRollbackDeploymentUpdate(app, artifact({ kind: 'manifest' }))

    expect(update).toMatchObject({
      latest_artifact_id: '2d34bcc7-5db8-4e80-a681-5b158c83193d',
      frontend_strategy: 'manifest',
      frontend_manifest: {
        schema_version: '1.0',
        kind: 'app_service',
        name: 'Support Concierge',
        slug: 'support-concierge',
        pages: [],
        capabilities: ['status'],
        public_api: {
          base_path: '/api/app-runtime/v1/public/apps/support-concierge',
          sdk_package: '@lucid/app-runtime-sdk',
        },
      },
      deployment_target: 'lucid_hosted',
      status: 'preview',
      public_url: null,
    })
    expect(update.frontend_manifest).not.toHaveProperty('blocks')
  })

  it('builds a source archive rollback update', () => {
    const files = [{
      path: 'app/page.tsx',
      content: 'export default function Page() { return null }',
    }]
    const validation = validateGeneratedCodeFiles(files)
    const update = buildRollbackDeploymentUpdate(app, artifact({
      kind: 'source_archive',
      checksum: validation.checksum,
      metadata: {
        preview_url: 'https://preview.v0.dev/app',
        source_checksum: validation.checksum,
        files,
      },
    }))

    expect(update).toMatchObject({
      latest_artifact_id: '2d34bcc7-5db8-4e80-a681-5b158c83193d',
      frontend_strategy: 'generated_code',
      deployment_target: 'vercel',
      status: 'preview',
      preview_url: 'https://preview.v0.dev/app',
      public_url: null,
    })
  })

  it('rejects artifacts from another app', () => {
    expect(() => buildRollbackDeploymentUpdate(app, artifact({
      app_deployment_id: 'cb3d1587-4505-4f67-bc83-a53a5ab6de31',
      generation_run_id: '495a4730-e68f-483b-876b-ac812b443563',
    }))).toThrow('does not belong')
  })

  it('rejects rollback artifacts with mismatched checksums', () => {
    expect(() => buildRollbackDeploymentUpdate(app, artifact({
      kind: 'manifest',
      checksum: 'bad-checksum',
    }))).toThrow('checksum')
  })
})
