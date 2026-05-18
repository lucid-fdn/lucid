import 'server-only'

import { loadOpenClawRuntime } from '../shared/runtime'
import type { ShimDeliveryResult } from '../shared/types'

function readConfigString(
  channelConfig: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | undefined {
  if (!channelConfig || typeof channelConfig !== 'object') return undefined

  for (const key of keys) {
    const value = channelConfig[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

/**
 * Managed iMessage shim.
 *
 * This is intentionally BYOB/self-hosted only: Lucid does not expose iMessage
 * as a product-connectable channel yet, but if an operator provisions a manual
 * `assistant_channels` row on a macOS-hosted deployment, we can still route
 * outbound text through OpenClaw's existing `imsg` sender.
 */
export async function sendIMessageViaShim(
  secrets: Record<string, string>,
  destinationId: string,
  text: string,
  replyToId: string | null,
  channelConfig?: Record<string, unknown> | null,
): Promise<ShimDeliveryResult> {
  const runtime = await loadOpenClawRuntime()

  const cliPath =
    secrets.cli_path ||
    secrets.cliPath ||
    readConfigString(channelConfig, 'imessage_cli_path', 'imessageCliPath', 'cli_path', 'cliPath')
  const dbPath =
    secrets.db_path ||
    secrets.dbPath ||
    readConfigString(channelConfig, 'imessage_db_path', 'imessageDbPath', 'db_path', 'dbPath')
  const service =
    secrets.service ||
    readConfigString(channelConfig, 'imessage_service', 'imessageService', 'service')
  const region =
    secrets.region ||
    readConfigString(channelConfig, 'imessage_region', 'imessageRegion', 'region')
  const accountId =
    secrets.account_id ||
    secrets.accountId ||
    readConfigString(channelConfig, 'imessage_account_id', 'imessageAccountId', 'account_id', 'accountId')

  const result = await runtime.sendMessageIMessage(destinationId, text, {
    ...(cliPath ? { cliPath } : {}),
    ...(dbPath ? { dbPath } : {}),
    ...(service ? { service } : {}),
    ...(region ? { region } : {}),
    ...(accountId ? { accountId } : {}),
    ...(replyToId ? { replyToId } : {}),
  })

  return {
    delivered: true,
    externalMessageId:
      result.messageId && result.messageId !== 'unknown'
        ? result.messageId
        : null,
  }
}
