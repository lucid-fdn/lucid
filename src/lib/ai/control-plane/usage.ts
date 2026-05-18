import 'server-only'

export function tokensUsedFromUsage(usage?: { totalTokens?: number }): number | undefined {
  return usage?.totalTokens
}
