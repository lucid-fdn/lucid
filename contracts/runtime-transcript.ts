/**
 * Runtime transcript parser contract.
 *
 * Adapter parsers convert untrusted runtime stdout/events into safe,
 * structured transcript entries for replay UI. Parser code may be shipped by
 * first-party or external adapters, but the entry shapes stay shared.
 */

import { z } from 'zod'

export const RuntimeTranscriptEntryKindSchema = z.enum([
  'assistant',
  'thinking',
  'user',
  'tool_call',
  'tool_result',
  'init',
  'result',
  'stderr',
  'system',
  'stdout',
  'diff',
  'artifact',
])

export type RuntimeTranscriptEntryKind = z.infer<typeof RuntimeTranscriptEntryKindSchema>

const RuntimeTranscriptBaseEntrySchema = z.object({
  kind: RuntimeTranscriptEntryKindSchema,
  ts: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}).optional(),
})

export const RuntimeTranscriptEntrySchema = z.discriminatedUnion('kind', [
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('assistant'),
    text: z.string(),
    delta: z.boolean().optional(),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('thinking'),
    text: z.string(),
    delta: z.boolean().optional(),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('user'),
    text: z.string(),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('tool_call'),
    name: z.string().min(1),
    input: z.unknown(),
    toolUseId: z.string().min(1).nullable().optional(),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('tool_result'),
    toolUseId: z.string().min(1).nullable().optional(),
    toolName: z.string().min(1).nullable().optional(),
    content: z.string(),
    isError: z.boolean(),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('init'),
    model: z.string().min(1).nullable().optional(),
    sessionId: z.string().min(1).nullable().optional(),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('result'),
    text: z.string(),
    inputTokens: z.number().int().nonnegative().nullable().optional(),
    outputTokens: z.number().int().nonnegative().nullable().optional(),
    cachedTokens: z.number().int().nonnegative().nullable().optional(),
    costUsd: z.number().nonnegative().nullable().optional(),
    subtype: z.string().min(1).nullable().optional(),
    isError: z.boolean().default(false),
    errors: z.array(z.string()).default([]),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('stderr'),
    text: z.string(),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('system'),
    text: z.string(),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('stdout'),
    text: z.string(),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('diff'),
    changeType: z.enum(['add', 'remove', 'context', 'hunk', 'file_header', 'truncation']),
    text: z.string(),
  }),
  RuntimeTranscriptBaseEntrySchema.extend({
    kind: z.literal('artifact'),
    artifactId: z.string().min(1),
    label: z.string().min(1),
    mediaType: z.string().min(1).nullable().optional(),
    url: z.string().url().nullable().optional(),
  }),
])

export type RuntimeTranscriptEntry = z.infer<typeof RuntimeTranscriptEntrySchema>

export const RuntimeTranscriptParserContractSchema = z.object({
  contract: z.literal('lucid.runtimeTranscriptParser'),
  version: z.string().regex(/^1\.\d+\.\d+$/),
  maxBytes: z.number().int().positive().default(50_000),
  deterministic: z.literal(true),
  sandboxed: z.literal(true),
})

export type RuntimeTranscriptParserContract = z.infer<typeof RuntimeTranscriptParserContractSchema>
