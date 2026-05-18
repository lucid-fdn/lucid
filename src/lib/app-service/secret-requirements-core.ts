import { z } from 'zod'
import { containsAppServiceSecret } from './security-redaction'
import { APP_SERVICE_ALLOWED_DEPLOY_SECRET_SOURCES } from './product-policy-core'

export type AppSecretRequirementAuditAction = 'connected' | 'changed'

export const APP_SECRET_REQUIREMENT_EVENT_TYPES = {
  connected: 'app_secret_requirement_connected',
  changed: 'app_secret_requirement_changed',
} as const satisfies Record<AppSecretRequirementAuditAction, string>

const SecretRequirementKeySchema = z.string().regex(/^[A-Z0-9_]{1,80}$/)
const AppSecretRequirementStorageSourceSchema = z.enum(['server_env', 'encrypted_secret_store'])
const ServerEnvReferenceSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,119}$/)
const EncryptedSecretReferenceSchema = z.string().regex(/^(secret|vault|app-secret):\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{1,220}$/)

const PLAINTEXT_SECRET_KEY_PATTERN = /(^|[_-])(api[_-]?key|authorization|bearer|client[_-]?secret|cookie|jwt|password|private[_-]?key|refresh[_-]?token|secret|token|value)([_-]|$)/i

export const AppSecretRequirementConnectionInputSchema = z.object({
  action: z.enum(['connected', 'changed']).default('connected'),
  source: AppSecretRequirementStorageSourceSchema,
  reference: z.string().trim().min(1).max(240),
  provider: z.string().trim().min(1).max(80).optional(),
  note: z.string().trim().max(500).optional(),
}).strict().superRefine((input, ctx) => {
  const referenceResult = input.source === 'server_env'
    ? ServerEnvReferenceSchema.safeParse(input.reference)
    : EncryptedSecretReferenceSchema.safeParse(input.reference)

  if (!referenceResult.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reference'],
      message: input.source === 'server_env'
        ? 'Server env secret references must be uppercase environment variable names.'
        : 'Encrypted secret references must use secret://, vault://, or app-secret://.',
    })
  }
})

export type AppSecretRequirementConnectionInput = z.infer<typeof AppSecretRequirementConnectionInputSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertNoPlaintextSecretMaterial(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPlaintextSecretMaterial(entry, [...path, String(index)]))
    return
  }

  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (PLAINTEXT_SECRET_KEY_PATTERN.test(key)) {
        throw new Error(`Plaintext secret field "${[...path, key].join('.')}" is not accepted.`)
      }
      assertNoPlaintextSecretMaterial(entry, [...path, key])
    }
    return
  }

  if (typeof value === 'string' && path.at(-1) !== 'reference' && containsAppServiceSecret(value)) {
    throw new Error(`Plaintext secret value "${path.join('.') || 'input'}" is not accepted.`)
  }
}

export function parseAppSecretRequirementConnectionInput(
  rawInput: unknown,
): AppSecretRequirementConnectionInput {
  assertNoPlaintextSecretMaterial(rawInput)
  return AppSecretRequirementConnectionInputSchema.parse(rawInput)
}

export function appSecretRequirementEventType(action: AppSecretRequirementAuditAction): string {
  return APP_SECRET_REQUIREMENT_EVENT_TYPES[action]
}

export function buildAppSecretRequirementAuditPayload(input: {
  key: string
  userId: string
  connection: AppSecretRequirementConnectionInput
}) {
  const key = SecretRequirementKeySchema.parse(input.key)

  return {
    secret_requirement_key: key,
    action: input.connection.action,
    source: input.connection.source,
    reference: input.connection.reference,
    provider: input.connection.provider ?? null,
    note: input.connection.note ?? null,
    changed_by: input.userId,
    plaintext_secret_received: false,
    allowed_secret_sources: [...APP_SERVICE_ALLOWED_DEPLOY_SECRET_SOURCES],
  }
}
