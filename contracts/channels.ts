/**
 * AI Assistant Channel Schemas
 * 
 * Pure TypeScript + Zod - no framework dependencies.
 * Shared between src/ (Next.js) and worker/ (Node.js).
 */

import { z } from 'zod'

// =============================================================================
// CHANNEL TYPES
// =============================================================================

export const ChannelTypeSchema = z.enum([
  'telegram',
  'whatsapp',
  'web',
  'discord',
  'agent',      // Cross-agent messaging (no webhook/secrets)
])

export type ChannelType = z.infer<typeof ChannelTypeSchema>

// =============================================================================
// ASSISTANT CHANNEL (DB Record)
// =============================================================================

export const AssistantChannelSchema = z.object({
  id: z.string().uuid(),
  assistant_id: z.string().uuid(),
  channel_type: ChannelTypeSchema,
  
  // Security: Hash for webhook validation (compare without decryption)
  // Nullable for channel types that don't use webhooks (e.g. 'agent')
  secret_token_hash: z.string().nullable(),
  
  // Encrypted secrets (only decrypted in worker)
  encrypted_secrets_id: z.string().uuid().nullable(),
  
  // External identifier (bot username, phone number, etc.)
  external_channel_id: z.string().nullable(),
  
  // Webhook URL for this channel
  webhook_url: z.string().url().nullable(),
  
  // Status
  is_active: z.boolean().default(true),
  
  // Timestamps
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type AssistantChannel = z.infer<typeof AssistantChannelSchema>

// For inserting new channels
export const AssistantChannelInsertSchema = AssistantChannelSchema.pick({
  assistant_id: true,
  channel_type: true,
  secret_token_hash: true,
  encrypted_secrets_id: true,
  external_channel_id: true,
  webhook_url: true,
}).extend({
  is_active: z.boolean().default(true),
})

export type AssistantChannelInsert = z.infer<typeof AssistantChannelInsertSchema>

// =============================================================================
// CHANNEL SECRETS (Decrypted shapes - only used in worker)
// =============================================================================

/**
 * Telegram bot secrets
 * @see https://core.telegram.org/bots/api
 */
export interface TelegramSecrets {
  bot_token: string           // Bot API token from @BotFather
  secret_token: string        // Webhook verification token (we generate)
}

export const TelegramSecretsSchema = z.object({
  bot_token: z.string().min(1),
  secret_token: z.string().min(32),
})

/**
 * WhatsApp Cloud API secrets
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export interface WhatsAppSecrets {
  phone_number_id: string     // Meta phone number ID
  access_token: string        // Permanent access token
  verify_token: string        // Webhook verification token (we generate)
  business_account_id?: string
}

export const WhatsAppSecretsSchema = z.object({
  phone_number_id: z.string().min(1),
  access_token: z.string().min(1),
  verify_token: z.string().min(16),
  business_account_id: z.string().optional(),
})

// Union type for all channel secrets
export type ChannelSecrets = TelegramSecrets | WhatsAppSecrets

// =============================================================================
// ENCRYPTED SECRETS TABLE (DB Record)
// =============================================================================

export const EncryptedSecretsSchema = z.object({
  id: z.string().uuid(),
  encrypted_data: z.string(), // AES-256-GCM encrypted JSON
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type EncryptedSecrets = z.infer<typeof EncryptedSecretsSchema>

// =============================================================================
// TELEGRAM WEBHOOK PAYLOAD
// =============================================================================

/**
 * Telegram Update object (simplified for our use case)
 * @see https://core.telegram.org/bots/api#update
 */
export const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean(),
      first_name: z.string(),
      last_name: z.string().optional(),
      username: z.string().optional(),
      language_code: z.string().optional(),
    }).optional(),
    chat: z.object({
      id: z.number(),
      type: z.enum(['private', 'group', 'supergroup', 'channel']),
      title: z.string().optional(),
      username: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
    }),
    date: z.number(),
    text: z.string().optional(),
    // Add more fields as needed (photo, document, etc.)
  }).optional(),
  // edited_message, channel_post, callback_query, etc.
})

export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>

// =============================================================================
// WHATSAPP WEBHOOK PAYLOAD
// =============================================================================

/**
 * WhatsApp Cloud API Webhook payload (simplified)
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
export const WhatsAppWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      value: z.object({
        messaging_product: z.literal('whatsapp'),
        metadata: z.object({
          display_phone_number: z.string(),
          phone_number_id: z.string(),
        }),
        contacts: z.array(z.object({
          profile: z.object({
            name: z.string(),
          }),
          wa_id: z.string(),
        })).optional(),
        messages: z.array(z.object({
          from: z.string(),
          id: z.string(),
          timestamp: z.string(),
          text: z.object({
            body: z.string(),
          }).optional(),
          type: z.string(),
          // Add more message types as needed
        })).optional(),
        statuses: z.array(z.object({
          id: z.string(),
          status: z.enum(['sent', 'delivered', 'read', 'failed']),
          timestamp: z.string(),
          recipient_id: z.string(),
        })).optional(),
      }),
      field: z.literal('messages'),
    })),
  })),
})

export type WhatsAppWebhook = z.infer<typeof WhatsAppWebhookSchema>