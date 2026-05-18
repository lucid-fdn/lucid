import fs from 'node:fs/promises'
import path from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

export type BrowserQaArtifactStoreKind = 'local' | 'supabase'

export type BrowserQaArtifactStoreWriteInput = {
  pathSegments: string[]
  fileName: string
  bytes: Buffer
  contentType: string
}

export type BrowserQaStoredArtifact = {
  key: string
  uri: string
  contentType: string
  byteLength: number
  storageKind: BrowserQaArtifactStoreKind
  path?: string
}

export type BrowserQaLoadedArtifact = {
  key: string
  bytes: Buffer
  contentType: string
  byteLength: number
  storageKind: BrowserQaArtifactStoreKind
}

export interface BrowserQaArtifactStore {
  readonly kind: BrowserQaArtifactStoreKind
  write(input: BrowserQaArtifactStoreWriteInput): Promise<BrowserQaStoredArtifact>
  read(key: string): Promise<BrowserQaLoadedArtifact>
  deleteMany(keys: string[]): Promise<{ deleted: number }>
}

export class LocalBrowserQaArtifactStore implements BrowserQaArtifactStore {
  readonly kind = 'local' as const

  constructor(private readonly config: {
    artifactDir: string
    publicBaseUrl?: string
  }) {}

  async write(input: BrowserQaArtifactStoreWriteInput): Promise<BrowserQaStoredArtifact> {
    const key = buildArtifactKey(input.pathSegments, input.fileName)
    const root = path.resolve(this.config.artifactDir)
    const filePath = path.resolve(root, ...key.split('/'))
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      throw new Error('Invalid Browser QA artifact path')
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, input.bytes, { mode: 0o600 })

    return {
      key,
      uri: buildArtifactUri(key, this.config.publicBaseUrl),
      contentType: input.contentType,
      byteLength: input.bytes.byteLength,
      storageKind: this.kind,
      path: filePath,
    }
  }

  async read(rawKey: string): Promise<BrowserQaLoadedArtifact> {
    const key = normalizeArtifactKey(rawKey)
    const root = path.resolve(this.config.artifactDir)
    const filePath = path.resolve(root, ...key.split('/'))
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      throw new Error('Invalid Browser QA artifact path')
    }

    const stat = await fs.stat(filePath).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('Browser QA artifact not found')
      }
      throw error
    })
    if (!stat.isFile()) throw new Error('Browser QA artifact not found')
    const bytes = await fs.readFile(filePath)

    return {
      key,
      bytes,
      contentType: contentTypeForArtifactKey(key),
      byteLength: bytes.byteLength,
      storageKind: this.kind,
    }
  }

  async deleteMany(rawKeys: string[]): Promise<{ deleted: number }> {
    let deleted = 0
    const root = path.resolve(this.config.artifactDir)
    for (const rawKey of rawKeys) {
      const key = normalizeArtifactKey(rawKey)
      const filePath = path.resolve(root, ...key.split('/'))
      if (!filePath.startsWith(`${root}${path.sep}`)) {
        throw new Error('Invalid Browser QA artifact path')
      }
      await fs.rm(filePath, { force: true })
      deleted += 1
    }
    return { deleted }
  }
}

export class SupabaseBrowserQaArtifactStore implements BrowserQaArtifactStore {
  readonly kind = 'supabase' as const

  constructor(private readonly config: {
    supabase: SupabaseClient
    bucket: string
    publicBaseUrl?: string
  }) {}

  async write(input: BrowserQaArtifactStoreWriteInput): Promise<BrowserQaStoredArtifact> {
    const key = buildArtifactKey(input.pathSegments, input.fileName)
    const { error } = await this.config.supabase
      .storage
      .from(this.config.bucket)
      .upload(key, input.bytes, {
        cacheControl: '3600',
        contentType: input.contentType,
        upsert: false,
      })

    if (error) throw error

    return {
      key,
      uri: buildArtifactUri(key, this.config.publicBaseUrl),
      contentType: input.contentType,
      byteLength: input.bytes.byteLength,
      storageKind: this.kind,
    }
  }

  async read(rawKey: string): Promise<BrowserQaLoadedArtifact> {
    const key = normalizeArtifactKey(rawKey)
    const { data, error } = await this.config.supabase
      .storage
      .from(this.config.bucket)
      .download(key)

    if (error) throw error
    if (!data) throw new Error('Browser QA artifact not found')

    const bytes = Buffer.from(await data.arrayBuffer())
    return {
      key,
      bytes,
      contentType: contentTypeForArtifactKey(key),
      byteLength: bytes.byteLength,
      storageKind: this.kind,
    }
  }

