import 'server-only'

import type { ManagedDeliveryContext, ManagedDeliveryResult } from './types'

export interface RelayTransportAdapter {
  readonly channelType: string
  send(context: ManagedDeliveryContext): Promise<ManagedDeliveryResult>
}
