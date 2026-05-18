/**
 * Engine Home Virtualization (EHV) contract.
 *
 * EHV is the engine-neutral snapshot/diff/archive boundary for runtime-local
 * home state such as Hermes memories, skills, sessions, indexes, and future
 * OpenClaw-native home data. This file is pure contracts only.
 */

import { z } from 'zod'
import { AgentEngineSchema, RuntimeFlavorSchema } from './runtime-execution'

export const EngineHomeSnapshotVersionSchema = z.literal('engine-home-snapshot-v1')
export const EngineHomeArchiveVersionSchema = z.literal('engine-home-archive-v1')
export const EngineHomeManifestVersionSchema = z.literal('engine-home-manifest-v1')

export const EngineHomeLayoutSchema = z.enum([
  'hermes_home',
  'openclaw_home',
  'generic_home',
  'unknown',
])

export const EngineHomeEntryKindSchema = z.enum([
  'identity',
  'config',
  'memory',
  'skill',
  'session',
  'index',
  'cache',
  'tool_cache',
  'runtime_state',
  'workflow',
  'migration',
  'unknown',
])

export const EngineHomeEntryMutabilitySchema = z.enum([
  'read_only',
  'lucid_managed',
  'runtime_mutable',
  'user_mutable',
  'cache',
])

export const EngineHomeCommitModeSchema = z.enum([
  'observe_only',
  'candidate_only',
  'review_required',
  'auto_commit',
])

export const EngineHomeArchiveEncodingSchema = z.enum(['utf8', 'base64'])

export const EngineHomeEntryClassificationSchema = z.object({
  engine: AgentEngineSchema,
  layout: EngineHomeLayoutSchema,
  kind: EngineHomeEntryKindSchema,
  mutability: EngineHomeEntryMutabilitySchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().max(300).optional(),
})

export type EngineHomeEntryClassification = z.infer<typeof EngineHomeEntryClassificationSchema>

export const EngineHomeFileEntrySchema = z.object({
  relativePath: z.string().min(1).max(1_000),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  classification: EngineHomeEntryClassificationSchema,
  mtimeMs: z.number().nonnegative().optional(),
})

export type EngineHomeFileEntry = z.infer<typeof EngineHomeFileEntrySchema>

export const EngineHomeSnapshotSchema = z.object({
  version: EngineHomeSnapshotVersionSchema,
  engine: AgentEngineSchema,
  runtimeFlavor: RuntimeFlavorSchema.optional(),
  homeId: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  rootDigest: z.string().regex(/^[a-f0-9]{64}$/),
  entries: z.array(EngineHomeFileEntrySchema),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type EngineHomeSnapshot = z.infer<typeof EngineHomeSnapshotSchema>

export const EngineHomeDiffSchema = z.object({
  beforeDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  afterDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  added: z.array(EngineHomeFileEntrySchema),
  removed: z.array(EngineHomeFileEntrySchema),
  modified: z.array(z.object({
    before: EngineHomeFileEntrySchema,
    after: EngineHomeFileEntrySchema,
  })),
  unchanged: z.array(EngineHomeFileEntrySchema),
  summary: z.object({
    added: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    modified: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
  }),
})

export type EngineHomeDiff = z.infer<typeof EngineHomeDiffSchema>

export const EngineHomeManifestSchema = z.object({
  version: EngineHomeManifestVersionSchema,
  snapshotVersion: EngineHomeSnapshotVersionSchema,
  engine: AgentEngineSchema,
  runtimeFlavor: RuntimeFlavorSchema.optional(),
  homeId: z.string().min(1).max(200),
  rootDigest: z.string().regex(/^[a-f0-9]{64}$/),
  entryCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  labels: z.record(z.string(), z.string()).default({}),
})

export type EngineHomeManifest = z.infer<typeof EngineHomeManifestSchema>

export const EngineHomeArchiveFileSchema = z.object({
  relativePath: z.string().min(1).max(1_000),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  encoding: EngineHomeArchiveEncodingSchema,
  content: z.string(),
  classification: EngineHomeEntryClassificationSchema,
})

export type EngineHomeArchiveFile = z.infer<typeof EngineHomeArchiveFileSchema>

export const EngineHomeArchiveSchema = z.object({
  version: EngineHomeArchiveVersionSchema,
  manifest: EngineHomeManifestSchema,
  files: z.array(EngineHomeArchiveFileSchema),
})

export type EngineHomeArchive = z.infer<typeof EngineHomeArchiveSchema>

export const EngineHomeCommitRequestSchema = z.object({
  homeId: z.string().min(1).max(200),
  engine: AgentEngineSchema,
  mode: EngineHomeCommitModeSchema,
  beforeDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  afterDigest: z.string().regex(/^[a-f0-9]{64}$/),
  diff: EngineHomeDiffSchema,
  requestedBy: z.enum(['runtime', 'user', 'system']),
  reason: z.string().max(500).optional(),
})

export type EngineHomeCommitRequest = z.infer<typeof EngineHomeCommitRequestSchema>

export const EngineHomeRollbackRequestSchema = z.object({
  homeId: z.string().min(1).max(200),
  engine: AgentEngineSchema,
  targetDigest: z.string().regex(/^[a-f0-9]{64}$/),
  requestedBy: z.enum(['runtime', 'user', 'system']),
  reason: z.string().max(500).optional(),
})

export type EngineHomeRollbackRequest = z.infer<typeof EngineHomeRollbackRequestSchema>
