/**
 * AI Assistant Event Schemas
 * 
 * Pure TypeScript + Zod - no framework dependencies.
 * Shared between src/ (Next.js) and worker/ (Node.js).
 */

import { z } from 'zod'

// =============================================================================
// INBOUND EVENTS (Messages coming IN from channels)
// =============================================================================

export const InboundEventStatusSchema = z.enum([
  'pending',    // Waiting to be processed
  'processing', // Currently being processed by a worker
  'done',       // Successfully processed
  'failed',     // Permanently failed after max retries
])

export type InboundEventStatus = z.infer<typeof InboundEventStatusSchema>

export const InboundEventSchema = z.object({
  id: z.string().uuid(),
  channel_id: z.string().uuid(),
  
  // External identifiers (from Telegram/WhatsApp)
  external_message_id: z.string(),
  external_user_id: z.string(),
  external_chat_id: z.string(),
  
  // Message content
  message_text: z.string().nullable(),
  message_data: z.record(z.string(), z.unknown()).nullable(), // For media, buttons, etc.
  
  // Processing state
  status: InboundEventStatusSchema,
  attempts: z.number().int().min(0),
  max_attempts: z.number().int().min(1).default(5),
  next_attempt_at: z.string().datetime().nullable(),
  last_error: z.string().nullable(),
  
  // Lease/lock for worker claim
  locked_at: z.string().datetime().nullable(),
  locked_by: z.string().nullable(),
  locked_until: z.string().datetime().nullable(),
  
  // Timestamps
  created_at: z.string().datetime(),
  processed_at: z.string().datetime().nullable(),
})

export type InboundEvent = z.infer<typeof InboundEventSchema>

// For inserting new events (auto-generated fields omitted)
export const InboundEventInsertSchema = InboundEventSchema.pick({
  channel_id: true,
  external_message_id: true,
  external_user_id: true,
  external_chat_id: true,
  message_text: true,
  message_data: true,
}).extend({
  // Defaults for optional fields
  status: InboundEventStatusSchema.default('pending'),
  attempts: z.number().int().min(0).default(0),
  max_attempts: z.number().int().min(1).default(5),
})

export type InboundEventInsert = z.infer<typeof InboundEventInsertSchema>

// =============================================================================
// OUTBOUND EVENTS (Messages going OUT to channels)
// =============================================================================

export const OutboundEventStatusSchema = z.enum([
  'pending',    // Waiting to be sent
  'processing', // Currently being sent by a worker
  'sent',       // Successfully sent
  'failed',     // Permanently failed after max retries
])

export type OutboundEventStatus = z.infer<typeof OutboundEventStatusSchema>

export const OutboundEventSchema = z.object({
  id: z.string().uuid(),
  channel_id: z.string().uuid(),
  
  // Link to inbound event that triggered this response
  inbound_event_id: z.string().uuid().nullable(),
  conversation_id: z.string().uuid().nullable(),
  
  // Message content
  message_text: z.string(),
  reply_to_external_id: z.string().nullable(), // For reply threading
  
  // Processing state
  status: OutboundEventStatusSchema,
  attempts: z.number().int().min(0),
  max_attempts: z.number().int().min(1).default(5),
  next_attempt_at: z.string().datetime().nullable(),
  last_error: z.string().nullable(),
  
  // Lease/lock for worker claim
  locked_at: z.string().datetime().nullable(),
  locked_by: z.string().nullable(),
  locked_until: z.string().datetime().nullable(),
  
  // Timestamps
  created_at: z.string().datetime(),
  sent_at: z.string().datetime().nullable(),
  
  // Response from channel API
  external_message_id: z.string().nullable(),
})

export type OutboundEvent = z.infer<typeof OutboundEventSchema>

// For inserting new outbound events
export const OutboundEventInsertSchema = OutboundEventSchema.pick({
  channel_id: true,
  inbound_event_id: true,
  conversation_id: true,
  message_text: true,
  reply_to_external_id: true,
}).extend({
  status: OutboundEventStatusSchema.default('pending'),
  attempts: z.number().int().min(0).default(0),
  max_attempts: z.number().int().min(1).default(5),
})

export type OutboundEventInsert = z.infer<typeof OutboundEventInsertSchema>

// =============================================================================
// WEBHOOK TRIGGER PAYLOAD (sent to /api/worker/trigger)
// =============================================================================

export const WorkerTriggerPayloadSchema = z.object({
  event_type: z.enum(['inbound', 'outbound']),
  event_id: z.string().uuid(),
  channel_id: z.string().uuid(),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
})

export type WorkerTriggerPayload = z.infer<typeof WorkerTriggerPayloadSchema>