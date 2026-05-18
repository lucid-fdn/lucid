import { createHash } from 'node:crypto'
import type { AppArtifact, AppDeployment } from '@contracts/app-service'
import { sanitizeGeneratedAppManifest } from './manifest-sanitizer'
import { validateGeneratedCodeFiles } from './generated-code-guard'

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function computeManifestArtifactChecksum(
  manifest: Record<string, unknown>,
  fallback: { name: string; slug: string },
): string {
  return sha256(stableJson(sanitizeGeneratedAppManifest(manifest, fallback)))
}

export function assertManifestArtifactChecksum(input: {
  checksum: string
  manifest: Record<string, unknown>
  fallback: { name: string; slug: string }
}): void {
  const actual = computeManifestArtifactChecksum(input.manifest, input.fallback)
  if (actual !== input.checksum) {
    throw new Error('Manifest artifact checksum does not match sanitized manifest metadata.')
  }
}

function sourceFilesFromArtifact(artifact: AppArtifact): unknown[] | null {
  const files = artifact.metadata.files
  if (Array.isArray(files)) return files

  const source = stableRecord(artifact.metadata.source)
  return Array.isArray(source.files) ? source.files : null
}

export function assertRollbackArtifactChecksum(app: AppDeployment, artifact: AppArtifact): void {
  if (artifact.kind === 'manifest') {
    assertManifestArtifactChecksum({
      checksum: artifact.checksum,
      manifest: stableRecord(artifact.metadata.manifest),
      fallback: { name: app.name, slug: app.slug },
    })
    return
  }

  if (artifact.kind !== 'source_archive') return

  const files = sourceFilesFromArtifact(artifact)
  if (files) {
    const validation = validateGeneratedCodeFiles(files)
    if (!validation.passed) {
      throw new Error('Source archive rollback artifact no longer passes generated-code validation.')
    }
    if (validation.checksum !== artifact.checksum) {
      throw new Error('Source archive artifact checksum does not match source file metadata.')
    }
    return
  }

  const sourceChecksum = artifact.metadata.source_checksum
  if (typeof sourceChecksum === 'string' && sourceChecksum === artifact.checksum) return

  throw new Error('Source archive artifact is missing verifiable checksum metadata.')
}
