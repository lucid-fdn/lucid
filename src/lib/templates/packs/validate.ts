#!/usr/bin/env npx tsx
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { LucidPackManifestSchema, type LucidPackManifest } from '@contracts/lucid-pack'
import { assertLucidPackManifestSafe } from '@/lib/packs'
import { getPackBackedTemplateType, packBackedTemplateToCatalogEntry } from '@/lib/templates/pack-adapter'
import { PLATFORM_TEMPLATE_PACKS } from './catalog'

async function main(): Promise<void> {
  const fileArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  const manifests = fileArgs.length > 0
    ? await Promise.all(fileArgs.map(readManifestFile))
    : PLATFORM_TEMPLATE_PACKS
  const label = fileArgs.length > 0 ? 'input template pack' : 'platform template pack'
  let failed = 0

  for (const manifest of manifests) {
    const parsed = LucidPackManifestSchema.safeParse(manifest)
    if (!parsed.success) {
      failed += 1
      console.error(`✗ ${manifest.key}: schema validation failed`)
      console.error(parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n'))
      continue
    }

    const resourceKeys = new Set<string>()
    const duplicateKeys = new Set<string>()
    for (const resource of manifest.resources) {
      if (resourceKeys.has(resource.key)) duplicateKeys.add(resource.key)
      resourceKeys.add(resource.key)
    }
    if (duplicateKeys.size > 0) {
      failed += 1
      console.error(`✗ ${manifest.key}: duplicate resource keys: ${Array.from(duplicateKeys).join(', ')}`)
      continue
    }

    try {
      assertLucidPackManifestSafe(manifest)
    } catch (error) {
      failed += 1
      console.error(`✗ ${manifest.key}: ${error instanceof Error ? error.message : 'safety validation failed'}`)
      continue
    }

    const templateType = getPackBackedTemplateType({ manifest })
    if ((templateType === 'agent' || templateType === 'team') && !packBackedTemplateToCatalogEntry(buildPack(manifest))) {
      failed += 1
      console.error(`✗ ${manifest.key}: agent/team template pack is not deploy-compatible`)
      continue
    }

    console.log(`✓ ${manifest.key} (${templateType ?? 'pack'}, ${manifest.resources.length} resource${manifest.resources.length === 1 ? '' : 's'})`)
  }

  if (failed > 0) {
    console.error(`\n${failed}/${manifests.length} ${label}(s) failed validation.`)
    process.exit(1)
  }

  console.log(`\n${manifests.length} ${label}(s) passed validation.`)
}

function buildPack(manifest: LucidPackManifest) {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    orgId: null,
    packKey: manifest.key,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    manifest,
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

async function readManifestFile(filePath: string): Promise<LucidPackManifest> {
  const absolutePath = path.resolve(process.cwd(), filePath)
  const content = await readFile(absolutePath, 'utf8')
  return LucidPackManifestSchema.parse(JSON.parse(content))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Template pack validation failed')
  process.exit(1)
})
