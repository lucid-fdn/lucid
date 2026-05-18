import type { BrowserOperatorProviderKind } from '@contracts/browser-operator'

export type BrowserOperatorProviderHealth = {
  provider: BrowserOperatorProviderKind
  healthy: boolean
  successRate: number
  medianLatencyMs: number
  browserMinuteCostUsd: number
  blockedSiteRate: number
  captchaHandoffCount: number
  quotaRemaining?: number
  recentFailureCount: number
}

export type BrowserOperatorProviderScore = BrowserOperatorProviderHealth & {
  score: number
  reasons: string[]
}

export function scoreBrowserOperatorProviders(
  providers: BrowserOperatorProviderHealth[],
): BrowserOperatorProviderScore[] {
  return providers
    .map((provider) => {
      const reasons: string[] = []
      let score = 0
      if (!provider.healthy) {
        score += 1_000_000
        reasons.push('unhealthy')
      }
      if (provider.quotaRemaining === 0) {
        score += 500_000
        reasons.push('quota_exhausted')
      }
      score += provider.medianLatencyMs
      score += provider.browserMinuteCostUsd * 100_000
      score += provider.blockedSiteRate * 50_000
      score += provider.recentFailureCount * 10_000
      score += provider.captchaHandoffCount * 1000
      if (provider.successRate < 0.95) reasons.push('low_success_rate')
      if (provider.blockedSiteRate > 0.05) reasons.push('blocked_site_rate')
      return { ...provider, score: Math.round(score), reasons }
    })
    .sort((a, b) => a.score - b.score)
}
