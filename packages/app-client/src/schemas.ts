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
