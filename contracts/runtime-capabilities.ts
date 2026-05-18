import { z } from 'zod'
import { AGENT_ENGINES, RUNTIME_FLAVORS } from '@lucid/runtime-compat'

export const RuntimeCapabilityKeySchema = z.enum([
  'agent_ops.run',
  'agent_ops.plan_only',
  'agent_ops.review_candidates',
  'browser.read',
  'browser.mutate',
  'browser.trust_shield',
  'browser.handoff',
  'channels.native',
  'engine_home.snapshot',
  'engine_home.diff',
  'engine_home.archive',
  'engine_home.candidate',
  'eval.cross_provider',
  'knowledge.read',
  'knowledge.write',
  'knowledge.claims',
  'knowledge.think',
  'knowledge.forget',
  'l2.project',
  'runtime.session',
  'runtime.services',
  'runtime.native_channels',
])

export type RuntimeCapabilityKey = z.infer<typeof RuntimeCapabilityKeySchema>

export const RuntimeCapabilitySupportStatusSchema = z.enum([
  'supported',
  'partial',
  'unsupported',
  'blocked',
])

export type RuntimeCapabilitySupportStatus = z.infer<typeof RuntimeCapabilitySupportStatusSchema>

export const RuntimeCapabilitySupportSchema = z.object({
  key: RuntimeCapabilityKeySchema,
  status: RuntimeCapabilitySupportStatusSchema,
  source: z.enum(['runtime', 'lucid_core', 'adapter', 'external_bridge']),
  notes: z.array(z.string()).default([]),
  requiredReview: z.boolean().default(false),
  requiredPolicyKeys: z.array(z.string()).default([]),
})

export type RuntimeCapabilitySupport = z.infer<typeof RuntimeCapabilitySupportSchema>

export const RuntimeCapabilityRegistryEntrySchema = z.object({
  key: RuntimeCapabilityKeySchema,
  label: z.string().min(1),
  category: z.enum([
    'agent_ops',
    'browser',
    'channels',
    'engine_home',
    'evals',
    'knowledge',
    'l2',
    'runtime',
  ]),
  description: z.string().min(1),
  reviewRequiredByDefault: z.boolean().default(false),
})

export type RuntimeCapabilityRegistryEntry = z.infer<typeof RuntimeCapabilityRegistryEntrySchema>

export const RuntimeCapabilitySurfaceSchema = z.object({
  engine: z.enum(AGENT_ENGINES),
  runtimeFlavor: z.enum(RUNTIME_FLAVORS),
  adapterType: z.string().nullable().optional(),
  generatedAt: z.string().datetime(),
  capabilities: z.array(RuntimeCapabilitySupportSchema),
})

export type RuntimeCapabilitySurface = z.infer<typeof RuntimeCapabilitySurfaceSchema>
