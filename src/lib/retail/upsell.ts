import type { RetailFleetAssistant } from './ownership'

/**
 * Retail upsell logic — pure, deterministic, easy to unit test.
 *
 * Phase 7: "Private runtime upsell triggered after 30 days OR hitting
 * shared-tier limits." We don't yet track per-user message volume on the
 * retail surface (the shared-worker usage ledger is org-scoped via
 * `agent_usage_ledger`, but wiring retail metering is out of scope for
 * this phase). For now we use **oldest agent age** as the signal: a user
 * whose first agent is older than 30 days is a "sticky" user and the
 * right moment to pitch a private runtime.
 *
 * This is deliberately conservative — we'd rather under-trigger and miss
 * a few conversions than hammer every fresh signup with an upsell.
 */
export const RETAIL_UPSELL_MIN_AGE_DAYS = 30

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Returns true if the user's retail fleet has been around long enough
 * that a private-runtime pitch is warranted. Callers should render a
 * non-blocking banner — never a modal or a hard gate.
 *
 * Pure function of the fleet rows + a `now` clock (injected so tests
 * can pin time without mocking `Date.now()`).
 */
export function shouldShowPrivateRuntimeUpsell(
  assistants: RetailFleetAssistant[],
  now: Date = new Date(),
): boolean {
  if (assistants.length === 0) return false

  let oldestMs = Infinity
  for (const a of assistants) {
    const t = Date.parse(a.createdAt)
    // Skip unparseable timestamps rather than treat them as age 0 —
    // a corrupt row shouldn't trigger an upsell on a brand-new user.
    if (Number.isNaN(t)) continue
    if (t < oldestMs) oldestMs = t
  }
  if (!Number.isFinite(oldestMs)) return false

  const ageDays = (now.getTime() - oldestMs) / MS_PER_DAY
  return ageDays >= RETAIL_UPSELL_MIN_AGE_DAYS
}
