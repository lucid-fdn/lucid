/**
 * Industry-Standard Upgrade Flow
 * 
 * Handles plan selection, authentication,

 and checkout redirect
 * Uses sessionStorage for security (cleared on tab close)
 */

export interface PendingUpgrade {
  plan: 'starter' | 'pro' | 'business'
  period: 'monthly' | 'yearly'
  timestamp: number
}

const UPGRADE_KEY = 'pending_upgrade'
const EXPIRY_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Store intended plan upgrade
 * Called before redirecting to login
 */
export function storePendingUpgrade(plan: string, period: 'monthly' | 'yearly'): void {
  const upgrade: PendingUpgrade = {
    plan: plan as 'starter' | 'pro' | 'business',
    period,
    timestamp: Date.now()
  }
  
  // Use sessionStorage (more secure, cleared on tab close)
  sessionStorage.setItem(UPGRADE_KEY, JSON.stringify(upgrade))
}

/**
 * Retrieve and clear pending upgrade
 * Called after login success
 */
export function getPendingUpgrade(): PendingUpgrade | null {
  try {
    const stored = sessionStorage.getItem(UPGRADE_KEY)
    if (!stored) return null
    
    const upgrade: PendingUpgrade = JSON.parse(stored)
    
    // Check expiry (30 minutes)
    if (Date.now() - upgrade.timestamp > EXPIRY_MS) {
      clearPendingUpgrade()
      return null
    }
    
    return upgrade
  } catch {
    return null
  }
}

/**
 * Clear pending upgrade
 */
export function clearPendingUpgrade(): void {
  sessionStorage.removeItem(UPGRADE_KEY)
}

/**
 * Check if upgrade is pending
 */
export function hasPendingUpgrade(): boolean {
  return getPendingUpgrade() !== null
}
