import { LUCID_NATIVE_FEATURE_IDS, type LucidNativeFeatureId } from '@lucid/app-core'
import { z } from 'zod'

export const lucidAppModeSchema = z.enum(['production', 'self-hosted', 'development'])
export type LucidAppMode = z.infer<typeof lucidAppModeSchema>

export const nativeBootstrapSchema = z
  .object({
    app: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
      environment: z.string().min(1),
    }),
    urls: z.object({
      app: z.string().url(),
      support: z.string().url().optional(),
      status: z.string().url().optional(),
    }),
    features: z
      .object({
        desktopDeepLinks: z.boolean(),
        nativeDeviceRegistration: z.boolean(),
        mobileCompanion: z.boolean(),
        mobilePush: z.boolean(),
      })
      .catchall(z.boolean()),
    desktop: z.object({
      protocol: z.string().min(1),
      updateChannel: z.enum(['stable', 'beta', 'dev', 'internal']),
      minVersion: z.string().min(1),
    }),
    mobile: z.object({
      minVersion: z.string().min(1),
      pushProvider: z.enum(['expo']).optional(),
    }),
  })
  .strict()

export type NativeBootstrap = z.infer<typeof nativeBootstrapSchema>

export const nativeDevicePlatformSchema = z.enum(['macos', 'windows', 'linux', 'ios', 'android', 'web'])
export type NativeDevicePlatform = z.infer<typeof nativeDevicePlatformSchema>

export const nativeDeviceAppKindSchema = z.enum(['desktop', 'mobile', 'pwa'])
export type NativeDeviceAppKind = z.infer<typeof nativeDeviceAppKindSchema>

export const nativePushProviderSchema = z.enum(['expo', 'apns', 'fcm', 'desktop-local'])
export type NativePushProvider = z.infer<typeof nativePushProviderSchema>

export const nativeDeviceSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    orgId: z.string().uuid().nullable(),
    platform: nativeDevicePlatformSchema,
    appKind: nativeDeviceAppKindSchema,
    installId: z.string().min(1),
    deviceName: z.string().nullable(),
    appVersion: z.string().nullable(),
    osVersion: z.string().nullable(),
    pushProvider: nativePushProviderSchema.nullable(),
    hasPushToken: z.boolean(),
    notificationSettings: z.record(z.string(), z.unknown()),
    metadata: z.record(z.string(), z.unknown()),
    lastSeenAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()

export type NativeDevice = z.infer<typeof nativeDeviceSchema>

