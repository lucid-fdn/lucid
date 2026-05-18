/**
 * Feature Flags System
 *
 * Runtime-toggleable via environment variables.
 * Set FEATURE_{SCREAMING_SNAKE} = 'true' | 'false' to override any flag
 * without redeploying (e.g. FEATURE_CHAT=true in Vercel env vars).
 *
 * Defaults below are used when no env var is set.
 */

// Convert camelCase to SCREAMING_SNAKE_CASE: "videoStudio" → "VIDEO_STUDIO"
export function toEnvKey(flag: string): string {
  return `FEATURE_${flag
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()}`
}

/**
 * Read a feature flag with env var override.
 * Env var takes precedence: 'true' → true, 'false' → false, absent → default.
 */
function flag(name: string, defaultValue: boolean): boolean {
  const envVal = process.env[toEnvKey(name)]?.trim()
  if (envVal === 'true') return true
  if (envVal === 'false') return false
  return defaultValue
}

export const FEATURES = {
  // ==================
  // NAVIGATION FEATURES
  // ==================
  notifications: flag('notifications', true),
  orgSwitcher: flag('orgSwitcher', true),
  userMenu: flag('userMenu', true),
  search: flag('search', true),
  keyboardShortcuts: flag('keyboardShortcuts', true),

  // ==================
  // UI FEATURES
  // ==================
  darkMode: flag('darkMode', true),
  mobileMenu: flag('mobileMenu', true),
  scrollAnimation: flag('scrollAnimation', true),

  // ==================
  // CORE APP FEATURES
  // ==================
  // Chat & AI
  chat: flag('chat', false), // Disabled for MVP
  agents: flag('agents', true),
  agentCreation: flag('agentCreation', true),
  agentMarketplace: flag('agentMarketplace', true),

  // Marketplace
  marketplace: flag('marketplace', true),
  marketplaceAssets: flag('marketplaceAssets', true),
  marketplaceCompanies: flag('marketplaceCompanies', true),
  marketplaceContributors: flag('marketplaceContributors', true),
  marketplaceV2API: flag('marketplaceV2API', true),

  // User Features
  dashboard: flag('dashboard', true),
  profile: flag('profile', true),
  publicProfiles: flag('publicProfiles', true),
  settings: flag('settings', true),
  onboarding: flag('onboarding', true),

  // Settings Features
  advancedSecurity: flag('advancedSecurity', false), // Wallet export - off for MVP
  mfaSettings: flag('mfaSettings', true),

  // Organizations
  organizations: flag('organizations', true),
  organizationCreation: flag('organizationCreation', true),
  organizationManagement: flag('organizationManagement', true),

  // Content
  blog: flag('blog', true),

  // ==================
  // AUTH & WALLET
  // ==================
  walletLogin: flag('walletLogin', true),
  emailLogin: flag('emailLogin', true),
  googleLogin: flag('googleLogin', true),
  web3Features: flag('web3Features', true),

  // ==================
  // COMMUNICATION
  // ==================
  emailNotifications: flag('emailNotifications', true),
  browserNotifications: flag('browserNotifications', true),
  waitlist: flag('waitlist', true),
  contactForm: flag('contactForm', true),
  // Route outbound delivery through the @lucid/openclaw-runtime shim
  // instead of the hand-rolled REST senders in src/lib/db/outbound-delivery.ts.
  openclawChannelsDiscordManaged: flag('openclawChannelsDiscordManaged', true),
  openclawChannelsIMessageManaged: flag('openclawChannelsIMessageManaged', true),
  openclawChannelsTelegramManaged: flag('openclawChannelsTelegramManaged', true),
  openclawChannelsSlackManaged: flag('openclawChannelsSlackManaged', true),
  openclawChannelsTeamsManaged: flag('openclawChannelsTeamsManaged', true),
  openclawChannelsWhatsAppManaged: flag('openclawChannelsWhatsAppManaged', true),

  // ==================
  // DEVELOPMENT
  // ==================
  debugMode: flag('debugMode', process.env.NODE_ENV === 'development'),
  betaFeatures: flag('betaFeatures', false),
  advancedAnalytics: flag('advancedAnalytics', false),

  // ==================
  // SYSTEM
  // ==================
  cacheEnabled: flag('cacheEnabled', true),

  // ==================
  // WORKSPACE (Multi-Project/Env)
  // ==================
  multiProject: flag('multiProject', false),
  multiEnv: flag('multiEnv', false),
  projectSwitcher: flag('projectSwitcher', false),
  envSwitcher: flag('envSwitcher', false),

  // ==================
  // SIDEBAR FEATURES
  // ==================
  sidebarCollapsible: flag('sidebarCollapsible', true),
  sidebarFavorites: flag('sidebarFavorites', true),
  sidebarShared: flag('sidebarShared', false),
  sidebarPrivate: flag('sidebarPrivate', false),
  sidebarSearch: flag('sidebarSearch', true),
  settingsModal: flag('settingsModal', true),
  teamInDropdown: flag('teamInDropdown', true),

  // ==================
  // LUCID-L2 INTEGRATION
  // ==================
  lucidL2Integration: flag('lucidL2Integration', process.env.NEXT_PUBLIC_LUCID_L2_ENABLED === 'true'),
  crewAIGeneration: flag('crewAIGeneration', process.env.NEXT_PUBLIC_CREWAI_ENABLED === 'true'),
  flowSpecExecution: flag('flowSpecExecution', true),
  workflowVersioning: flag('workflowVersioning', true),

  // ==================
  // VIDEO STUDIO
  // ==================
  videoStudio: flag('videoStudio', true),

  // ==================
  // CONTENT STUDIO
  // ==================
  contentStudio: flag('contentStudio', true),

  // ==================
  // EXPERIMENTAL
  // ==================
  aiImageGeneration: flag('aiImageGeneration', true),
  mentionsInChat: flag('mentionsInChat', true),
  agentReactions: flag('agentReactions', true),

  // ==================
  // AVATAR & IMAGES
  // ==================
  imageCropping: flag('imageCropping', true),
  aiAvatarGeneration: flag('aiAvatarGeneration', false),

  // ==================
  // TIER SYSTEM (Subscriptions & Billing)
  // ==================
  subscriptions: flag('subscriptions', true),
  billing: flag('billing', true),
  planComparison: flag('planComparison', true),
  usageMetering: flag('usageMetering', true),
  stripeCheckout: flag('stripeCheckout', true),
  cryptoPayments: flag('cryptoPayments', true),
  billingPortal: flag('billingPortal', true),
  usageDashboard: flag('usageDashboard', true),
  upgradePrompts: flag('upgradePrompts', true),

  // Billing Period Options
  monthlySubscriptions: flag('monthlySubscriptions', true),
  yearlySubscriptions: flag('yearlySubscriptions', true),
  billingPeriodToggle: flag('billingPeriodToggle', true),

  // ==================
  // ORACLE DASHBOARD
  // ==================
  get oracleDashboard() { return flag('oracleDashboard', false) },

  // ==================
  // LAUNCHPAD
  // ==================
  get launchpad() { return flag('launchpad', false) },
  get agentTokenization() { return flag('agentTokenization', false) },
  get agentStaking() { return flag('agentStaking', false) },

  // ==================
  // MISSION CONTROL
  // ==================
  get missionControlEnabled() { return flag('missionControlEnabled', false) },
  get humanWorkItems() { return flag('humanWorkItems', false) },
  get linearAgent() { return flag('linearAgent', false) },

  // ==================
  // LUCID WORK GRAPH
  // Engine/runtime agnostic goals, Kanban, planning, checkouts, PM federation,
  // and engine facet projections. Defaults on after local smoke; keep the
  // kill switch below as the production rollback control.
  // ==================
  get workGraph() { return flag('workGraph', true) },
  get workGraphBoards() { return flag('workGraphBoards', true) },
  get workGraphGoals() { return flag('workGraphGoals', true) },
  get workGraphAiPlanning() { return flag('workGraphAiPlanning', true) },
  get workGraphExternalPmFederation() { return flag('workGraphExternalPmFederation', true) },
  get workGraphEngineFacets() { return flag('workGraphEngineFacets', true) },

  // ==================
  // CONSCIOUSNESS STREAM (Live Agent Introspection)
  // ==================
  get introspectionStream() { return flag('introspectionStream', true) },

  // ==================
  // CONSUMER RETAIL FUNNEL (Phase 1 — see docs/plans/2026-04-07-consumer-retail-funnel.md)
  // ==================
  get retailFunnel() { return flag('retailFunnel', false) },

  // ==================
  // DISCORD HOSTED BOT (v2 — shared Lucid Discord bot, C1 REST Relay)
  // Gates the hosted install card + OAuth callback + interactions webhook
  // until the Discord app repurposing (§2a) is complete. Never read on the
  // worker — hosted secrets live on Vercel only.
  // ==================
  get discordHosted() { return flag('discordHosted', false) },
  get slackHosted() { return flag('slackHosted', true) },
  get teamsHosted() { return flag('teamsHosted', false) },
  get whatsappHosted() { return flag('whatsappHosted', true) },
  get whatsappEmbeddedSignup() { return flag('whatsappEmbeddedSignup', false) },

  // ==================
  // APP SERVICE FOUNDRY
  // One-click generated AI agent service apps. Dark-launched by default.
  // ==================
  get appServiceFoundry() { return flag('appServiceFoundry', false) },
  get appRuntimeApi() { return flag('appRuntimeApi', false) },
  get appPublicApps() { return flag('appPublicApps', false) },
  get appV0Generation() { return flag('appV0Generation', false) },
  get appVercelDeploy() { return flag('appVercelDeploy', false) },
  get appMarketplacePublish() { return flag('appMarketplacePublish', false) },
  get appDedicatedRuntime() { return flag('appDedicatedRuntime', false) },

  // ==================
  // AGENT COMMERCE
  // Provider-neutral agent spend requests, Link Agents, SPTs, MPP/x402.
  // ==================
  get agentCommerce() { return flag('agentCommerce', false) },
  get agentCommerceWallets() { return flag('agentCommerceWallets', false) },
  get agentCommerceSeller() { return flag('agentCommerceSeller', false) },
} as const

