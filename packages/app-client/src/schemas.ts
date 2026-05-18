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

export const nativeSessionRefreshInputSchema = z
  .object({
    deviceId: z.string().uuid(),
    refreshToken: z.string().min(1).max(4096),
  })
  .strict()

export const nativeSessionRefreshResponseSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.string(),
    deviceId: z.string().uuid(),
  })
  .strict()

export const nativeSessionRevokeInputSchema = z
  .object({
    deviceId: z.string().uuid().optional(),
    refreshToken: z.string().min(1).max(4096).optional(),
    reason: z.enum(['sign-out', 'device-lost', 'security', 'rotation']).default('sign-out'),
  })
  .strict()

export const nativeSessionRevokeResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict()

export type NativeSessionRefreshInput = z.input<typeof nativeSessionRefreshInputSchema>
export type NativeSessionRefreshResponse = z.infer<typeof nativeSessionRefreshResponseSchema>
export type NativeSessionRevokeInput = z.input<typeof nativeSessionRevokeInputSchema>
export type NativeSessionRevokeResponse = z.infer<typeof nativeSessionRevokeResponseSchema>

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

export const nativeApprovalSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    agentName: z.string().min(1).optional(),
    workspaceId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    runId: z.string().min(1).optional(),
    risk: z.enum(['confirmation-required', 'privileged']),
    status: z.enum(['pending', 'approved', 'denied', 'expired']),
    expiresAt: z.string().optional(),
    createdAt: z.string(),
    deepLink: z.string().optional(),
  })
  .strict()

export const nativeRunSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    agentName: z.string().min(1).optional(),
    workspaceId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    status: z.enum(['queued', 'running', 'paused', 'blocked', 'completed', 'failed', 'cancelled']),
    progress: z.number().min(0).max(100).optional(),
    needsApproval: z.boolean().default(false),
    updatedAt: z.string(),
    deepLink: z.string().optional(),
  })
  .strict()

export const nativeInboxResponseSchema = z
  .object({
    approvals: z.array(nativeApprovalSchema),
    runs: z.array(nativeRunSchema),
  })
  .strict()

export const nativeRunsResponseSchema = z
  .object({
    runs: z.array(nativeRunSchema),
  })
  .strict()

export const nativeApprovalPolicyCheckSchema = z
  .object({
    label: z.string().min(1),
    status: z.enum(['pass', 'warn', 'fail']),
    detail: z.string().min(1),
  })
  .strict()

export const nativeApprovalDetailResponseSchema = z
  .object({
    approval: nativeApprovalSchema,
    explanation: z.string().min(1),
    recommendedDecision: z.enum(['approve', 'deny', 'review']),
    policyChecks: z.array(nativeApprovalPolicyCheckSchema),
  })
  .strict()

export const nativeRunTimelineEventSchema = z
  .object({
    id: z.string().min(1),
    at: z.string(),
    title: z.string().min(1),
    body: z.string().min(1).optional(),
    actor: z.string().min(1).optional(),
    level: z.enum(['info', 'success', 'warning', 'error']).default('info'),
  })
  .strict()

export const nativeRunDetailResponseSchema = z
  .object({
    run: nativeRunSchema,
    timeline: z.array(nativeRunTimelineEventSchema),
  })
  .strict()

export const nativeApprovalDecisionInputSchema = z
  .object({
    decision: z.enum(['approve', 'deny']),
    reason: z.string().max(1000).optional(),
    deviceId: z.string().uuid().optional(),
    confirmation: nativeActionDispatchInputSchema.shape.confirmation.optional(),
  })
  .strict()

export const nativeApprovalDecisionResponseSchema = z
  .object({
    approval: nativeApprovalSchema,
    receipt: nativeActionDispatchResponseSchema,
  })
  .strict()

export const nativeApprovalExplainResponseSchema = z
  .object({
    approvalId: z.string().min(1),
    explanation: z.string().min(1),
    risk: z.enum(['confirmation-required', 'privileged']),
    recommendedDecision: z.enum(['approve', 'deny', 'review']),
  })
  .strict()

export const nativeRunControlInputSchema = z
  .object({
    action: z.enum(['pause', 'resume', 'cancel', 'escalate', 'open']),
    deviceId: z.string().uuid().optional(),
    reason: z.string().max(1000).optional(),
    confirmation: nativeActionDispatchInputSchema.shape.confirmation.optional(),
  })
  .strict()

export const nativeRunControlResponseSchema = z
  .object({
    run: nativeRunSchema,
    receipt: nativeActionDispatchResponseSchema,
  })
  .strict()

export const nativeShareInputSchema = z
  .object({
    kind: z.enum(['screenshot', 'url', 'text', 'file']),
    intent: z.enum(['browser-qa', 'bug-report', 'investigate', 'remember']),
    content: z.string().min(1).max(20000),
    fileName: z.string().min(1).max(300).optional(),
    mimeType: z.string().min(1).max(200).optional(),
    deviceId: z.string().uuid().optional(),
    context: nativeCommandContextSchema.optional(),
  })
  .strict()

export const nativeShareResponseSchema = z
  .object({
    itemId: z.string().min(1),
    status: z.enum(['queued', 'created']),
    title: z.string().min(1),
    deepLink: z.string().optional(),
  })
  .strict()

export type NativeApproval = z.infer<typeof nativeApprovalSchema>
export type NativeRun = z.infer<typeof nativeRunSchema>
export type NativeInboxResponse = z.infer<typeof nativeInboxResponseSchema>
export type NativeRunsResponse = z.infer<typeof nativeRunsResponseSchema>
export type NativeApprovalPolicyCheck = z.infer<typeof nativeApprovalPolicyCheckSchema>
export type NativeApprovalDetailResponse = z.infer<typeof nativeApprovalDetailResponseSchema>
export type NativeApprovalDecisionInput = z.input<typeof nativeApprovalDecisionInputSchema>
export type NativeApprovalDecisionResponse = z.infer<typeof nativeApprovalDecisionResponseSchema>
export type NativeApprovalExplainResponse = z.infer<typeof nativeApprovalExplainResponseSchema>
export type NativeRunTimelineEvent = z.infer<typeof nativeRunTimelineEventSchema>
export type NativeRunDetailResponse = z.infer<typeof nativeRunDetailResponseSchema>
export type NativeRunControlInput = z.input<typeof nativeRunControlInputSchema>
export type NativeRunControlResponse = z.infer<typeof nativeRunControlResponseSchema>
export type NativeShareInput = z.input<typeof nativeShareInputSchema>
export type NativeShareResponse = z.infer<typeof nativeShareResponseSchema>
