/**
 * Feature Flags Configuration
 * 
 * Controls which features are enabled in the application.
 * Features can be toggled via environment variables.
 */

export const FEATURE_FLAGS = {
  WORKFLOWS_ENABLED: process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED === 'true',
  /** @deprecated Use WORKFLOWS_ENABLED — node library is part of the workflow feature */
  NODE_LIBRARY_ENABLED: process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED === 'true',
  /** Master switch for autonomous trading UI + API. Default: false in production. */
  AUTONOMOUS_TRADING: process.env.NEXT_PUBLIC_FF_AUTONOMOUS_TRADING === 'true',
  /** Enable Solana-specific trading features */
  TRADING_SOLANA: process.env.NEXT_PUBLIC_FF_TRADING_SOLANA === 'true',
  /** Enable Hyperliquid perpetuals */
  TRADING_HYPERLIQUID: process.env.NEXT_PUBLIC_FF_TRADING_HYPERLIQUID === 'true',
  /** Master switch for Agent Launchpad UI + API. Default: false in production. */
  LAUNCHPAD: process.env.NEXT_PUBLIC_FF_LAUNCHPAD === 'true',
} as const;

export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[flag];
}

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
