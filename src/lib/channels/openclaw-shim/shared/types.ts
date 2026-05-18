import 'server-only'

/**
 * Shape returned by every managed-transport shim sender. Mirrors the
 * `DeliveryResult` used by `src/lib/db/outbound-delivery.ts` so call sites
 * don't need to translate.
 */
export interface ShimDeliveryResult {
  delivered: boolean
  externalMessageId: string | null
  error?: string
}