  async deleteMany(rawKeys: string[]): Promise<{ deleted: number }> {
    const keys = rawKeys.map(normalizeArtifactKey)
    if (keys.length === 0) return { deleted: 0 }

    const { data, error } = await this.config.supabase
      .storage
      .from(this.config.bucket)
      .remove(keys)

    if (error) throw error
    return { deleted: data?.length ?? keys.length }
  }
}

export class FallbackBrowserQaArtifactStore implements BrowserQaArtifactStore {
  readonly kind: BrowserQaArtifactStoreKind

  constructor(
    private readonly primary: BrowserQaArtifactStore,
    private readonly fallback: BrowserQaArtifactStore,
  ) {
    this.kind = primary.kind
  }

  async write(input: BrowserQaArtifactStoreWriteInput): Promise<BrowserQaStoredArtifact> {
    try {
      const artifact = await this.primary.write(input)
      await this.fallback.write(input).catch((error) => {
        this.warn('artifact_write_fallback_mirror_failed', error)
      })
      return artifact
    } catch (error) {
      this.warn('artifact_write_primary_failed', error)
      return await this.fallback.write(input)
    }
  }

  async read(key: string): Promise<BrowserQaLoadedArtifact> {
    try {
      return await this.primary.read(key)
    } catch (error) {
      this.warn('artifact_read_primary_failed', error)
      return await this.fallback.read(key)
    }
  }

  async deleteMany(keys: string[]): Promise<{ deleted: number }> {
    const [primary, fallback] = await Promise.allSettled([
      this.primary.deleteMany(keys),
      this.fallback.deleteMany(keys),
    ])
    if (primary.status === 'rejected') this.warn('artifact_delete_primary_failed', primary.reason)
    if (fallback.status === 'rejected') this.warn('artifact_delete_fallback_failed', fallback.reason)

    const primaryDeleted = primary.status === 'fulfilled' ? primary.value.deleted : 0
    const fallbackDeleted = fallback.status === 'fulfilled' ? fallback.value.deleted : 0
    return { deleted: Math.max(primaryDeleted, fallbackDeleted) }
  }

  private warn(event: string, error: unknown): void {
    console.warn('[browser-qa-gateway]', {
      event,
      primary: this.primary.kind,
      fallback: this.fallback.kind,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function buildBrowserQaArtifactStore(input: {
  storeKind: BrowserQaArtifactStoreKind
  artifactDir: string
  bucket: string
  publicBaseUrl?: string
  supabase?: SupabaseClient
}): BrowserQaArtifactStore {
  if (input.storeKind === 'supabase') {
    if (!input.supabase) {
      throw new Error('BROWSER_QA_ARTIFACT_STORE=supabase requires Supabase credentials')
    }
    return new FallbackBrowserQaArtifactStore(
      new SupabaseBrowserQaArtifactStore({
        supabase: input.supabase,
        bucket: input.bucket,
        publicBaseUrl: input.publicBaseUrl,
      }),
      new LocalBrowserQaArtifactStore({
        artifactDir: input.artifactDir,
        publicBaseUrl: input.publicBaseUrl,
      }),
    )
  }

  return new LocalBrowserQaArtifactStore({
    artifactDir: input.artifactDir,
    publicBaseUrl: input.publicBaseUrl,
  })
}

function buildArtifactKey(pathSegments: string[], fileName: string): string {
  return [...pathSegments, fileName]
    .map(safeArtifactPathSegment)
    .join('/')
}

function normalizeArtifactKey(rawKey: string): string {
  const key = rawKey
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        return part
      }
    })
    .map(safeArtifactPathSegment)
    .join('/')

  if (!key || key.includes('..')) throw new Error('Invalid Browser QA artifact path')
  return key
}

function buildArtifactUri(key: string, publicBaseUrl?: string): string {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  return publicBaseUrl
    ? `${publicBaseUrl.replace(/\/$/, '')}/artifacts/${encodedKey}`
    : `/artifacts/${encodedKey}`
}

function safeArtifactPathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 120)
    || 'unknown'
}

function contentTypeForArtifactKey(key: string): string {
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}
