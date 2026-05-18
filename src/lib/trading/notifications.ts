/**
 * Trading Notifications — P0-17
 *
 * Sends notifications for trading events via multiple channels.
 * Currently supports: in-app (Supabase insert), email (future: Resend/SendGrid).
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// Types
// ============================================================================

export type TradingNotificationType =
  | 'trade_executed'
  | 'trade_confirmed'
  | 'trade_failed'
  | 'policy_limit_reached'
  | 'session_signer_expiring'
  | 'daily_summary'

export interface TradingNotification {
  userId: string
  type: TradingNotificationType
  title: string
  message: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Supabase
// ============================================================================

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ============================================================================
// Send Notification
// ============================================================================

/**
 * Send a trading notification. Currently stores in-app only.
 * Email channel can be added by integrating Resend/SendGrid.
 */
export async function sendTradingNotification(
  notification: TradingNotification
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase()

    // In-app notification (stored in notifications table)
    const { error } = await supabase.from('notifications').insert({
      user_id: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata || {},
      read: false,
      created_at: new Date().toISOString(),
    })

    if (error) {
      // If notifications table doesn't exist yet, log and continue
      if (error.code === '42P01') {
        console.warn('[TradingNotifications] notifications table not found — skipping')
        return { success: true }
      }
      console.error('[TradingNotifications] Insert error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('[TradingNotifications] Error:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ============================================================================
// Convenience Methods
// ============================================================================

export async function notifyTradeExecuted(
  userId: string,
  txHash: string,
  chain: string,
  inputToken: string,
  outputToken: string,
  amount: string
): Promise<void> {
  await sendTradingNotification({
    userId,
    type: 'trade_executed',
    title: 'Trade Submitted',
    message: `Swap ${amount} ${inputToken} → ${outputToken} on ${chain}. TX: ${txHash.substring(0, 10)}...`,
    metadata: { txHash, chain, inputToken, outputToken, amount },
  })
}

export async function notifyTradeConfirmed(
  userId: string,
  txHash: string,
  chain: string,
  blockNumber?: number
): Promise<void> {
  await sendTradingNotification({
    userId,
    type: 'trade_confirmed',
    title: 'Trade Confirmed ✓',
    message: `Transaction confirmed on ${chain}${blockNumber ? ` at block ${blockNumber}` : ''}. TX: ${txHash.substring(0, 10)}...`,
    metadata: { txHash, chain, blockNumber },
  })
}

export async function notifyTradeFailed(
  userId: string,
  txHash: string | null,
  chain: string,
  reason: string
): Promise<void> {
  await sendTradingNotification({
    userId,
    type: 'trade_failed',
    title: 'Trade Failed ✗',
    message: `Transaction failed on ${chain}: ${reason}${txHash ? `. TX: ${txHash.substring(0, 10)}...` : ''}`,
    metadata: { txHash, chain, reason },
  })
}

export async function notifyPolicyLimitReached(
  userId: string,
  assistantName: string,
  limitType: 'single_trade' | 'daily',
  currentValue: number,
  limitValue: number
): Promise<void> {
  await sendTradingNotification({
    userId,
    type: 'policy_limit_reached',
    title: 'Trading Limit Reached',
    message: `${assistantName} reached its ${limitType === 'daily' ? 'daily' : 'single trade'} limit ($${currentValue.toFixed(2)} / $${limitValue.toFixed(2)}).`,
    metadata: { assistantName, limitType, currentValue, limitValue },
  })
}

export async function notifySessionSignerExpiring(
  userId: string,
  walletAddress: string,
  expiresAt: Date
): Promise<void> {
  const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  await sendTradingNotification({
    userId,
    type: 'session_signer_expiring',
    title: 'Session Signer Expiring Soon',
    message: `Your session signer for ${walletAddress.substring(0, 10)}... expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Re-authorize to continue autonomous trading.`,
    metadata: { walletAddress, expiresAt: expiresAt.toISOString(), daysLeft },
  })
}