export const registerNativeDeviceInputSchema = z
  .object({
    orgId: z.string().uuid().nullable().optional(),
    platform: nativeDevicePlatformSchema,
    appKind: nativeDeviceAppKindSchema,
    installId: z.string().min(1).max(200),
    deviceName: z.string().min(1).max(200).optional(),
    appVersion: z.string().min(1).max(80).optional(),
    osVersion: z.string().min(1).max(120).optional(),
    pushProvider: nativePushProviderSchema.optional(),
    pushToken: z.string().min(1).max(4096).optional(),
    notificationSettings: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type RegisterNativeDeviceInput = z.infer<typeof registerNativeDeviceInputSchema>

export const updateNativeDeviceInputSchema = z
  .object({
    deviceName: z.string().min(1).max(200).optional(),
    appVersion: z.string().min(1).max(80).optional(),
    osVersion: z.string().min(1).max(120).optional(),
    pushProvider: nativePushProviderSchema.nullable().optional(),
    pushToken: z.string().min(1).max(4096).nullable().optional(),
    notificationSettings: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    revoked: z.boolean().optional(),
  })
  .strict()

export type UpdateNativeDeviceInput = z.infer<typeof updateNativeDeviceInputSchema>

export const nativeDeviceListResponseSchema = z
  .object({
    devices: z.array(nativeDeviceSchema),
  })
  .strict()

export const nativeDeviceResponseSchema = z
  .object({
    device: nativeDeviceSchema,
  })
  .strict()

export const nativeDeviceDeleteResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict()

export type NativeDeviceListResponse = z.infer<typeof nativeDeviceListResponseSchema>
export type NativeDeviceResponse = z.infer<typeof nativeDeviceResponseSchema>

export const nativeSessionProviderSchema = z.enum(['privy'])
export type NativeSessionProvider = z.infer<typeof nativeSessionProviderSchema>

export const nativeSessionHandoffInputSchema = z
  .object({
    provider: nativeSessionProviderSchema.default('privy'),
    appKind: nativeDeviceAppKindSchema,
    platform: nativeDevicePlatformSchema,
    installId: z.string().min(1).max(200),
    returnUrl: z.string().url().optional(),
    deviceName: z.string().min(1).max(200).optional(),
  })
  .strict()

export const nativeSessionHandoffResponseSchema = z
  .object({
    handoffId: z.string().min(1),
    provider: nativeSessionProviderSchema,
    status: z.enum(['pending', 'completed', 'expired']),
    authorizeUrl: z.string().url(),
    expiresAt: z.string(),
  })
  .strict()

export type NativeSessionHandoffInput = z.input<typeof nativeSessionHandoffInputSchema>
export type NativeSessionHandoffResponse = z.infer<typeof nativeSessionHandoffResponseSchema>

export const nativePushRegistrationInputSchema = z
  .object({
    deviceId: z.string().uuid(),
    provider: nativePushProviderSchema,
    token: z.string().min(1).max(4096),
    topics: z.array(z.enum(['approvals', 'runs', 'security', 'product'])).default(['approvals', 'runs']),
  })
  .strict()

export const nativePushRegistrationResponseSchema = z
  .object({
    device: nativeDeviceSchema,
    topics: z.array(z.string()),
  })
  .strict()

export type NativePushRegistrationInput = z.input<typeof nativePushRegistrationInputSchema>
export type NativePushRegistrationResponse = z.infer<typeof nativePushRegistrationResponseSchema>

const nativeFeatureIdSchema = z.custom<LucidNativeFeatureId>(
  (value) => typeof value === 'string' && (LUCID_NATIVE_FEATURE_IDS as readonly string[]).includes(value),
  'Unknown native feature id',
)

export const nativeCommandContextSchema = z
  .object({
    workspaceId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    agentId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
    approvalId: z.string().uuid().optional(),
    source: z.enum(['mobile', 'desktop', 'notification', 'share-sheet', 'shortcut', 'widget']).optional(),
  })
  .catchall(z.unknown())

export type NativeCommandContext = z.infer<typeof nativeCommandContextSchema>

export const nativeVoiceCommandInputSchema = z
  .object({
    deviceId: z.string().uuid().optional(),
    mode: z.enum(['hold-to-talk', 'typed-command']).default('hold-to-talk'),
    transcript: z.string().min(1).max(8000).optional(),
    audioUploadId: z.string().min(1).max(300).optional(),
    locale: z.string().min(2).max(32).optional(),
    context: nativeCommandContextSchema.optional(),
  })
  .strict()
  .refine((input) => Boolean(input.transcript || input.audioUploadId), {
    message: 'transcript or audioUploadId is required',
    path: ['transcript'],
  })

export const nativeVoiceCommandResponseSchema = z
  .object({
    commandId: z.string().min(1),
    interpretedCommand: z.string().min(1),
    responseText: z.string().min(1),
    requiresConfirmation: z.boolean(),
    confirmation: z
      .object({
        actionId: z.string().min(1),
        risk: z.enum(['passive', 'user-initiated', 'confirmation-required', 'privileged']),
        prompt: z.string().min(1),
      })
      .optional(),
  })
  .strict()

export type NativeVoiceCommandInput = z.input<typeof nativeVoiceCommandInputSchema>
export type NativeVoiceCommandResponse = z.infer<typeof nativeVoiceCommandResponseSchema>

export const nativeActionDispatchInputSchema = z
  .object({
    featureId: nativeFeatureIdSchema,
    actionId: z.string().min(1).max(200),
    deviceId: z.string().uuid().optional(),
    idempotencyKey: z.string().min(1).max(200),
    context: nativeCommandContextSchema.optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
    confirmation: z
      .object({
        confirmedAt: z.string(),
        method: z.enum(['tap', 'biometric', 'passcode', 'desktop-confirmation']),
        receipt: z.string().min(1).max(1000).optional(),
      })
      .optional(),
  })
  .strict()

export const nativeActionDispatchResponseSchema = z
  .object({
    actionId: z.string().min(1),
    status: z.enum(['queued', 'completed', 'rejected', 'requires-confirmation']),
    receiptId: z.string().min(1).optional(),
    message: z.string().optional(),
  })
  .strict()

export type NativeActionDispatchInput = z.input<typeof nativeActionDispatchInputSchema>
export type NativeActionDispatchResponse = z.infer<typeof nativeActionDispatchResponseSchema>
