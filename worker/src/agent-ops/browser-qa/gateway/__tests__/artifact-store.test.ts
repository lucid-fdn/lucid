import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  FallbackBrowserQaArtifactStore,
  LocalBrowserQaArtifactStore,
  SupabaseBrowserQaArtifactStore,
  buildBrowserQaArtifactStore,
} from '../artifact-store.js'

describe('Browser QA artifact stores', () => {
  it('writes and reads local artifacts through stable gateway URLs', async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucid-browser-qa-store-'))
    const store = new LocalBrowserQaArtifactStore({
      artifactDir,
      publicBaseUrl: 'https://browser-gateway.test',
    })

    try {
      const written = await store.write({
        pathSegments: ['org/test', 'run/test', 'step/test'],
        fileName: 'shot.png',
        bytes: Buffer.from('png-bytes'),
        contentType: 'image/png',
      })

      expect(written).toMatchObject({
        key: 'org-test/run-test/step-test/shot.png',
        uri: 'https://browser-gateway.test/artifacts/org-test/run-test/step-test/shot.png',
        storageKind: 'local',
        contentType: 'image/png',
        byteLength: 9,
      })
      expect(await fs.readFile(written.path!, 'utf8')).toBe('png-bytes')

      const loaded = await store.read(written.key)
      expect(loaded).toMatchObject({
        key: written.key,
        storageKind: 'local',
        contentType: 'image/png',
        byteLength: 9,
      })
      expect(loaded.bytes.toString('utf8')).toBe('png-bytes')

      await expect(store.deleteMany([written.key])).resolves.toEqual({ deleted: 1 })
      await expect(store.read(written.key)).rejects.toThrow(/not found/i)
    } finally {
      await fs.rm(artifactDir, { recursive: true, force: true })
    }
  })

  it('rejects path traversal on local artifact reads', async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucid-browser-qa-store-'))
    const store = new LocalBrowserQaArtifactStore({ artifactDir })

    try {
      await expect(store.read('../secret.png')).rejects.toThrow(/invalid/i)
    } finally {
      await fs.rm(artifactDir, { recursive: true, force: true })
    }
  })

  it('uploads and downloads artifacts from Supabase Storage using gateway URLs', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const download = vi.fn().mockResolvedValue({
      data: new Blob([Buffer.from('jpeg-bytes')], { type: 'image/jpeg' }),
      error: null,
    })
    const remove = vi.fn().mockResolvedValue({ data: [{ name: 'shot.jpg' }], error: null })
    const from = vi.fn(() => ({ upload, download, remove }))
    const supabase = { storage: { from } }
    const store = new SupabaseBrowserQaArtifactStore({
      supabase: supabase as never,
      bucket: 'browser-qa-artifacts',
      publicBaseUrl: 'https://browser-gateway.test',
    })

    const written = await store.write({
      pathSegments: ['org', 'run', 'step'],
      fileName: 'shot.jpg',
      bytes: Buffer.from('jpeg-bytes'),
      contentType: 'image/jpeg',
    })

    expect(from).toHaveBeenCalledWith('browser-qa-artifacts')
    expect(upload).toHaveBeenCalledWith('org/run/step/shot.jpg', Buffer.from('jpeg-bytes'), {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: false,
    })
    expect(written).toMatchObject({
      key: 'org/run/step/shot.jpg',
      uri: 'https://browser-gateway.test/artifacts/org/run/step/shot.jpg',
      storageKind: 'supabase',
    })

    const loaded = await store.read(written.key)
    expect(download).toHaveBeenCalledWith('org/run/step/shot.jpg')
    expect(loaded.bytes.toString('utf8')).toBe('jpeg-bytes')
    expect(loaded.contentType).toBe('image/jpeg')

    await expect(store.deleteMany([written.key])).resolves.toEqual({ deleted: 1 })
    expect(remove).toHaveBeenCalledWith(['org/run/step/shot.jpg'])
  })

  it('requires Supabase when configured for durable storage', () => {
    expect(() => buildBrowserQaArtifactStore({
      storeKind: 'supabase',
      artifactDir: '/tmp/browser-qa',
      bucket: 'browser-qa-artifacts',
    })).toThrow(/requires Supabase/i)
  })

  it('falls back to local artifacts when durable storage is temporarily unavailable', async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucid-browser-qa-store-'))
    const primary = {
      kind: 'supabase' as const,
      write: vi.fn().mockRejectedValue(new Error('fetch failed')),
      read: vi.fn().mockRejectedValue(new Error('fetch failed')),
      deleteMany: vi.fn().mockResolvedValue({ deleted: 0 }),
    }
    const store = new FallbackBrowserQaArtifactStore(
      primary,
      new LocalBrowserQaArtifactStore({
        artifactDir,
        publicBaseUrl: 'https://browser-gateway.test',
      }),
    )

    try {
      const written = await store.write({
        pathSegments: ['org', 'run', 'step'],
        fileName: 'shot.png',
        bytes: Buffer.from('png-bytes'),
        contentType: 'image/png',
      })

      expect(primary.write).toHaveBeenCalled()
      expect(written).toMatchObject({
        key: 'org/run/step/shot.png',
        storageKind: 'local',
        uri: 'https://browser-gateway.test/artifacts/org/run/step/shot.png',
      })

      const loaded = await store.read(written.key)
      expect(primary.read).toHaveBeenCalledWith(written.key)
      expect(loaded.bytes.toString('utf8')).toBe('png-bytes')
    } finally {
      await fs.rm(artifactDir, { recursive: true, force: true })
    }
  })

  it('mirrors durable artifacts locally for immediate replay fallback', async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucid-browser-qa-store-'))
    const primary = {
      kind: 'supabase' as const,
      write: vi.fn().mockResolvedValue({
        key: 'org/run/step/shot.png',
        uri: 'https://browser-gateway.test/artifacts/org/run/step/shot.png',
        contentType: 'image/png',
        byteLength: 9,
        storageKind: 'supabase' as const,
      }),
      read: vi.fn().mockRejectedValue(new Error('Artifact not found')),
      deleteMany: vi.fn().mockResolvedValue({ deleted: 1 }),
    }
    const store = new FallbackBrowserQaArtifactStore(
      primary,
      new LocalBrowserQaArtifactStore({
        artifactDir,
        publicBaseUrl: 'https://browser-gateway.test',
      }),
    )

    try {
      const written = await store.write({
        pathSegments: ['org', 'run', 'step'],
        fileName: 'shot.png',
        bytes: Buffer.from('png-bytes'),
        contentType: 'image/png',
      })

      expect(written.storageKind).toBe('supabase')

      const loaded = await store.read(written.key)
      expect(primary.read).toHaveBeenCalledWith(written.key)
      expect(loaded.storageKind).toBe('local')
      expect(loaded.bytes.toString('utf8')).toBe('png-bytes')
    } finally {
      await fs.rm(artifactDir, { recursive: true, force: true })
    }
  })
})
