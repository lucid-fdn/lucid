'use client'

import { useEffect, useRef } from 'react'
import { ChatLimitCard } from './chat-limit-card'
import { InlineUpgradePrompt } from '@/components/access-control/upgrade-card'
import type { EntitlementDeny } from '@/lib/entitlements/types'
import type { EntitlementContext } from '@/lib/entitlements/registry'
import { getEntitlementDisplay } from '@/lib/entitlements/registry'
import { toast } from '@/hooks/use-toast'

interface EntitlementErrorProps {
  deny: EntitlementDeny
  /** Override the default context hint from the registry */
  context?: EntitlementContext
  className?: string
}

/**
 * Context-aware entitlement error renderer.
 * Delegates to the right variant based on where the error occurred.
 *
 * - chat:   In-chat upgrade card (ChatGPT style)
 * - modal:  UpgradeCard dialog (Notion style)
 * - inline: InlineUpgradePrompt bar
 * - toast:  Sonner toast with CTA
 */
export function EntitlementError({ deny, context: contextOverride, className }: EntitlementErrorProps) {
  const display = getEntitlementDisplay(deny.entitlement.metric)
  const ctx = contextOverride || display.contextHint

  switch (ctx) {
    case 'chat':
      return <ChatLimitCard deny={deny} className={className} />

    case 'inline':
      return (
        <InlineUpgradePrompt
          feature={display.label}
          requiredPlan={(deny.entitlement.requiredPlan || 'pro') as 'pro' | 'business'}
          className={className}
        />
      )

    case 'toast':
      return <EntitlementToastEffect deny={deny} />

    case 'modal':
      // For modal context, render the chat card as fallback.
      // The caller should wrap this in a Dialog if needed.
      return <ChatLimitCard deny={deny} className={className} />

    default:
      return <ChatLimitCard deny={deny} className={className} />
  }
}

/** Renders nothing but fires a toast once via useEffect */
function EntitlementToastEffect({ deny }: { deny: EntitlementDeny }) {
  const firedRef = useRef(false)
  useEffect(() => {
    if (!firedRef.current) {
      firedRef.current = true
      showEntitlementToast(deny)
    }
  }, [deny])
  return null
}

/**
 * Show an entitlement error as a Sonner toast.
 * Call directly from error handlers when you don't want inline rendering.
 */
export function showEntitlementToast(deny: EntitlementDeny) {
  const upgrade = deny.entitlement.upgradeTarget

  toast.error(deny.message, {
    description: upgrade?.valueProp,
    action: upgrade ? {
      label: `Upgrade to ${upgrade.displayName}`,
      onClick: () => {
        window.location.href = `/settings/billing?upgrade=${deny.action.checkoutPlan || 'pro'}`
      },
    } : undefined,
    duration: 8000,
  })
}

/**
 * Parse a fetch Response into an EntitlementDeny, if it is one.
 * Returns null if the response is not an entitlement error.
 */
export function parseEntitlementError(responseBody: unknown): EntitlementDeny | null {
  if (!responseBody || typeof responseBody !== 'object') return null

  const body = responseBody as Record<string, unknown>
  const error = body.error

  if (!error || typeof error !== 'object') return null

  const deny = error as Record<string, unknown>
  if (deny.type !== 'entitlement_error') return null

  return deny as unknown as EntitlementDeny
}