export function isAppServiceKillSwitchActive(): boolean {
  return process.env.APP_SERVICE_KILL_SWITCH?.trim() === 'true'
}

export function isWorkGraphKillSwitchActive(): boolean {
  return process.env.WORK_GRAPH_KILL_SWITCH?.trim() === 'true'
}

/**
 * Check if a feature is enabled (server-side).
 * Respects env var overrides: FEATURE_VIDEO_STUDIO=false disables videoStudio
 */
export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature]
}

/**
 * Resolve all feature flags for client consumption.
 * Called once in the Server Component layout, serialized to the client via context.
 *
 * Merges FEATURES (env-overridable kill switches) + FEATURE_FLAGS (workflow/trading).
 */
export function resolveFeatureFlags(): import('@/contexts/feature-flags-context').ResolvedFeatureFlags {
  return {
    // All FEATURES flags (already resolved from env vars)
    ...FEATURES,

    // Workflow + Trading flags (from feature-flags.ts env vars, resolved server-side)
    workflowsEnabled: process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED === 'true',
    autonomousTrading: process.env.NEXT_PUBLIC_FF_AUTONOMOUS_TRADING === 'true',
    tradingSolana: process.env.NEXT_PUBLIC_FF_TRADING_SOLANA === 'true',
    tradingHyperliquid: process.env.NEXT_PUBLIC_FF_TRADING_HYPERLIQUID === 'true',
  }
}

/**
 * @deprecated Use `useResolvedFeatureFlags()` from `@/contexts/feature-flags-context` in client components.
 * This function reads env vars directly — correct on server, but returns build-time values on client.
 */
export function useFeatureFlags() {
  // In server context this reads env vars directly (correct).
  // In client context this returns build-time values (incorrect — use context hook instead).
  return FEATURES
}

// Type-safe feature flag
export type FeatureFlag = keyof typeof FEATURES
