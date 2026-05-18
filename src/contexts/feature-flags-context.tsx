'use client'

/**
 * Feature Flags Context — Server-Resolved, Client-Consumed
 *
 * Industry standard pattern (LaunchDarkly / Statsig / Vercel):
 * 1. Server Component resolves ALL flags at runtime (reads env vars)
 * 2. Serialized flag object passed to client via React context
 * 3. Client components read from context — no direct env var access
 *
 * This means changing a FEATURE_* env var on Vercel takes effect
 * immediately on next page load — no redeploy required.
 */

import { createContext, useContext, type ReactNode } from 'react'

// ============================================================================
// Types
// ============================================================================

/** All feature flags available to client components */
export interface ResolvedFeatureFlags {
  // Navigation
  notifications: boolean
  orgSwitcher: boolean
  userMenu: boolean
  search: boolean
  keyboardShortcuts: boolean

  // UI
  darkMode: boolean
  mobileMenu: boolean
  scrollAnimation: boolean

  // Core App
  chat: boolean
  agents: boolean
  agentCreation: boolean
  agentMarketplace: boolean
  marketplace: boolean
  marketplaceAssets: boolean
  marketplaceCompanies: boolean
  marketplaceContributors: boolean
  marketplaceV2API: boolean
  dashboard: boolean
  profile: boolean
  publicProfiles: boolean
  settings: boolean
  onboarding: boolean
  advancedSecurity: boolean
  mfaSettings: boolean
  organizations: boolean
  organizationCreation: boolean
  organizationManagement: boolean
  blog: boolean

  // Auth & Wallet
  walletLogin: boolean
  emailLogin: boolean
  googleLogin: boolean
  web3Features: boolean

  // Communication
  emailNotifications: boolean
  browserNotifications: boolean
  waitlist: boolean
  contactForm: boolean

  // Development
  debugMode: boolean
  betaFeatures: boolean
  advancedAnalytics: boolean

  // System
  cacheEnabled: boolean

  // Workspace
  multiProject: boolean
  multiEnv: boolean
  projectSwitcher: boolean
  envSwitcher: boolean

  // Sidebar
  sidebarCollapsible: boolean
  sidebarFavorites: boolean
  sidebarShared: boolean
  sidebarPrivate: boolean
  sidebarSearch: boolean
  settingsModal: boolean
  teamInDropdown: boolean

  // Lucid-L2
  lucidL2Integration: boolean
  crewAIGeneration: boolean
  flowSpecExecution: boolean
  workflowVersioning: boolean

  // Video Studio
  videoStudio: boolean

  // Experimental
  aiImageGeneration: boolean
  mentionsInChat: boolean
  agentReactions: boolean

  // Avatar & Images
  imageCropping: boolean
  aiAvatarGeneration: boolean

  // Tier System
  subscriptions: boolean
  billing: boolean
  planComparison: boolean
  usageMetering: boolean
  stripeCheckout: boolean
  cryptoPayments: boolean
  billingPortal: boolean
  usageDashboard: boolean
  upgradePrompts: boolean
  monthlySubscriptions: boolean
  yearlySubscriptions: boolean
  billingPeriodToggle: boolean

  // Launchpad
  launchpad: boolean
  agentTokenization: boolean
  agentStaking: boolean

  // Mission Control
  missionControlEnabled: boolean
  humanWorkItems: boolean
  linearAgent: boolean

  // Consciousness Stream (Live Agent Introspection)
  introspectionStream: boolean

  // Hosted channel installs
  discordHosted: boolean
  slackHosted: boolean
  teamsHosted: boolean

  // Workflow + Trading (from feature-flags.ts)
  workflowsEnabled: boolean
  autonomousTrading: boolean
  tradingSolana: boolean
  tradingHyperliquid: boolean
}

// ============================================================================
// Context
// ============================================================================

const FeatureFlagsContext = createContext<ResolvedFeatureFlags | null>(null)

// ============================================================================
// Provider
// ============================================================================

export function FeatureFlagsProvider({
  flags,
  children,
}: {
  flags: ResolvedFeatureFlags
  children: ReactNode
}) {
  return (
    <FeatureFlagsContext.Provider value={flags}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Read server-resolved feature flags from context.
 * Provider is in root layout, so this works everywhere.
 */
export function useResolvedFeatureFlags(): ResolvedFeatureFlags {
  const ctx = useContext(FeatureFlagsContext)
  if (!ctx) {
    throw new Error(
      'useResolvedFeatureFlags must be used within FeatureFlagsProvider. ' +
      'This usually means the component is rendered outside the root layout.'
    )
  }
  return ctx
}

/** @deprecated Use useResolvedFeatureFlags() — provider is now in root layout. */
export const useFeatureFlagsOptional = useResolvedFeatureFlags
